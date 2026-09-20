import { createServer } from "node:http";
import { YouTubeSource } from "./connectors/youtube.js";
import { PinterestDestination } from "./connectors/pinterest.js";
import { packageForPinterest } from "./ai/pinterest-packager.js";

const port = Number(process.env.PORT || 8080);

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true, service: "astel-lazy-distribution" });
    }

    if (req.method === "POST" && (req.url === "/api/preview" || req.url === "/api/publish")) {
      const body = await readJson(req);
      const youtubeUrl = String(body.youtubeUrl ?? "");
      const boardId = String(body.boardId ?? process.env.PINTEREST_BOARD_ID ?? "");

      if (!youtubeUrl) return json(res, 400, { error: "youtubeUrl is required" });
      if (!process.env.YOUTUBE_API_KEY) return json(res, 500, { error: "YOUTUBE_API_KEY is not configured" });

      const source = await new YouTubeSource(process.env.YOUTUBE_API_KEY).load({ url: youtubeUrl });
      const draft = await packageForPinterest(source, boardId);

      if (req.url === "/api/preview" || process.env.PUBLISH_ENABLED !== "true") {
        return json(res, 200, { mode: "preview", source, draft });
      }

      if (!process.env.PINTEREST_ACCESS_TOKEN) {
        return json(res, 500, { error: "PINTEREST_ACCESS_TOKEN is not configured", draft });
      }

      const published = await new PinterestDestination(process.env.PINTEREST_ACCESS_TOKEN).publish(draft);
      return json(res, 200, { mode: "published", source, draft, published });
    }

    return json(res, 404, { error: "not found" });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`astel-lazy-distribution listening on :${port}`);
});

function json(res: any, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readJson(req: any): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
