#!/usr/bin/env bash
# Serverga o'rnatiladigan paket: release/smm-erp.tar.gz (+ .sha256) va install.sh.
# Oldin: npm run build:server && (cd server && node build.mjs)
set -euo pipefail
cd "$(dirname "$0")/.."
VER=${1:-$(date -u +%Y.%m.%d-%H%M)-$(git rev-parse --short HEAD)}
[ -f dist-server/index.html ] || { echo "dist-server yo'q: npm run build:server" >&2; exit 1; }
[ -f server/dist/server.mjs ] || { echo "server/dist yo'q: (cd server && node build.mjs)" >&2; exit 1; }
rm -rf release && mkdir -p release/smm-erp/public release/smm-erp/deploy
cp server/dist/server.mjs server/dist/server.mjs.LEGAL.txt release/smm-erp/
# Server beradigan barcha fayllar (server/src/app.ts dagi ro'yxat bilan bir xil) — biri yetishmasa, paket yig'ilmaydi
for f in index.html apple-touch-icon.png fd-touch-icon.png og.jpg; do
  [ -f "dist-server/$f" ] || { echo "dist-server/$f yo'q" >&2; exit 1; }
  cp "dist-server/$f" release/smm-erp/public/
done
cp deploy/* release/smm-erp/deploy/
echo "$VER" > release/smm-erp/VERSION
tar -C release -czf release/smm-erp.tar.gz smm-erp
(cd release && sha256sum smm-erp.tar.gz > smm-erp.tar.gz.sha256)
cp deploy/install.sh release/install.sh
echo "release/smm-erp.tar.gz ($VER)"
