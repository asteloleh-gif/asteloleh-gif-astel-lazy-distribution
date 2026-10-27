import {fail} from './contract.js';
import type {Asset,Variant} from './contract.js';
export type InstagramOptions={type:'post'|'reel'|'story';publishing?:'automatic'|'notification';shareToFeed?:boolean;firstComment?:string;isAiGenerated?:boolean;geolocation?:{id:string;text?:string};stickers?:{music?:string;text?:string;products?:string;topics?:string;other?:string}};
const only=(o:any,k:string[])=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(x=>!k.includes(x)))fail('INSTAGRAM_OPTION_INVALID',400);};
export function assetIndices(v:Variant):number[]{return v.assetIndices??(v.asset===undefined?[]:[v.asset]);}
export function instagramVariant(v:Variant,assets:Asset[]){
 const indices=assetIndices(v);if(v.asset!==undefined&&v.assetIndices!==undefined)fail('INSTAGRAM_ASSET_SELECTION_CONFLICT',400);
 if(!Array.isArray(indices)||!indices.length||indices.length>10||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||!assets[i]))fail('INSTAGRAM_ASSET_SELECTION_INVALID',400);
 const selected=indices.map(i=>assets[i]);const o=v.instagram;
 if(o!==undefined){only(o,['type','publishing','shareToFeed','firstComment','isAiGenerated','geolocation','stickers']);if(!['post','reel','story'].includes(o.type)||o.publishing!==undefined&&!['automatic','notification'].includes(o.publishing))fail('INSTAGRAM_OPTION_INVALID',400);
  for(const k of ['shareToFeed','isAiGenerated'] as const)if(o[k]!==undefined&&typeof o[k]!=='boolean')fail('INSTAGRAM_OPTION_INVALID',400);
  if(o.firstComment!==undefined&&(typeof o.firstComment!=='string'||!o.firstComment.length||o.firstComment.length>2200))fail('INSTAGRAM_OPTION_INVALID',400);
  if(o.geolocation){only(o.geolocation,['id','text']);if(typeof o.geolocation.id!=='string'||!/^\d+$/.test(o.geolocation.id)||o.geolocation.text!==undefined&&(typeof o.geolocation.text!=='string'||o.geolocation.text.length>200))fail('INSTAGRAM_OPTION_INVALID',400);}
  if(o.stickers){only(o.stickers,['music','text','products','topics','other']);if(Object.values(o.stickers).some(x=>typeof x!=='string'||!x.length||x.length>1000)||!Object.keys(o.stickers).length)fail('INSTAGRAM_OPTION_INVALID',400);if(o.publishing!=='notification')fail('INSTAGRAM_INTERACTIVE_REQUIRES_NOTIFICATION',400);}
 }
 const type=o?.type??(selected.length===1&&selected[0].kind==='reel'?'reel':'post');const publishing=o?.publishing??'automatic';
 if(type==='reel'&&(selected.length!==1||selected[0].kind==='image'))fail('INSTAGRAM_REEL_ONE_VIDEO_REQUIRED',400);
 if(type==='post'&&(selected.length===1&&selected[0].kind!=='image'))fail('INSTAGRAM_SINGLE_VIDEO_REQUIRES_REEL',400);
 if(type==='story'&&(o?.firstComment!==undefined||o?.geolocation!==undefined||o?.shareToFeed!==undefined||selected.some(a=>a.userTags?.length||a.altText!==undefined||a.thumbnailOffset!==undefined)))fail('INSTAGRAM_STORY_OPTION_DENIED',400);
 if(type==='story'&&publishing==='automatic'&&v.text!=='')fail('INSTAGRAM_STORY_TEXT_REQUIRES_NOTIFICATION',400);
 if(o?.shareToFeed!==undefined&&type!=='reel')fail('INSTAGRAM_SHARE_FEED_REEL_ONLY',400);
 if(typeof v.text!=='string'||[...v.text].length>2200||!v.text.length&&type!=='story')fail('INSTAGRAM_CAPTION_INVALID',400);
 return {selected,type,publishing,options:o};
}
export function instagramPayload(v:Variant,assets:Asset[]){
 const {selected,type,publishing,options:o}=instagramVariant(v,assets);
 return {assets:selected.map(a=>a.kind==='image'?{image:{url:a.url,...(a.altText!==undefined||a.userTags!==undefined?{metadata:{altText:a.altText??'',...(a.userTags?{userTags:a.userTags}:{})}}:{})}}:{video:{url:a.url,...(a.thumbnailOffset!==undefined?{metadata:{thumbnailOffset:a.thumbnailOffset}}:{})}}),
 metadata:{instagram:{type,shouldShareToFeed:type==='story'?false:(o?.shareToFeed??true),...(o?.firstComment?{firstComment:o.firstComment}:{}),...(o?.isAiGenerated!==undefined?{isAiGenerated:o.isAiGenerated}:{}),...(o?.geolocation?{geolocation:o.geolocation}:{}),...(o?.stickers?{stickerFields:o.stickers}:{})}},schedulingType:publishing};
}
