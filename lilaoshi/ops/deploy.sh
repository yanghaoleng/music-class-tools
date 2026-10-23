#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
TARGET="${PIANOCLASS_SSH_HOST:-mikeywa-rive-old}"
VERSION="$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
ARCHIVE="$(mktemp -t pianoclass).tar.gz"
trap 'rm -f "$ARCHIVE"' EXIT
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.cjs
git diff --check
COPYFILE_DISABLE=1 tar --no-xattrs --exclude='__pycache__' --exclude='*.pyc' -czf "$ARCHIVE" web server ops
scp "$ARCHIVE" "$TARGET:/tmp/pianoclass-$VERSION.tar.gz"
ssh "$TARGET" sh -s -- "$VERSION" <<'REMOTE'
set -eu
version="$1"
sudo -n mkdir -p /opt/pianoclass/releases
sudo -n chown ubuntu:www-data /opt/pianoclass /opt/pianoclass/releases
mkdir "/opt/pianoclass/releases/$version"
tar -xzf "/tmp/pianoclass-$version.tar.gz" -C "/opt/pianoclass/releases/$version"
# Credentials and the learning database live outside releases.
sudo -n python3 "/opt/pianoclass/releases/$version/ops/init-production.py"
if [ -L /opt/pianoclass/current ]; then readlink -f /opt/pianoclass/current > /opt/pianoclass/previous-release; fi
ln -sfn "/opt/pianoclass/releases/$version" /opt/pianoclass/current-next
mv -Tf /opt/pianoclass/current-next /opt/pianoclass/current
sudo -n install -m 0644 /opt/pianoclass/current/ops/pianoclass.service /etc/systemd/system/pianoclass.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable pianoclass.service
sudo -n systemctl restart pianoclass.service
if ! curl -fsS --retry 5 --retry-all-errors --retry-delay 1 --max-time 10 http://127.0.0.1:8842/pianoclass/api/health; then
    if [ -f /opt/pianoclass/previous-release ]; then
        ln -sfn "$(cat /opt/pianoclass/previous-release)" /opt/pianoclass/current-next
        mv -Tf /opt/pianoclass/current-next /opt/pianoclass/current
        sudo -n systemctl restart pianoclass.service
    else
        sudo -n systemctl stop pianoclass.service
    fi
    exit 1
fi
sudo -n python3 /opt/pianoclass/current/ops/connect-nginx.py
curl -fsS --retry 3 --retry-all-errors --retry-delay 1 --max-time 10 --resolve m.mikeywa.site:443:127.0.0.1 https://m.mikeywa.site/pianoclass/api/health
rm -f "/tmp/pianoclass-$version.tar.gz"
REMOTE
printf '\nPianoClass release: %s\n' "$VERSION"
