// ASSETS may omit Content-Length internally. Keep these release assets in sync.
export const GUIDE_VIDEO_BYTES = Object.freeze({
  "/media/guides/delta-v6/01-create.mp4": 6076006,
  "/media/guides/delta-v6/02-maps.mp4": 8413198,
  "/media/guides/delta-v6/03-climate.mp4": 6830887,
  "/media/guides/delta-v6/04-travel.mp4": 4820986,
  "/media/guides/delta-v6/05-write.mp4": 2861418,
  "/media/guides/delta-v6/06-export.mp4": 8546749
});

// Add single-byte-range responses for guide videos served by the assets binding.
// Stream the selected bytes so seeking never buffers a whole MP4 in the Worker.
function requestedRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  // Unsupported units and multipart ranges may be ignored with a full response.
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start >= size || start > end ? false : { start, end };
}

function sliceStream(body, start, end) {
  const reader = body.getReader();
  let offset = 0;
  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        const from = Math.max(0, start - offset);
        const to = Math.min(value.byteLength, end + 1 - offset);
        offset += value.byteLength;
        if (to > from) controller.enqueue(value.subarray(from, to));
        if (offset > end) {
          controller.close();
          await reader.cancel();
          return;
        }
        if (to > from) return;
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}

export async function serveGuideVideo(request, assets, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return assets.fetch(request);
  const assetHeaders = new Headers(request.headers);
  assetHeaders.delete('Range');
  assetHeaders.delete('If-Range');
  assetHeaders.set('Accept-Encoding', 'identity');
  const asset = await assets.fetch(new Request(request, { headers: assetHeaders }));
  const knownSize = GUIDE_VIDEO_BYTES[new URL(request.url).pathname];
  if (asset.status !== 200 || (!knownSize && asset.headers.get('Content-Type')?.split(';')[0] !== 'video/mp4')) return asset;
  const size = Number(asset.headers.get('Content-Length')) || knownSize;
  if (!Number.isSafeInteger(size) || size <= 0) return asset;
  const headers = new Headers(asset.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Type', 'video/mp4');
  const rangeHeader = request.headers.get('Range');
  const validator = request.headers.get('If-Range');
  // Assets supply strong ETags. A stale/unsupported validator gets the full file.
  const validatorMatches = !validator || (!validator.startsWith('W/') && validator === headers.get('ETag'));
  const range = request.method === 'GET' && rangeHeader && validatorMatches
    ? requestedRange(rangeHeader, size) : null;
  if (range === null) return new Response(asset.body, { status: 200, headers });
  if (range === false) {
    if (asset.body) await asset.body.cancel();
    headers.set('Content-Range', `bytes */${size}`);
    headers.set('Content-Length', '0');
    return new Response(null, { status: 416, headers });
  }
  const { start, end } = range;
  const length = end - start + 1;
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(length));
  // Workers derives Content-Length from the stream, not the header alone.
  const { readable, writable } = new FixedLengthStream(length);
  ctx.waitUntil(sliceStream(asset.body, start, end).pipeTo(writable).catch(() => {}));
  return new Response(readable, { status: 206, headers });
}
