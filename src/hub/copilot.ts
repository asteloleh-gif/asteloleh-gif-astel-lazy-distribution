import type { PlanInput } from './contract.js';
// Client mapping only. Does not alter Copilot comments, Airtable or its calendar workers.
// Approval fields / old Approved rows are deliberately not accepted by this API.
export type CopilotMaterial = Omit<PlanInput,'contractVersion'|'source'> & {sourceRecordId:string};
export function fromCopilot(material:CopilotMaterial):PlanInput {
  const {sourceRecordId,...prepared}=material;
  return { ...prepared,contractVersion:1,source:{producer:'copilot',reference:sourceRecordId} };
}
