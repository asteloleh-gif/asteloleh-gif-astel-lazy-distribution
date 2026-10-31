import assert from 'node:assert/strict';
import test from 'node:test';
import { CAROUSEL_QUERY, collectFeedUrls } from '../../scripts/radar/feed-carousel.mjs';
import { runWorker } from '../../scripts/radar/worker.mjs';

const post = n => 'https://www.threads.com/@other/post/' + n;
const guard = async () => {};
function feed(screens) {
  let screen = 0;
  return {
    check: async () => 'astel.u',
    page: {
      async evaluate(fn, {action}) {
        if (action === 'scroll') {
          screen++;
          return {};
        }
        return screens[screen];
      },
      async waitForFunction() {
        if (!screens[screen]) throw Object.assign(Error('fixture: end'), {name:'TimeoutError'});
        return {jsonValue: async () => screens[screen], dispose: async () => {}};
      }
    },
    get scrollCount() { return screen; }
  };
}

test('collect visible candidates across screens, honoring checkpoint, own-account exclusions and limit', async () => {
  const browser = feed([
    {urls: [post(0), post(1), post(1) + '?tracking=1', 'https://other.test/@u/post/a',
      'https://www.threads.com/@ASTEL.U/post/a', 'https://www.threads.com/@astel.us/post/u', 'https://www.threads.com/@leoakastel/post/l', 'https://www.threads.com/@meta.ai/post/a']},
    {urls: Array.from({length:15}, (_,n) => post(n+1))}
  ]);
  const urls = await collectFeedUrls(browser, guard, [post(0)]);
  assert.deepEqual(urls, Array.from({length:9}, (_,n) => post(n+1)));
  assert.equal(browser.scrollCount, 1);
});

test('ambiguous feed, account switch and checkpoint stop before another scroll', async () => {
  for (const code of ['FOR_YOU_UNVERIFIED','FEED_ROOT_UNVERIFIED','FEED_LOCATION_UNVERIFIED']) {
    const browser = feed([{error:code}]);
    await assert.rejects(collectFeedUrls(browser, guard), {message:code});
    assert.equal(browser.scrollCount,0);
  }
  for (const code of ['IDENTITY_MISMATCH','CHALLENGE','LEASE_LOST']) {
    const browser = feed([{urls:[post(1)]}]);
    let checks=0;
    browser.check=async () => {
      if (++checks===1) return 'astel.u';
      if(code==='IDENTITY_MISMATCH')return 'astel.us';
      throw Error(code);
    };
    await assert.rejects(collectFeedUrls(browser,guard), {message:code});
    assert.equal(browser.scrollCount,0);
  }
});

test('no infinite scrolling on repeat screens or empty home', async () => {
  const repeating=feed(Array.from({length:12},()=>({urls:[post(1)]})));
  assert.deepEqual(await collectFeedUrls(repeating,guard),[post(1)]);
  assert.ok(repeating.scrollCount<=6);
  const empty=feed([{urls:[]}]);
  await assert.rejects(collectFeedUrls(empty,guard),/FEED_NO_VERIFIED_CARDS/);
});

test('normal worker entry reads feed URLs in order and closes before completing',async () => {
  const task={id:'task',account:'astel.u:threads',query:CAROUSEL_QUERY.toUpperCase(),
    checkpoint:{},state:'RUNNING',generation:1,worker:'fixture'};
  const saved=[], events=[];
  const call=async (action,payload)=>{
    events.push(action);
    switch(action){
      case 'claim':case 'heartbeat': return task;
      case 'record': saved.push(payload.evidence.url);return {};
      case 'checkpoint':return {};
      case 'complete':return {state:'COLLECTED'};
      default:throw Error('UNEXPECTED_ACTION');
    }
  };
  const browser=Object.assign(feed([{urls:[post(1),post(2)]}]), {
    home:guard, read:async url=>({url}), close:async()=>events.push('close'),
    search:async()=>assert.fail('carousel must use the feed')
  });
  assert.equal((await runWorker({call,openBrowser:async()=>browser,taskId:'task'})).state,'COLLECTED');
  assert.deepEqual(saved,[post(1),post(2)]);
  assert.ok(events.indexOf('close')<events.indexOf('complete'));
});

test('worker refuses another account and explicit URL override before opening a browser', async () => {
  for (const [account, candidateUrls, error] of [
    ['astel.us:threads',undefined,'CAROUSEL_ACCOUNT_DENIED'],
    ['astel.u:threads',[post(1)],'CAROUSEL_URL_OVERRIDE_DENIED']
  ]) {
    const calls=[];
    const call=async action=>{
      calls.push(action);
      return {query:CAROUSEL_QUERY, account,generation:1,checkpoint:{}};
    };
    await assert.rejects(runWorker({call,taskId:'t',candidateUrls,
      openBrowser:async()=>assert.fail('must stop before launch')}),{message:error});
    assert.deepEqual(calls,['claim','hold']);
  }
});

test('an unchanged viewport after a real scroll does not hide subsequent posts', async () => {
  const browser = feed([{urls:[post(1)]}, {urls:[post(1)]}, {urls:[post(2)]}]);
  const originalEvaluate = browser.page.evaluate;
  browser.page.evaluate = async (fn, args) => {
    const result = await originalEvaluate(fn, args);
    if (args.action === 'scroll') return { ...result, advanced: browser.scrollCount <= 2 };
    return result;
  };
  const originalWait = browser.page.waitForFunction;
  browser.page.waitForFunction = async (...args) => {
    if (browser.scrollCount === 1) throw Object.assign(Error('same tall card'), {name:'TimeoutError'});
    return originalWait(...args);
  };
  assert.deepEqual(await collectFeedUrls(browser,guard), [post(1),post(2)]);
});

test('one dispatcher pass takes a real Hub task, checkpoints feed evidence and exposes the local draft', async t => {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { Radar } = await import('../../scripts/radar/core.mjs');
  const { createRadarApi } = await import('../../scripts/radar/api.mjs');
  const { radarClient } = await import('../../scripts/radar/client.mjs');
  const { dispatchPendingReads } = await import('../../scripts/radar/daemon.mjs');

  const radar = new Radar(':memory:', { primaryGraceMs: 0 });
  const account = 'astel.u:threads';
  const operatorToken = 'o'.repeat(40);
  const workerToken = 'w'.repeat(40);
  const api = createRadarApi({ radar,
    credentials: [{token:operatorToken, principal:{id:'fixture-operator', role:'owner', projects:['copilot'], scopes:['status','submit']}}],
    workers: [{id:'fixture-mac', token:workerToken, accounts:[account], primary:true}]
  });
  const server = createServer(api);
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    radar.close();
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  const operator = radarClient({url, token:operatorToken});
  const worker = radarClient({url, token:workerToken});
  const payload = {account, batch:'fixture-carousel', query:CAROUSEL_QUERY};
  const {id:taskId} = await operator('create',payload);
  const two = [post(11),post(12)];
  let opens = 0, closes = 0;
  const browser = Object.assign(feed([{urls:[two[0]]},{urls:two}]), {
    home: guard, close: async () => { closes++; },
    read: async url => ({url, author:'other', activeAccount:'astel.u', text:'Fixture post ' + url,
      publishedAt:null, readAt:new Date().toISOString(), replies:[], video:'not_present', unavailable:['Replies unavailable.']})
  });
  const dispatch = () => dispatchPendingReads({call:worker,openBrowser:async active => {
    assert.equal(active,account); opens++; return browser;
  }});
  await dispatch();
  const status = await operator('status',{taskId});
  assert.equal(status.state,'COLLECTED');
  assert.deepEqual(status.checkpoint.visited,two);
  const evidence = (await operator('evidence',{taskId})).items;
  assert.deepEqual(evidence.map(row=>row.url).sort(),two);
  assert.equal((await operator('draft',{taskId, evidenceId:evidence[0].id, language:'ru',
    text:'Проверочный черновик', why:'Изолированная проверка', grounding:'read_text_only'})).status,'LOCAL_DRAFT');
  assert.equal((await operator('drafts',{taskId})).items.length,1);
  assert.equal((await operator('create',payload)).id,taskId);
  await dispatch();
  assert.equal(opens,1);
  assert.equal(closes,1);
});

test('scanFeed rejects ambiguous visible panels and waits through transient empty frames', async () => {
  const { runInNewContext } = await import('node:vm');
  const { scanFeed } = await import('../../scripts/radar/feed-carousel.mjs');
  const box = {
    checkVisibility: () => true,
    getBoundingClientRect: () => ({top:0,left:0,bottom:100,right:100,width:100,height:100})
  };
  const panel = { ...box, querySelectorAll:() => [] };
  const panels = [panel, { ...panel }];
  const root = { ...box, contains: element => panels.includes(element),
    querySelectorAll:selector=>selector==='[role="tabpanel"]' ? panels : [] };
  let controls = null;
  const tab = { ...box, closest:()=>null, innerText:'Для вас',
    getAttribute:name=>name==='aria-controls' ? controls : null };
  const context = {URL, location:{href:'https://www.threads.com/'}, window:{innerHeight:900,innerWidth:900},
    document:{querySelectorAll:selector=>selector.startsWith('[aria-selected') ? [tab] : [root],
      getElementById:id=>id==='feed' ? panel : null}};
  const run = action => runInNewContext('(' + scanFeed.toString() + ')(args)', {
    ...context, args:{action,previous:JSON.stringify([post(1)])}
  });
  assert.equal(run('read').error,'FEED_ROOT_UNVERIFIED');
  controls='feed';
  assert.equal(run('read').urls.length,0);
  assert.equal(run('wait'),false);
});
