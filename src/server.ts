import { hubApi, readBoundedJson } from "./hub/api.js";
import type { DistributionHub } from "./hub/service.js";
import type { Credential } from "./hub/contract.js";
import { HubError } from "./hub/contract.js";
import { createServer } from "node:http";
import { YouTubeSource } from "./connectors/youtube.js";
import { PinterestDestination } from "./connectors/pinterest.js";
import { packageForPinterest } from "./ai/pinterest-packager.js";
import {VideoWorkspace,videoWorkspaceApi} from './hub/video-workspace.js';

export function createAppServer(options: {hub?: DistributionHub; credentials?: Credential[]; radar?: (req: import('node:http').IncomingMessage,res: import('node:http').ServerResponse)=>Promise<void>} = {}) {
const control=hubApi(options.hub,options.credentials??[]);
const video=videoWorkspaceApi(options.hub&&process.env.VIDEO_WORKSPACE_ENABLED==='true'?new VideoWorkspace(options.hub):undefined,options.credentials??[]);
let legacyWindow=Date.now(),legacyRequests=0;
return createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    if(requestUrl.pathname.startsWith('/api/video-workspace/'))return await video(req,res);

    if(requestUrl.pathname.startsWith('/api/radar/')) {
      if(!options.radar)return json(res,503,{error:'RADAR_DISABLED'});
      return await options.radar(req,res);
    }

    if (requestUrl.pathname.startsWith("/api/distribution/") || requestUrl.pathname === "/mcp") return await control(req,res);

    if (req.method === "GET" && requestUrl.pathname === "/health") {
      return json(res, 200, { ok: true, service: "astel-lazy-distribution" });
    }

    if (req.method === "GET" && requestUrl.pathname === "/") {
      return html(res, 200, `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Astel Lazy Distribution</title></head>
<body style="font-family:system-ui;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.55">
<h1>Astel Lazy Distribution</h1>
<p>Internal content distribution tool for Astel Family. It repackages our own published YouTube content for Pinterest and other supported channels.</p>
<p><a href="/privacy">Privacy Policy</a></p>
</body></html>`);
    }

    if (req.method === "GET" && requestUrl.pathname === "/privacy") {
      return html(res, 200, `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy — Astel Lazy Distribution</title></head>
<body style="font-family:system-ui;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.55">
<h1>Privacy Policy</h1>
<p><strong>Effective date:</strong> September 20, 2026</p>
<p>Astel Lazy Distribution is an internal tool used by Astel Family to distribute our own content between connected platforms such as YouTube and Pinterest.</p>
<h2>Data we process</h2>
<p>The app may process public YouTube metadata such as video titles, descriptions, tags, thumbnails, URLs and publication dates. When a Pinterest account is connected, the app may process account-authorized data needed to read boards, create Pins and read reporting data.</p>
<h2>How we use data</h2>
<p>Data is used only to prepare, publish, measure and improve distribution of our own content. We do not sell personal information and we do not use Pinterest data for advertising profiles.</p>
<h2>Credentials</h2>
<p>API credentials and access tokens are used only to authenticate requests to connected services and are not intentionally exposed publicly.</p>
<h2>Sharing</h2>
<p>Data may be processed by infrastructure and API providers required to operate the app, including hosting, YouTube, Pinterest and AI services used for content formatting.</p>
<h2>Retention and deletion</h2>
<p>Connected-account data is retained only as needed to operate the tool. Access can be revoked by disconnecting the relevant platform account or revoking the app authorization. Deletion requests can be sent to family.astel@gmail.com.</p>
<h2>Contact</h2>
<p>Questions about this policy: family.astel@gmail.com</p>
</body></html>`);
    }

    // Retire the legacy state-changing GET; never call its connectors.
    if (requestUrl.pathname === "/api/pinterest/sandbox-smoke") {
      return json(res, 410, { error: "sandbox smoke endpoint is disabled" });
    }

    // Fail closed before parsing input or invoking YouTube, AI, or Pinterest.
    if (requestUrl.pathname.startsWith("/api/")) {
      const expected = process.env.DISTRIBUTION_API_KEY;
      if (!expected) return json(res, 503, { error: "API access is not configured" });
      if (req.headers.authorization !== `Bearer ${expected}`) {
        return json(res, 403, { error: "forbidden" });
      }
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      if(Date.now()-legacyWindow>=60000){legacyWindow=Date.now();legacyRequests=0;}
      if(++legacyRequests>30)return json(res,429,{error:"RATE_LIMITED"});
    }

    // Legacy direct writes cannot bypass the shared exact-version approval.
    if (requestUrl.pathname.startsWith("/api/ingest/") || requestUrl.pathname === "/api/publish") {
      return json(res, 410, {error:"use scoped distribution hub"});
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/pinterest/sandbox-check") {
      if (process.env.PINTEREST_ENV !== "sandbox") return json(res, 200, { ok: false, error: "Pinterest sandbox mode is required" });
      if (!process.env.PINTEREST_ACCESS_TOKEN) return json(res, 200, { ok: false, error: "PINTEREST_ACCESS_TOKEN is not configured" });

      try {
        const pinterest = new PinterestDestination(process.env.PINTEREST_ACCESS_TOKEN, "sandbox");
        const boards = await pinterest.listBoards();
        return json(res, 200, { ok: true, boards });
      } catch (error) {
        return json(res, 200, { ok: false, error: "upstream request failed" });
      }
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/preview") {
      return json(res, 405, {error:"POST preview required"});
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/preview") {
      const body = await readBoundedJson(req);
      return await handlePreview(res, String(body.youtubeUrl ?? ""), String(body.boardId ?? ""));
    }

    return json(res, 404, { error: "not found" });
  } catch (error) {
    if (error instanceof HubError) return json(res, error.status, { error: error.code });
    return json(res, 500, { error: "upstream request failed" });
  }
});
}

async function handlePreview(res: any, youtubeUrl: string, boardId: string) {
  if (!youtubeUrl) return json(res, 400, { error: "youtubeUrl is required" });
  if (!process.env.YOUTUBE_API_KEY) return json(res, 500, { error: "YOUTUBE_API_KEY is not configured" });

  const source = await new YouTubeSource(process.env.YOUTUBE_API_KEY).load({ url: youtubeUrl });
  const draft = await packageForPinterest(source, boardId);
  return json(res, 200, { mode: "preview", source, draft });
}


function json(res: any, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function html(res: any, status: number, body: string) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}
