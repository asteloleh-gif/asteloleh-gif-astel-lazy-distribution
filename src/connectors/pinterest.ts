import type { DestinationConnector, DistributionDraft } from "../core/types.js";

export class PinterestDestination implements DestinationConnector {
  readonly name = "pinterest";

  constructor(
    private readonly accessToken: string,
    private readonly environment: "production" | "sandbox" = "production"
  ) {}

  private apiBase() {
    return this.environment === "sandbox"
      ? "https://api-sandbox.pinterest.com/v5"
      : "https://api.pinterest.com/v5";
  }

  private async read(path: string): Promise<any> {
    const res = await fetch(`${this.apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) throw new Error("Pinterest verification failed");
    return res.json();
  }

  async verifyTarget(username: string, boardId: string) {
    const account = await this.read("/user_account");
    const board = await this.read(`/boards/${encodeURIComponent(boardId)}`);
    if (account.username !== username || String(board.id) !== boardId || board.owner?.username !== username) {
      throw new Error("Pinterest target mismatch");
    }
  }

  async getPin(pinId: string): Promise<any> {
    return this.read(`/pins/${encodeURIComponent(pinId)}`);
  }

  async listBoards(): Promise<any> {
    const res = await fetch(`${this.apiBase()}/boards?page_size=250`, {
      headers: {
        "Authorization": `Bearer ${this.accessToken}`,
        "Content-Type": "application/json"
      }
    });

    const body = await res.text();
    if (!res.ok) throw new Error(`Pinterest list boards failed: ${res.status} ${body}`);
    return body ? JSON.parse(body) : {};
  }

  async createBoard(name: string): Promise<any> {
    const res = await fetch(`${this.apiBase()}/boards`, {
      method: "POST",
      signal: AbortSignal.timeout(30000),
      headers: {
        "Authorization": `Bearer ${this.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name })
    });

    const body = await res.text();
    if (!res.ok) throw new Error(`Pinterest create board failed: ${res.status} ${body}`);
    return body ? JSON.parse(body) : {};
  }

  async publish(draft: DistributionDraft): Promise<unknown> {
    if (!draft.targetId) throw new Error("Pinterest board ID is required");
    if (!draft.mediaUrl) throw new Error("Pinterest image URL is required");

    const image = await fetch(draft.mediaUrl, {signal: AbortSignal.timeout(30000)});
    if (!image.ok) throw new Error(`Thumbnail download failed: ${image.status}`);

    const contentType = image.headers.get("content-type") || "image/jpeg";
    const data = Buffer.from(await image.arrayBuffer()).toString("base64");

    const res = await fetch(`${this.apiBase()}/pins`, {
      method: "POST",
      signal: AbortSignal.timeout(30000),
      headers: {
        "Authorization": `Bearer ${this.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        board_id: draft.targetId,
        title: draft.title,
        description: draft.description,
        link: draft.link,
        media_source: {
          source_type: "image_base64",
          content_type: contentType,
          data
        }
      })
    });

    const body = await res.text();
    if (!res.ok) throw new Error(`Pinterest API failed: ${res.status} ${body}`);
    return body ? JSON.parse(body) : {};
  }
}
