import { canonicalPost } from './core.mjs';

export const CAROUSEL_QUERY = 'radar:carousel:for-you';
export function isCarouselQuery(query) {
  return typeof query === 'string' && query.normalize('NFKC').trim().toLowerCase() === CAROUSEL_QUERY;
}
export const CAROUSEL_ACCOUNT = 'astel.u:threads';
export const CAROUSEL_LIMIT = 10;
const MAX_SCROLLS = 6;

// Runs inside the already-open browser. It returns only permalink candidates
// from visible outer cards; text extraction still belongs to the normal reader.
export function scanFeed({ action, previous }) {
  function visible(element) {
    const rect = element.getBoundingClientRect();
    return element.checkVisibility({ visibilityProperty: true, opacityProperty: true })
      && rect.width > 0 && rect.height > 0 && rect.bottom > 0
      && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  }
  const url = new URL(location.href);
  if (!['https://www.threads.com', 'https://threads.com'].includes(url.origin)
      || url.pathname !== '/' || url.search || url.hash) return { error: 'FEED_LOCATION_UNVERIFIED' };

  const selected = [...document.querySelectorAll('[aria-selected="true"],[aria-current="page"],[aria-current="true"]')];
  const names = ['for you', 'для вас'];
  const forYou = selected.some(element => visible(element) && !element.closest('article,[role="article"],[data-pressable-container]')
    && names.includes((element.getAttribute('aria-label') || element.innerText || '').trim().toLowerCase()));
  if (!forYou) return { error: 'FOR_YOU_UNVERIFIED' };

  const roots = [...document.querySelectorAll('main,[role="main"]')].filter(visible);
  if (roots.length !== 1) return { error: 'FEED_ROOT_UNVERIFIED' };
  const selector = '[data-pressable-container][data-interactive-id],article,[role="article"]';
  const cards = [...roots[0].querySelectorAll(selector)].filter(card =>
    visible(card) && !card.parentElement?.closest(selector) && !card.closest('aside,[role="complementary"],nav'));
  const urls = [];
  for (const card of cards) {
    const permalinks = new Set();
    for (const time of card.querySelectorAll('a[href] time')) {
      const link = time.closest('a[href]');
      if (time.closest(selector) !== card || !time.checkVisibility()
          || !link || !link.getClientRects().length) continue;
      const target = new URL(link.href);
      if (!target.username && !target.password && /^\/@[\w.]+\/post\/[\w-]+\/?$/.test(target.pathname)) {
        permalinks.add(target.origin + target.pathname.replace(/\/$/, ''));
      }
    }
    if (permalinks.size === 1) urls.push(...permalinks);
  }
  if (action === 'wait') return JSON.stringify(urls) !== previous ? { urls } : false;
  if (action === 'scroll') {
    let scroller = cards.at(-1)?.parentElement || roots[0];
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight
          && /^(auto|scroll)$/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    scroller ||= document.scrollingElement;
    if (!scroller) return { error: 'FEED_SCROLL_UNAVAILABLE' };
    scroller.scrollBy({ top: Math.max(1, Math.floor(scroller.clientHeight * 0.8)), behavior: 'instant' });
  }
  return { urls };
}

export async function collectFeedUrls(browser, guard, visited = []) {
  const seen = new Set(visited);
  const candidates = [];
  async function verify() {
    await guard();
    if (await browser.check() !== 'astel.u') throw Error('IDENTITY_MISMATCH');
  }
  for (let scroll = 0; scroll <= MAX_SCROLLS && seen.size < CAROUSEL_LIMIT; scroll++) {
    await verify();
    const sample = await browser.page.evaluate(scanFeed, { action: 'read' });
    if (sample.error) throw Error(sample.error);
    for (const href of sample.urls) {
      let url;
      try { url = canonicalPost(href, 'threads'); } catch { continue; }
      const author = new URL(url).pathname.split('/')[1].toLowerCase();
      if (seen.has(url) || ['@astel.u', '@meta.ai'].includes(author)) continue;
      seen.add(url);
      candidates.push(url);
      if (seen.size === CAROUSEL_LIMIT) break;
    }
    if (seen.size >= CAROUSEL_LIMIT || scroll === MAX_SCROLLS) break;
    await verify();
    const moved = await browser.page.evaluate(scanFeed, { action: 'scroll' });
    if (moved.error) throw Error(moved.error);
    try {
      const change = await browser.page.waitForFunction(scanFeed, {
        action: 'wait', previous: JSON.stringify(sample.urls)
      }, { timeout: 2500 });
      try {
        const result = await change.jsonValue();
        if (result.error) throw Error(result.error);
      } finally { await change.dispose(); }
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error;
      break;
    }
  }
  await verify();
  if (!seen.size) throw Error('FEED_NO_VERIFIED_CARDS');
  return candidates;
}
