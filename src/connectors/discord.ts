import type { DestinationConnector, DistributionDraft } from "../core/types.js";

export class DiscordDestination implements DestinationConnector {
  readonly name = "discord";

  constructor(private readonly webhookUrl: string) {}

  async publish(draft: DistributionDraft): Promise<unknown> {
    const url = new URL(this.webhookUrl);
    if (!["discord.com", "discordapp.com"].includes(url.hostname)) {
      throw new Error("Discord webhook URL must use a Discord domain");
    }

    url.searchParams.set("wait", "true");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: draft.link,
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: draft.title.slice(0, 256),
            description: draft.description.slice(0, 2048),
            url: draft.link,
            ...(draft.mediaUrl ? { image: { url: draft.mediaUrl } } : {})
          }
        ]
      })
    });

    const body = await res.text();
    if (!res.ok) throw new Error(`Discord webhook failed: ${res.status} ${body}`);
    return body ? JSON.parse(body) : {};
  }
}
