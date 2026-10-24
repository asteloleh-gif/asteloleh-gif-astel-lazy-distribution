import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { createAppServer } from '../dist/server.js';

// No host credentials are read or used; every upstream request is intercepted.
process.env = {};
const calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (String(url).startsWith('https://www.googleapis.com/youtube/v3/videos')) {
    return new Response(JSON.stringify({ items: [{ snippet: {
      title: 'Fixture video', description: 'Fixture description', tags: [],
      thumbnails: { high: { url: 'https://fixture.invalid/thumbnail.jpg' } }
    } }] }));
  }
  throw new Error('Unexpected external request');
};

test('HTTP security boundaries (offline)', async t => {
  const server = createAppServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const call = (path, method = 'GET', authorization, body = '') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port,
      path, method, agent: false, headers: { 'content-length': Buffer.byteLength(body), ...(authorization ? { authorization } : {}) } }, res => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject); req.end(body);
  });
  await t.test('health stays public', async () => {
    assert.equal((await call('/health')).status, 200);
  });
  await t.test('missing configuration fails closed', async () => {
    assert.equal((await call('/api/publish', 'POST', undefined, '{bad')).status, 503);
    assert.equal(calls.length, 0);
  });
  process.env.DISTRIBUTION_API_KEY = 'offline-fixture-only';
  process.env.YOUTUBE_API_KEY = 'offline-fixture-only';
  process.env.OPENAI_API_KEY = 'offline-fixture-only';
  process.env.PUBLISH_ENABLED = 'true';
  await t.test('all costly endpoints reject unauthorized callers before input processing', async () => {
    for (const [path, method] of [['/api/preview', 'GET'], ['/api/preview','POST'],
      ['/api/publish','POST'], ['/api/pinterest/sandbox-check','GET']]) {
      for (const auth of [undefined, 'Bearer wrong', 'Basic offline-fixture-only']) {
        assert.equal((await call(path, method, auth, '{bad')).status, 403);
      }
    }
    assert.equal(calls.length, 0);
  });
  await t.test('query credentials do not authorize API access', async () => {
    assert.equal((await call('/api/preview?key=offline-fixture-only')).status, 403);
    assert.equal(calls.length, 0);
  });
  await t.test('legacy smoke cannot create boards or Pins for any caller', async () => {
    for (const method of ['GET','POST']) {
      assert.equal((await call('/api/pinterest/sandbox-smoke?key=offline-fixture-only', method,
        'Bearer offline-fixture-only')).status, 410);
    }
    assert.equal(calls.length, 0);
  });
  delete process.env.OPENAI_API_KEY;
  delete process.env.PUBLISH_ENABLED;
  await t.test('authorized publish defaults to preview with no Pinterest call', async () => {
    const result = await call('/api/publish','POST','Bearer offline-fixture-only',
      JSON.stringify({youtubeUrl:'https://youtu.be/fixture1234',boardId:'fixture-board'}));
    assert.equal(result.status,200);
    const body = JSON.parse(result.data);
    assert.equal(body.mode,'preview');
    assert.equal(body.draft.mediaUrl,'https://fixture.invalid/thumbnail.jpg');
    assert.equal(calls.length,1);
  });
  await t.test('async preview failures are caught without leaking upstream text', async () => {
    globalThis.fetch = async () => { throw new Error('private upstream diagnostic'); };
    const result = await call('/api/preview?youtubeUrl=https://youtu.be/fixture1234','GET','Bearer offline-fixture-only');
    assert.equal(result.status,500);
    assert.equal(result.data.includes('private upstream diagnostic'),false);
  });
});
