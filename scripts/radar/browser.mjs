import {mkdirSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {accounts,canonicalPost} from './core.mjs';

// The agent never receives a Page object or an arbitrary click/evaluate command.
// These fixed methods only navigate, search and extract visible DOM text.
export class ReadBrowser {
  constructor(context,account){this.context=context;this.profile=accounts[account];this.page=null;}
  static async open(account){
    if(!accounts[account])throw Error('IDENTITY_UNAVAILABLE');
    if(process.env.RADAR_BROWSER_AUTHORIZED!=='true')throw Error('BROWSER_ACCESS_NOT_AUTHORIZED');
    const root=process.env.RADAR_PROFILE_ROOT;if(!root||!root.startsWith('/'))throw Error('PROFILE_ROOT_REQUIRED');
    // Explicit pre-approved package path; no npx, downloads or install hooks.
    const modulePath=process.env.RADAR_PLAYWRIGHT_MODULE;if(!modulePath||!modulePath.startsWith('/'))throw Error('APPROVED_PLAYWRIGHT_MODULE_REQUIRED');
    const {chromium}=await import(modulePath);
    const profile=join(resolve(root),account.replace(':','--'));mkdirSync(profile,{recursive:true,mode:0o700});chmodSync(profile,0o700);
    const channel=process.env.RADAR_BROWSER_CHANNEL??'chrome';if(!['chrome','chromium'].includes(channel))throw Error('APPROVED_BROWSER_REQUIRED');
    const context=await chromium.launchPersistentContext(profile,{channel,headless:process.env.RADAR_HEADLESS==='true',acceptDownloads:false,serviceWorkers:'block',chromiumSandbox:true});
    const browser=new ReadBrowser(context,account);browser.page=context.pages()[0]??await context.newPage();
    browser.page.setDefaultTimeout(10000);browser.page.setDefaultNavigationTimeout(15000);
    await context.route('**/*',route=>['media'].includes(route.request().resourceType())?route.abort():route.continue());
    context.on('page',p=>{if(p!==browser.page)void p.close();});
    return browser;
  }
  async close(){await this.context.close();}
  async check(){
    const url=this.page.url();const host=new URL(url).hostname;
    const expected=this.profile.platform==='threads'?['threads.com','www.threads.com']:['instagram.com','www.instagram.com'];
    if(!expected.includes(host))throw Error('LOGIN_REQUIRED');
    const visible=(await this.page.locator('body').innerText()).slice(0,30000);
    // Conservative false positives stop work, never attempt challenge completion.
    if(/captcha|challenge|checkpoint|confirm you.re human|verify you.re human|try again later|temporarily blocked|подтвердите.*человек|підтвердьте.*людина/i.test(url+' '+visible))throw Error('CHALLENGE');
    if(/\/accounts\/login|\/login/.test(url)||await this.page.locator('input[type=password]').isVisible())throw Error('LOGIN_REQUIRED');
    const nav=this.page.locator('nav,[role=navigation],aside');
    const profiles=nav.getByRole('link',{name:/^(Profile|Профиль|Профіль)$/i});
    const handles=new Set();for(let i=0;i<await profiles.count();i++){
      const a=profiles.nth(i);if(!await a.isVisible())continue;const href=await a.getAttribute('href');if(!href)continue;
      const u=new URL(href,url);if(!expected.includes(u.hostname))continue;
      const m=u.pathname.match(this.profile.platform==='threads'?/^\/@([\w.]+)\/?$/:/^\/([\w.]+)\/?$/);if(m)handles.add(m[1]);
    }
    if(handles.size!==1)throw Error('IDENTITY_UNAVAILABLE');
    if(!handles.has(this.profile.handle))throw Error('IDENTITY_MISMATCH');
    return this.profile.handle;
  }
  async home(guard){await guard();await this.page.goto(this.profile.platform==='threads'?'https://www.threads.com/':'https://www.instagram.com/',{waitUntil:'domcontentloaded'});await this.check();}
  async search(query,guard){
    await guard();await this.check();
    if(this.profile.platform==='threads'){
      await this.page.goto('https://www.threads.com/search?'+new URLSearchParams({q:query,serp_type:'default',filter:'recent'}),{waitUntil:'domcontentloaded'});
    }else{
      const search=this.page.locator('nav,[role=navigation],aside').getByRole('link',{name:/^(Search|Поиск|Пошук)$/i});
      if(await search.count()!==1)throw Error('READ_FAILED');await search.click();await guard();await this.check();
      const box=this.page.getByPlaceholder(/^(Search|Поиск|Пошук)$/i);
      if(await box.count()!==1)throw Error('READ_FAILED');await box.fill(query);
    }
    await this.check();await guard();
    // Waiting for actual result anchors avoids a fixed sleep; failure returns no invented candidates.
    const selector=this.profile.platform==='threads'?'a[href*="/post/"]':'a[href*="/p/"],a[href*="/reel/"]';
    await this.page.locator(selector).first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
    const links=await this.page.locator(selector).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.href));
    return [...new Set(links.flatMap(u=>{try{return [canonicalPost(u,this.profile.platform)];}catch{return [];}}))].slice(0,10);
  }
  async read(url,guard){
    await guard();await this.check();const canonical=canonicalPost(url,this.profile.platform);
    await this.page.goto(canonical,{waitUntil:'domcontentloaded'});const activeAccount=await this.check();await guard();
    // Require a post container. A page shell/login preview is not accepted as post evidence.
    const articles=this.page.locator('article,[role=article]');await articles.first().waitFor({state:'visible',timeout:10000});
    let article;
    for(let i=0;i<await articles.count();i++){
      const candidate=articles.nth(i);const links=await candidate.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.href));
      if(links.some(u=>{try{return canonicalPost(u,this.profile.platform)===canonical;}catch{return false;}})){article=candidate;break;}
    }
    if(!article)throw Error('READ_FAILED');
    const content=(await article.innerText()).trim();if(!content)throw Error('READ_FAILED');
    const hasVideo=await article.locator('video').count()>0;
    const time=article.locator('time').first();const publishedAt=await time.getAttribute('datetime').catch(()=>null);
    let author;
    if(this.profile.platform==='threads')author=new URL(canonical).pathname.split('/')[1].slice(1);
    else{
      const links=await article.locator('header a[href]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
      const candidates=[...new Set(links.filter(u=>/^\/[\w.]+\/?$/.test(u)).map(u=>u.split('/')[1]))];
      if(candidates.length!==1)throw Error('READ_FAILED');author=candidates[0];
    }
    return {url:canonical,activeAccount,author,publishedAt,readAt:new Date().toISOString(),text:content.slice(0,12000),replies:[],video:hasVideo?'not_viewed':'not_present',unavailable:['Comments are included only if visible in the captured post container; no complete reply extraction.','Images have not been visually interpreted.',...(hasVideo?['Video and audio have not been viewed.']:[]),...(publishedAt?[]:['Publication date unavailable.'])]};
  }
}
