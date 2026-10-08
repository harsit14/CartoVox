// cartovox.org: the static site, plus the Delta service CartoVox's Delta
// builds talk to. Guide media also reaches this script for byte-range playback;
// other static files are served straight from the assets.
// The service itself is copied from the app repository by
// tools/sync-delta-service.py; never edit worker/delta/ by hand.
import { handle } from './delta/service.js';
import { serveGuideVideo } from './media.js';

const SERVICE = /^\/(v1(\/|$)|admin(\/|$))/;

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (SERVICE.test(path)) return handle(request, env);
    if (/^\/media\/guides\/[^/]+\/[^/]+\.mp4$/.test(path)) return serveGuideVideo(request, env.ASSETS, ctx);
    return env.ASSETS.fetch(request);
  },
};
