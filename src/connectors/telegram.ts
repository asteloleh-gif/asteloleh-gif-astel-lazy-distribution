import type { DestinationConnector, DistributionDraft } from "../core/types.js";

export class TelegramDestination implements DestinationConnector {
  readonly name = "telegram";

  constructor(private readonly botToken: string) {}

  async publish(draft: DistributionDraft): Promise<unknown> {
    if (!draft.targetId) throw new Error("Telegram chat/channel id is required");

    const text = [draft.title, draft.description, draft.link]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4096);

    const res = await fetch(
      `https://api.telegram.org/bot${this.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: draft.targetId,
          text,
          disable_notification: false
        })
      }
    );

    const body = await res.text();
    let parsed: any = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      throw new Error(`Telegram API returned invalid JSON: ${res.status}`);
    }

    if (!res.ok || parsed?.ok === false) {
      throw new Error(
        `Telegram API failed: ${res.status} ${parsed?.description ?? body}`
      );
    }

    return parsed;
  }
}
