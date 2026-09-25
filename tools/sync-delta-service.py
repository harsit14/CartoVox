#!/usr/bin/env python3
"""Copy the Delta service from the app repository into this site's Functions.

    python3 tools/sync-delta-service.py <app-repo>

The service (access-code registration and the usage report CartoVox's Delta
builds send) is written and tested in the app repository, in
`services/delta-service/src/`. This site's Worker (`worker/index.js`) serves it
under `/v1/` and `/admin`, so it deploys with every push. Never edit
`worker/delta/` by hand: change the app repository and run this again.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    source = Path(sys.argv[1]).expanduser() / "services" / "delta-service" / "src"
    target = ROOT / "worker" / "delta"
    target.mkdir(parents=True, exist_ok=True)
    for name in ("index.js", "admin.js", "codes.js"):
        shutil.copyfile(source / name, target / ("service.js" if name == "index.js" else name))
        print(f"  worker/delta/{'service.js' if name == 'index.js' else name} <- {name}")


if __name__ == "__main__":
    main()
