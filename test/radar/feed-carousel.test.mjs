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
      'https://www.threads.com/@ASTEL.U/post/a', 'https://www.threads.com/@meta.ai/post/a']},
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
