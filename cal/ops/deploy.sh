#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
VERSION="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$(mktemp -t music-cal).tar.gz"
trap 'rm -f "$ARCHIVE"' EXIT
npm run build
tar -czf "$ARCHIVE" server.py requirements.txt dist ops/music-cal.service ops/nginx-location.conf
scp "$ARCHIVE" "ubuntu@115.159.25.169:/tmp/music-cal-$VERSION.tar.gz"
ssh ubuntu@115.159.25.169 sh -s -- "$VERSION" <<'REMOTE'
set -eu
version="$1"
sudo -n mkdir -p /opt/music-cal/releases /var/lib/music-cal
sudo -n chown ubuntu:www-data /opt/music-cal /opt/music-cal/releases /var/lib/music-cal
mkdir "/opt/music-cal/releases/$version"
tar -xzf "/tmp/music-cal-$version.tar.gz" -C "/opt/music-cal/releases/$version"
if [ ! -d /opt/music-cal/venv ]; then python3 -m venv /opt/music-cal/venv; fi
/opt/music-cal/venv/bin/pip install -q -r "/opt/music-cal/releases/$version/requirements.txt"
if [ -L /opt/music-cal/current ]; then readlink -f /opt/music-cal/current > /opt/music-cal/previous-release; fi
ln -sfn "/opt/music-cal/releases/$version" /opt/music-cal/current-next
mv -Tf /opt/music-cal/current-next /opt/music-cal/current
sudo -n cp /opt/music-cal/current/ops/music-cal.service /etc/systemd/system/music-cal.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable music-cal.service
sudo -n systemctl restart music-cal.service
REMOTE
printf 'Release: %s\n' "$VERSION"
