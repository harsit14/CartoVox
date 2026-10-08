// node tools/test-media-ranges.mjs [path-to-miniflare-module]
// Exercises the deployed Worker entrypoint and FixedLengthStream in workerd.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';
import { GUIDE_VIDEO_BYTES } from '../worker/media.js';
const { Miniflare } = await import(process.argv[2] || 'miniflare');
const data = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);
const headers = {
  'Content-Type': 'video/mp4', 'Content-Length': String(data.length),
  ETag: '"test-video"', 'Cache-Control': 'public, max-age=2592000',
  'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'",
};
const mf = new Miniflare({
  modules: true,
  modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
  scriptPath: fileURLToPath(new URL('../worker/index.js', import.meta.url)),
  compatibilityDate: process.env.WORKER_TEST_DATE || '2026-09-21',
  serviceBindings: {
    ASSETS(request) {
      const path = new URL(request.url).pathname;
      if (path.endsWith('/missing.mp4')) return new Response('Missing', { status: 404 });
      if (GUIDE_VIDEO_BYTES[path]) {
        let offset = 0;
        const size = GUIDE_VIDEO_BYTES[path];
        const stream = new ReadableStream({
          pull(controller) {
            if (offset >= size) { controller.close(); return; }
            const chunk = new Uint8Array(Math.min(65536, size - offset)).fill(91);
            offset += chunk.length;controller.enqueue(chunk);
          },
        });
        const withoutLength = { ...headers };delete withoutLength['Content-Length'];
        return new Response(stream, { headers: withoutLength });
      }
      if (!path.endsWith('.mp4')) return new Response('Static asset');
      assert.equal(request.headers.get('Range'), null);
      assert.equal(request.headers.get('If-Range'), null);
      if (request.headers.get('If-None-Match') === headers.ETag) return new Response(null, { status: 304, headers: { ETag: headers.ETag } });
      let offset = 0;
      const stream = new ReadableStream({
        pull(controller) {
          if (offset >= data.length) { controller.close(); return; }
          controller.enqueue(data.slice(offset, offset + 37));
          offset += 37;
        },
      });
      return new Response(request.method === 'HEAD' ? null : stream, { headers });
    },
  },
});

let passed = 0;
async function check(name, requestHeaders, status, start = 0, end = data.length - 1, method = 'GET') {
  const response = await mf.dispatchFetch('https://cartovox.org/media/guides/delta-v6/test.mp4', { method, headers: requestHeaders });
  assert.equal(response.status, status, name);
  if (status === 304) { assert.equal((await response.arrayBuffer()).byteLength, 0); passed++; return; }
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes', name);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff', name);
  assert.equal(response.headers.get('Content-Security-Policy'), "default-src 'self'", name);
  assert.equal(response.headers.get('Cache-Control'), headers['Cache-Control'], name);
  if (status === 416) {
    assert.equal(response.headers.get('Content-Range'), 'bytes */1000', name);
    assert.equal((await response.arrayBuffer()).byteLength, 0, name);
  } else {
    assert.equal(response.headers.get('Content-Length'), String(end - start + 1), name);
    assert.equal(response.headers.get('Content-Range'), status === 206 ? `bytes ${start}-${end}/1000` : null, name);
    const expected = method === 'HEAD' ? new Uint8Array() : data.slice(start, end + 1);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), expected, name);
  }
  passed++;
}

try {
  for (const [path, size] of Object.entries(GUIDE_VIDEO_BYTES)) {
    assert.equal((await stat(new URL('..' + path, import.meta.url))).size, size, path);
    const response = await mf.dispatchFetch('https://cartovox.org' + path, { headers: { Range: 'bytes=1000-1999' } });
    assert.equal(response.status, 206, 'asset binding without Content-Length');
    assert.equal(response.headers.get('Content-Range'), `bytes 1000-1999/${size}`);
    assert.equal(response.headers.get('Content-Length'), '1000');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array(1000).fill(91));
    passed++;
  }
  await check('whole download', {}, 200);
  await check('bounded seek spanning chunks', { Range: 'bytes=100-199' }, 206, 100, 199);
  await check('open range', { Range: 'bytes=990-' }, 206, 990, 999);
  await check('suffix', { Range: 'bytes=-17' }, 206, 983, 999);
  await check('oversized suffix', { Range: 'bytes=-2000' }, 206);
  await check('end clamped to file', { Range: 'bytes=0-9999' }, 206);
  await check('last byte', { Range: 'bytes=999-999' }, 206, 999, 999);
  for (const range of ['bytes=-0', 'bytes=1000-', 'bytes=9-2']) await check(range, { Range: range }, 416);
  for (const range of ['bytes=-', 'items=1-2', 'bytes=0-1,4-5']) await check(range, { Range: range }, 200);
  await check('matching validator', { Range: 'bytes=10-29', 'If-Range': headers.ETag }, 206, 10, 29);
  await check('stale validator', { Range: 'bytes=10-29', 'If-Range': '"old-video"' }, 200);
  await check('weak validator', { Range: 'bytes=10-29', 'If-Range': 'W/"test-video"' }, 200);
  await check('HEAD ignores range', { Range: 'bytes=10-29' }, 200, 0, 999, 'HEAD');
  await check('conditional request', { 'If-None-Match': headers.ETag }, 304);
  const missing = await mf.dispatchFetch('https://cartovox.org/media/guides/delta-v6/missing.mp4', { headers: { Range: 'bytes=1-2' } });
  assert.equal(missing.status, 404); assert.equal(await missing.text(), 'Missing'); passed++;
  const ordinary = await mf.dispatchFetch('https://cartovox.org/guide/videos/');
  assert.equal(await ordinary.text(), 'Static asset'); passed++;
  console.log(`${passed} Worker media checks passed in workerd.`);
} finally {
  await mf.dispose();
}
