// Run on a machine with the previously approved Chromium and Playwright module.
// An ephemeral context receives only fixture responses. It never opens a saved
// social profile or calls the Hub, and holds no operator/worker credentials.
import assert from 'node:assert/strict';
import { collectFeedUrls, scanFeed } from '../../../scripts/radar/feed-carousel.mjs';

const modulePath = process.env.RADAR_PLAYWRIGHT_MODULE;
if (!modulePath?.startsWith('/')) throw Error('APPROVED_PLAYWRIGHT_MODULE_REQUIRED');
const { chromium } = await import(modulePath);
const channel = process.env.RADAR_BROWSER_CHANNEL || 'chromium';
if (!['chrome', 'chromium'].includes(channel)) throw Error('APPROVED_BROWSER_REQUIRED');
const engine = await chromium.launch({channel, chromiumSandbox:true, headless:true});
try {
  const context = await engine.newContext({viewport:{width:900,height:700}, serviceWorkers:'block'});
  const post = (handle, id) => '<a href="/@' + handle + '/post/' + id + '"><time>now</time></a>';
  const card = (handle, id, extra='') => '<div data-pressable-container="true">' + post(handle,id) + extra + '</div>';
  const cards = card('other','A','<article>' + post('quoted','Q') + '</article>') +
    '<aside>' + card('sidebar','S') + '</aside>' +
    card('ambiguous','X',post('ambiguous','Y')) +
    card('astel.u','SELF') + card('other','A') +
    '<div style="display:none">' + card('hidden','H') + '</div>' +
    '<div style="height:900px"></div>' + card('other','B');
  const fixture = '<!doctype html><link rel="icon" href="data:,"><style>header{position:sticky;top:0} main{display:flex} section{width:50%}</style>' +
    '<header><button aria-selected="true" aria-controls="home">Для вас</button></header>' +
    '<main><section id="home" role="tabpanel">' + cards + '</section>' +
    '<section role="tabpanel">' + card('differentcolumn','D') + '</section></main>';
  const requests = [];
  await context.route('**/*', async route => {
    const request = route.request();
    if (request.method()==='GET' && request.isNavigationRequest() && request.url()==='https://www.threads.com/') {
      requests.push('fixture-home');
      await route.fulfill({status:200,contentType:'text/html',body:fixture});
    } else {
      requests.push('unexpected');
      await route.abort();
    }
  });
  const page = await context.newPage();
  await page.goto('https://www.threads.com/');
  const urls = await collectFeedUrls({page, check:async ()=>'astel.u'}, async () => {});
  assert.deepEqual(urls,['https://www.threads.com/@other/post/A','https://www.threads.com/@other/post/B']);
  await page.locator('header button').evaluate(el=>el.removeAttribute('aria-controls'));
  assert.equal((await page.evaluate(scanFeed,{action:'read'})).error,'FEED_ROOT_UNVERIFIED');
  await page.locator('header button').evaluate(el=>el.setAttribute('aria-selected','false'));
  assert.equal((await page.evaluate(scanFeed,{action:'read'})).error,'FOR_YOU_UNVERIFIED');
  assert.deepEqual(requests,['fixture-home']);
  console.log('PASS: bounded scroll, outer cards, correct column, deduplication and feed selection on synthetic HTML');
} finally {
  await engine.close();
}
