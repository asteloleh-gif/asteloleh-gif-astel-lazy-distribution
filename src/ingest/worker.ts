import { createHash } from 'node:crypto';
import { YouTubeSource } from '../connectors/youtube.js';
import { PinterestDestination } from '../connectors/pinterest.js';
import { withJournal, IngestError } from './store.js';

function configuration() {
  if (process.env.INGEST_ENABLED !== 'true') throw new IngestError(409, 'ingestion is disabled');
  const channel = process.env.YOUTUBE_CHANNEL_ID ?? '';
  const board = process.env.PINTEREST_BOARD_ID ?? '';
  const account = process.env.PINTEREST_ACCOUNT_USERNAME ?? '';
  const since = process.env.INGEST_START_AFTER ?? '';
  const environment = process.env.PINTEREST_ENV;
  if (!channel || !board || !account || !/^\d{4}-\d\d-\d\dT/.test(since) || !Number.isFinite(Date.parse(since)) || !['sandbox','production'].includes(environment ?? '')) {
    throw new IngestError(503, 'explicit channel, account, board, start date and Pinterest environment required');
  }
  const binding = JSON.stringify([channel, account, board, environment, since]);
  return {channel,board,account,since,environment: environment as 'sandbox'|'production',binding,directory:process.env.INGEST_STORAGE_DIR ?? ''};
}
async function youtube(path: string, params: Record<string,string>) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [key,value] of Object.entries({...params,key:process.env.YOUTUBE_API_KEY ?? ''})) url.searchParams.set(key,value);
  const res = await fetch(url, {signal:AbortSignal.timeout(30000)});
  if (!res.ok) throw new IngestError(502,'YouTube discovery failed');
  return await res.json() as any;
}
async function discover(channel: string, since: string) {
  if (!process.env.YOUTUBE_API_KEY) throw new IngestError(503,'YouTube access is not configured');
  const channels = await youtube('channels',{part:'contentDetails',id:channel});
  const record = channels.items?.find((c:any) => c.id === channel);
  const playlist = record?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlist) throw new IngestError(502,'channel uploads playlist unavailable');
  const ids = new Set<string>();
  let token = '';
  // Full bounded scan, not a fragile high-watermark or recent-15 RSS feed.
  // Do not publish a partial scan when the configured channel exceeds this cap.
  for (let page=0; page<20; page++) {
    const data = await youtube('playlistItems',{part:'contentDetails',playlistId:playlist,maxResults:'50',...(token?{pageToken:token}:{})});
    if (!Array.isArray(data.items)) throw new IngestError(502,'invalid discovery response');
    for (const item of data.items) {
      const {videoId,videoPublishedAt} = item.contentDetails ?? {};
      if (typeof videoId === 'string' && Date.parse(videoPublishedAt) > Date.parse(since)) ids.add(videoId);
    }
    token = data.nextPageToken ?? '';
    if (!token) return [...ids];
  }
  throw new IngestError(409,'discovery exceeds 1000 items; no partial scan will be published');
}
export async function ingestRun() {
  const config = configuration();
  return withJournal(config.directory,config.binding,async (journal,save) => {
    for (const videoId of await discover(config.channel,config.since)) {
      const id = createHash('sha256').update(JSON.stringify([config.channel,config.account,config.board,config.environment,videoId])).digest('hex');
      if (!journal.jobs[id]) journal.jobs[id] = {id,videoId,state:'queued'};
    }
    await save();
    const live = process.env.INGEST_LIVE_ENABLED === 'true' && process.env.PUBLISH_ENABLED === 'true';
    if (live) {
      if (!process.env.PINTEREST_ACCESS_TOKEN) throw new IngestError(503,'Pinterest access is not configured');
      const destination = new PinterestDestination(process.env.PINTEREST_ACCESS_TOKEN,config.environment);
      // Verify destination identity and board before a write. Never create a board.
      await destination.verifyTarget(config.account,config.board);
      for (const job of Object.values(journal.jobs)) {
        if (job.state !== 'queued') continue;
        const source = await new YouTubeSource(process.env.YOUTUBE_API_KEY!).load({url:`https://www.youtube.com/watch?v=${job.videoId}`});
        if (source.author !== config.channel || source.visibility !== 'public' || !source.publishedAt || Date.parse(source.publishedAt) <= Date.parse(config.since)) {
          throw new IngestError(409,'video channel, visibility or publication date does not match');
        }
        // Deterministic packaging: no AI calls/costs from this worker.
        job.draft = {platform:'pinterest',targetId:config.board,title:source.title.slice(0,100),description:source.description.slice(0,800),link:source.url,mediaUrl:source.thumbnailUrl};
        job.state = 'sending';
        await save(); // Persist intent BEFORE the first potentially stateful request.
        try {
          const pin = await destination.publish(job.draft) as any;
          if (!pin || typeof pin.id !== 'string' || !pin.id) throw new Error('missing Pin id');
          job.pinId = pin.id; job.state = 'published';
        } catch { job.state = 'unknown'; }
        await save(); // If this fails, stored 'sending' recovers to 'unknown'.
      }
    }
    return {mode:live?'live':'queued-only', jobs:Object.values(journal.jobs)};
  });
}
export async function ingestStatus() {
  const config=configuration();
  return withJournal(config.directory,config.binding,async journal=>({jobs:Object.values(journal.jobs)}));
}
export async function ingestReconcile(id: string, pinId: string) {
  const config=configuration();
  return withJournal(config.directory,config.binding,async(journal,save)=>{
    const job=journal.jobs[id];
    if (!job || job.state!=='unknown' || !job.draft || !/^\d+$/.test(pinId)) throw new IngestError(409,'unknown job and explicit numeric Pin id required');
    if (!process.env.PINTEREST_ACCESS_TOKEN) throw new IngestError(503,'Pinterest access is not configured');
    const destination=new PinterestDestination(process.env.PINTEREST_ACCESS_TOKEN,config.environment);
    await destination.verifyTarget(config.account,config.board);
    const pin=await destination.getPin(pinId);
    if (String(pin.id)!==pinId || String(pin.board_id)!==config.board || pin.link!==job.draft.link) throw new IngestError(409,'Pin does not match the recorded destination and source');
    job.state='published';job.pinId=pinId;await save();return {job};
  });
}
export function startIngestScheduler() {
  if (process.env.INGEST_ENABLED !== 'true' || process.env.INGEST_SCHEDULE_ENABLED !== 'true') return;
  const seconds=Number(process.env.INGEST_INTERVAL_SECONDS ?? 900);
  if (!Number.isFinite(seconds) || seconds<60) throw new Error('ingest interval must be at least 60 seconds');
  let busy=false;
  const timer=setInterval(async()=>{
    if (busy) return;
    busy=true;
    try { await ingestRun(); } catch { console.error('ingest tick failed; inspect authenticated status and storage'); }
    finally { busy=false; }
  },seconds*1000);
  timer.unref();return timer;
}
