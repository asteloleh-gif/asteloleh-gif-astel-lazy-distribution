import type { ContentEnvelope, DistributionDraft } from "../core/types.js";
// Prepared-content release: deterministic packaging; metered generation unsupported.
export async function packageForPinterest(source:ContentEnvelope,targetId:string):Promise<DistributionDraft>{
  return {platform:"pinterest",targetId,title:source.title.slice(0,100),description:(source.description||`Watch this challenge on YouTube: ${source.url}`).slice(0,800),link:source.url,mediaUrl:source.thumbnailUrl};
}
