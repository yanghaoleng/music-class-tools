#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
TARGET="${XIANJI_SSH_HOST:-mikeywa-rive-old}"
VERSION="$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
ARCHIVE="$(mktemp -t xianji).tar.gz"
trap 'rm -f "$ARCHIVE"' EXIT
npm test
npm run build
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$ARCHIVE" dist ops/nginx-location.conf ops/connect-nginx.py
scp "$ARCHIVE" "$TARGET:/tmp/xianji-$VERSION.tar.gz"
ssh "$TARGET" sh -s -- "$VERSION" <<'REMOTE'
set -eu
version="$1"
sudo -n mkdir -p /opt/xianji/releases
sudo -n chown ubuntu:www-data /opt/xianji /opt/xianji/releases
mkdir "/opt/xianji/releases/$version"
tar -xzf "/tmp/xianji-$version.tar.gz" -C "/opt/xianji/releases/$version"
if [ -L /opt/xianji/current ]; then readlink -f /opt/xianji/current > /opt/xianji/previous-release; fi
ln -sfn "/opt/xianji/releases/$version" /opt/xianji/current-next
mv -Tf /opt/xianji/current-next /opt/xianji/current
sudo -n python3 /opt/xianji/current/ops/connect-nginx.py
curl -fsS --retry 5 --retry-all-errors --retry-delay 1 --max-time 10 --resolve m.mikeywa.site:443:127.0.0.1 https://m.mikeywa.site/xianji/ -o /dev/null
rm -f "/tmp/xianji-$version.tar.gz"
REMOTE
printf 'Xianji release: %s\n' "$VERSION"
