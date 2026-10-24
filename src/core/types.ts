export type ContentEnvelope = {
  source: string;
  id: string;
  url: string;
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  thumbnailUrl: string;
  publishedAt?: string;
  durationSeconds?: number;
  author?: string;
  visibility?: string;
};

export type DistributionDraft = {
  platform: string;
  targetId: string;
  title: string;
  description: string;
  link: string;
  mediaUrl: string;
};

export interface SourceConnector<TInput> {
  readonly name: string;
  load(input: TInput): Promise<ContentEnvelope>;
}

export interface RecentSourceConnector<TInput = { limit?: number }> {
  readonly name: string;
  listRecent(input?: TInput): Promise<ContentEnvelope[]>;
}

export interface DestinationConnector {
  readonly name: string;
  publish(draft: DistributionDraft): Promise<unknown>;
}

// Versioned shared hub contract; legacy connector types remain compatible.
export type { PlanInput, Target, Asset, Receipt, Route, State } from "../hub/contract.js";
