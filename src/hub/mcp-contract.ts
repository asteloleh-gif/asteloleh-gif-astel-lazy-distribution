const project={type:'string',minLength:1};
const id={type:'string',pattern:'^[a-f0-9]{64}$'};
const readSchemas:Record<string,{properties:Record<string,unknown>;required:string[]}>= {
  capabilities:{properties:{projectId:project},required:['projectId']},
  inbox:{properties:{projectId:project,cursor:{type:'string'},limit:{type:'integer',minimum:1,maximum:100}},required:['projectId']},
  status:{properties:{projectId:project,planId:id},required:['projectId','planId']},
  events:{properties:{projectId:project,after:{type:'integer',minimum:0}},required:['projectId']},
  metrics:{properties:{projectId:project},required:['projectId']}
};
export function mcpDescriptor(action:string){
  const read=readSchemas[action];
  return {name:`distribution_${action}`,description:read?`Read authorized project ${action}. Never approves, schedules, publishes, or reveals credentials.`:`Scoped distribution ${action}`,
    annotations:{readOnlyHint:!!read||action==='preview',idempotentHint:!!read,destructiveHint:['schedule','cancel'].includes(action),openWorldHint:['importeditorial','review','schedule','cancel','reconcile'].includes(action)},
    inputSchema:read?{type:'object',...read,additionalProperties:false}:{type:'object',properties:{projectId:project,input:{type:'object'},planId:id,digest:id,deliveryId:id,accountKey:{type:'string'},global:{type:'boolean'}},required:['projectId']},
    outputSchema:{type:'object',additionalProperties:true}};
}
// Defense in depth: tool metadata is not an authorization or validation boundary.
export function validMcpReadArguments(action:string,args:unknown){
  const schema=readSchemas[action];if(!schema)return true;
  if(!args||typeof args!=='object'||Array.isArray(args))return false;
  const a=args as Record<string,unknown>;
  if(Object.keys(a).some(k=>!(k in schema.properties))||schema.required.some(k=>a[k]===undefined))return false;
  if(typeof a.projectId!=='string'||!a.projectId)return false;
  if(a.planId!==undefined&&(typeof a.planId!=='string'||!/^[a-f0-9]{64}$/.test(a.planId)))return false;
  if(a.cursor!==undefined&&typeof a.cursor!=='string')return false;
  if(a.after!==undefined&&(!Number.isInteger(a.after)||Number(a.after)<0))return false;
  if(a.limit!==undefined&&(!Number.isInteger(a.limit)||Number(a.limit)<1||Number(a.limit)>100))return false;
  return true;
}
