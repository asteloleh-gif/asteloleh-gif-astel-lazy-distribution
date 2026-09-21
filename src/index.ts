import { createServer } from "node:http";
import { YouTubeSource } from "./connectors/youtube.js";
import { PinterestDestination } from "./connectors/pinterest.js";
import { packageForPinterest } from "./ai/pinterest-packager.js";

const port = Number(process.env.PORT || 8080);

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");

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

    if (req.method === "GET" && requestUrl.pathname === "/api/preview") {
      const youtubeUrl = requestUrl.searchParams.get("youtubeUrl") ?? "";
      const boardId = requestUrl.searchParams.get("boardId") ?? process.env.PINTEREST_BOARD_ID ?? "";
      return handlePreview(res, youtubeUrl, boardId);
    }

    if (req.method === "POST" && (requestUrl.pathname === "/api/preview" || requestUrl.pathname === "/api/publish")) {
      const body = await readJson(req);
      const youtubeUrl = String(body.youtubeUrl ?? "");
      const boardId = String(body.boardId ?? process.env.PINTEREST_BOARD_ID ?? "");

      if (requestUrl.pathname === "/api/preview") {
        return handlePreview(res, youtubeUrl, boardId);
      }

      if (!youtubeUrl) return json(res, 400, { error: "youtubeUrl is required" });
      if (!process.env.YOUTUBE_API_KEY) return json(res, 500, { error: "YOUTUBE_API_KEY is not configured" });

      const source = await new YouTubeSource(process.env.YOUTUBE_API_KEY).load({ url: youtubeUrl });
      const draft = await packageForPinterest(source, boardId);

      if (process.env.PUBLISH_ENABLED !== "true") {
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

async function handlePreview(res: any, youtubeUrl: string, boardId: string) {
  if (!youtubeUrl) return json(res, 400, { error: "youtubeUrl is required" });
  if (!process.env.YOUTUBE_API_KEY) return json(res, 500, { error: "YOUTUBE_API_KEY is not configured" });

  const source = await new YouTubeSource(process.env.YOUTUBE_API_KEY).load({ url: youtubeUrl });
  const draft = await packageForPinterest(source, boardId);
  return json(res, 200, { mode: "preview", source, draft });
}

server.listen(port, "0.0.0.0", () => {
  console.log(`astel-lazy-distribution listening on :${port}`);
});

function json(res: any, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function html(res: any, status: number, body: string) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

async function readJson(req: any): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
