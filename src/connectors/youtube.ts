import type { ContentEnvelope, SourceConnector } from "../core/types.js";

type YouTubeInput = { url: string };

export class YouTubeSource implements SourceConnector<YouTubeInput> {
  readonly name = "youtube";

  constructor(private readonly apiKey: string) {}

  async load(input: YouTubeInput): Promise<ContentEnvelope> {
    const id = extractVideoId(input.url);
    if (!id) throw new Error("Unsupported YouTube URL");

    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("id", id);
    url.searchParams.set("key", this.apiKey);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube API failed: ${res.status} ${await res.text()}`);

    const data = await res.json() as any;
    const video = data.items?.[0];
    if (!video) throw new Error("YouTube video not found");

    const s = video.snippet ?? {};
    const text = `${s.title ?? ""} ${s.description ?? ""}`;

    return {
      source: this.name,
      id,
      url: `https://www.youtube.com/shorts/${id}`,
      title: s.title ?? "",
      description: s.description ?? "",
      tags: Array.isArray(s.tags) ? s.tags : [],
      hashtags: [...new Set(text.match(/#[\p{L}\p{N}_-]+/gu) ?? [])],
      thumbnailUrl:
        s.thumbnails?.maxres?.url ??
        s.thumbnails?.standard?.url ??
        s.thumbnails?.high?.url ??
        s.thumbnails?.medium?.url ??
        s.thumbnails?.default?.url ??
        "",
      publishedAt: s.publishedAt
    };
  }
}

export function extractVideoId(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] ?? null;
    if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] ?? null;
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}
