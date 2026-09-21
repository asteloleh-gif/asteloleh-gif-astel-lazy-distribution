import type {
  ContentEnvelope,
  RecentSourceConnector,
  SourceConnector
} from "../core/types.js";

type TikTokInput = { id?: string; url?: string };
type TikTokRecentInput = { maxCount?: number; cursor?: number };

type TikTokVideo = {
  id: string;
  title?: string;
  video_description?: string;
  create_time?: number;
  cover_image_url?: string;
  share_url?: string;
  duration?: number;
};

const FIELDS = [
  "id",
  "title",
  "video_description",
  "create_time",
  "cover_image_url",
  "share_url",
  "duration"
].join(",");

export class TikTokSource
  implements
    SourceConnector<TikTokInput>,
    RecentSourceConnector<TikTokRecentInput>
{
  readonly name = "tiktok";

  constructor(private readonly accessToken: string) {}

  async load(input: TikTokInput): Promise<ContentEnvelope> {
    const id = input.id ?? extractTikTokVideoId(input.url ?? "");
    if (!id) throw new Error("TikTok video id or supported TikTok URL is required");

    const data = await this.request(
      `https://open.tiktokapis.com/v2/video/query/?fields=${encodeURIComponent(FIELDS)}`,
      {
        filters: { video_ids: [id] }
      }
    );

    const video = data?.videos?.[0] as TikTokVideo | undefined;
    if (!video) throw new Error("TikTok video not found for the authorized account");

    return toEnvelope(video);
  }

  async listRecent(input: TikTokRecentInput = {}): Promise<ContentEnvelope[]> {
    const maxCount = Math.min(Math.max(input.maxCount ?? 10, 1), 20);
    const body: Record<string, number> = { max_count: maxCount };
    if (input.cursor) body.cursor = input.cursor;

    const data = await this.request(
      `https://open.tiktokapis.com/v2/video/list/?fields=${encodeURIComponent(FIELDS)}`,
      body
    );

    return (Array.isArray(data?.videos) ? data.videos : []).map((video: TikTokVideo) =>
      toEnvelope(video)
    );
  }

  private async request(url: string, body: unknown): Promise<any> {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const raw = await res.text();
    let parsed: any = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`TikTok API returned invalid JSON: ${res.status}`);
    }

    if (!res.ok) {
      throw new Error(
        `TikTok API failed: ${res.status} ${parsed?.error?.message ?? raw}`
      );
    }

    if (parsed?.error?.code && parsed.error.code !== "ok") {
      throw new Error(
        `TikTok API failed: ${parsed.error.code} ${parsed.error.message ?? ""}`.trim()
      );
    }

    return parsed?.data ?? {};
  }
}

export function extractTikTokVideoId(raw: string): string | null {
  if (!raw) return null;
  const match = raw.match(/\/video\/(\d+)/);
  return match?.[1] ?? null;
}

function toEnvelope(video: TikTokVideo): ContentEnvelope {
  const title = video.title?.trim() || video.video_description?.trim() || "";
  const description = video.video_description?.trim() || "";
  const text = `${title} ${description}`;

  return {
    source: "tiktok",
    id: String(video.id),
    url: video.share_url || `https://www.tiktok.com/video/${video.id}`,
    title,
    description,
    tags: [],
    hashtags: [...new Set(text.match(/#[\p{L}\p{N}_-]+/gu) ?? [])],
    thumbnailUrl: video.cover_image_url || "",
    publishedAt: video.create_time
      ? new Date(video.create_time * 1000).toISOString()
      : undefined,
    durationSeconds: video.duration
  };
}
