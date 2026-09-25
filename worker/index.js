// cartovox.org: the static site, plus the Delta service CartoVox's Delta
// builds talk to. Static files are served straight from the assets; only
// /v1/... and /admin reach this script (wrangler.jsonc, run_worker_first).
// The service itself is copied from the app repository by
// tools/sync-delta-service.py; never edit worker/delta/ by hand.
import { handle } from './delta/service.js';

const SERVICE = /^\/(v1(\/|$)|admin(\/|$))/;

export default {
  async fetch(request, env) {
    if (SERVICE.test(new URL(request.url).pathname)) return handle(request, env);
    return env.ASSETS.fetch(request);
  },
};
