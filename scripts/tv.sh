#!/usr/bin/env bash
# Package, install and launch the app on a Tizen TV or the TV emulator.
#
#   scripts/tv.sh package              build dist/ and sign it into build/GalleryAtHome.wgt
#   scripts/tv.sh connect <ip>         connect sdb to a TV in Developer Mode
#   scripts/tv.sh install [target]     package + install (target = sdb serial, default: first device)
#   scripts/tv.sh run [target]         launch the installed app
#   scripts/tv.sh deploy [target]      package + install + run
#   scripts/tv.sh devices              list connected TVs/emulators
#
# Signing: uses $TIZEN_PROFILE, else the Samsung profile "gallery-at-home"
# (made in Certificate Manager; required by TVs and the TV emulator), else
# a generic Tizen profile "gallery-at-home-dev" created on first run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIZEN_HOME="${TIZEN_HOME:-$HOME/tizen-studio}"
TIZEN="$TIZEN_HOME/tools/ide/bin/tizen"
SDB="$TIZEN_HOME/tools/sdb"
# Samsung TVs (and the TV emulator) only accept a Samsung certificate; use
# the "gallery-at-home" profile from Certificate Manager when it exists.
if [[ -n "${TIZEN_PROFILE:-}" ]]; then
  PROFILE="$TIZEN_PROFILE"
elif "$TIZEN" security-profiles list 2>/dev/null | grep -qw gallery-at-home; then
  PROFILE=gallery-at-home
else
  PROFILE=gallery-at-home-dev
fi
APP_ID="GalleryAtH.GalleryAtHome"
SIGN_DIR="$ROOT/.sign"
OUT="$ROOT/build"

ensure_profile() {
  if "$TIZEN" security-profiles list 2>/dev/null | grep -qw "$PROFILE"; then return; fi
  echo "Creating author certificate and security profile '$PROFILE'…"
  mkdir -p "$SIGN_DIR"
  chmod 700 "$SIGN_DIR"
  if [[ ! -f "$SIGN_DIR/author.pwd" ]]; then
    head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20 > "$SIGN_DIR/author.pwd"
    chmod 600 "$SIGN_DIR/author.pwd"
  fi
  local pwd
  pwd="$(cat "$SIGN_DIR/author.pwd")"
  "$TIZEN" certificate -a gallery-at-home -p "$pwd" -c CA -ct Home -n "Gallery at Home Dev" -f gallery-at-home-author >/dev/null
  "$TIZEN" security-profiles add -n "$PROFILE" -a "$HOME/tizen-studio-data/keystore/author/gallery-at-home-author.p12" -p "$pwd" >/dev/null
}

package() {
  (cd "$ROOT" && node scripts/build.mjs)
  ensure_profile
  rm -rf "$OUT"
  mkdir -p "$OUT"
  cp -r "$ROOT/dist/." "$OUT/"
  "$TIZEN" package -t wgt -s "$PROFILE" -- "$OUT" >/dev/null
  local wgt
  wgt="$(ls "$OUT"/*.wgt | head -1)"
  mv "$wgt" "$OUT/GalleryAtHome.wgt"
  echo "Packaged $OUT/GalleryAtHome.wgt"
}

target_args() {
  local serial="${1:-}"
  if [[ -z "$serial" ]]; then
    serial="$("$SDB" devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
  fi
  [[ -n "$serial" ]] || { echo "No TV or emulator connected (scripts/tv.sh devices)" >&2; exit 1; }
  echo "$serial"
}

cmd="${1:-}"
shift || true
case "$cmd" in
  package) package ;;
  connect) "$SDB" connect "${1:?TV IP address}" ;;
  devices) "$SDB" devices ;;
  install)
    package
    "$TIZEN" install -n GalleryAtHome.wgt -- "$OUT" -s "$(target_args "${1:-}")"
    ;;
  run) "$TIZEN" run -p "$APP_ID" -s "$(target_args "${1:-}")" ;;
  deploy)
    package
    serial="$(target_args "${1:-}")"
    "$TIZEN" install -n GalleryAtHome.wgt -- "$OUT" -s "$serial"
    "$TIZEN" run -p "$APP_ID" -s "$serial"
    ;;
  *)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
