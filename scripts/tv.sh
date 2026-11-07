#!/usr/bin/env bash
# Package, install and launch the app on a Tizen TV or the TV emulator.
#
#   scripts/tv.sh package              build dist/ and sign it into build/GalleryAtHome.wgt
#   scripts/tv.sh package-store        the store version (no Google Photos), into build-store/GalleryAtHome.wgt
#   scripts/tv.sh connect <ip>         connect sdb to a TV in Developer Mode
#   scripts/tv.sh install [target]     package + install (target = sdb serial, default: first device)
#   scripts/tv.sh run [target]         launch the installed app
#   scripts/tv.sh deploy [target]      package + install + run
#   scripts/tv.sh reinstall [target]   uninstall + install afresh, keeping the app's data
#   scripts/tv.sh backup [target]      save the app's data from a TV to .tv-backups/
#   scripts/tv.sh restore <file> [target]  put saved data back
#   scripts/tv.sh devices              list connected TVs/emulators
#
# Some TVs intermittently refuse to update the app in place ("download
# failed"). deploy then saves the app's data, uninstalls, installs afresh
# and restores the data, so collections, sources and settings survive.
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

# Signs a built folder into <out>/GalleryAtHome.wgt.
sign_into() {
  local dist="$1" out="$2" wgt
  ensure_profile
  rm -rf "$out"
  mkdir -p "$out"
  cp -r "$dist/." "$out/"
  "$TIZEN" package -t wgt -s "$PROFILE" -- "$out" >/dev/null
  wgt="$(ls "$out"/*.wgt | head -1)"
  mv "$wgt" "$out/GalleryAtHome.wgt"
  echo "Packaged $out/GalleryAtHome.wgt"
}

package() {
  (cd "$ROOT" && node scripts/build.mjs)
  sign_into "$ROOT/dist" "$OUT"
}

package_store() {
  (cd "$ROOT" && node scripts/build.mjs --store)
  sign_into "$ROOT/dist-store" "$ROOT/build-store"
}

# Outside build/, which package() wipes. Git-ignored: backups hold album links and passwords.
BACKUPS="$ROOT/.tv-backups"

# Installs the packaged app; prints the installer's output and returns 1 if
# the TV refused it.
install_pkg() {
  local serial="$1" out
  out="$("$TIZEN" install -n GalleryAtHome.wgt -- "$OUT" -s "$serial" 2>&1)" || true
  echo "$out" | grep -E "install completed|Failed|failed|error" | grep -v "installing\[" || true
  echo "$out" | grep -q "install completed"
}

backup() {
  local serial="$1" file
  mkdir -p "$BACKUPS"
  chmod 700 "$BACKUPS"
  file="$BACKUPS/${serial//[:\/]/_}-$(date +%Y%m%d-%H%M%S).json"
  node "$ROOT/scripts/tv-data.mjs" backup "$serial" "$file" >&2
  echo "$file"
}

is_installed() {
  # Read the list first: with pipefail, grep -q stopping early would look like failure.
  local apps
  apps="$("$SDB" -s "$1" shell 0 applist 2>/dev/null || true)"
  [[ "$apps" == *"$APP_ID"* ]]
}

# Installs over an existing copy; if the TV refuses, reinstalls with the
# app's data saved and put back.
install_keeping_data() {
  local serial="$1"
  if install_pkg "$serial"; then return; fi
  if ! is_installed "$serial"; then
    echo "Install failed on $serial (and the app isn't installed there)." >&2
    exit 1
  fi
  echo "The TV refused the update; reinstalling with your data kept…"
  reinstall_keeping_data "$serial"
}

# Saves the app's data, uninstalls, installs afresh and restores the data.
reinstall_keeping_data() {
  local serial="$1" file
  file="$(backup "$serial")"
  "$TIZEN" uninstall -p "$APP_ID" -s "$serial" >/dev/null || true
  sleep 3
  # Some TVs ignore the uninstall without saying so. The old version and its
  # data are then still there, so say that rather than "reinstall failed".
  if is_installed "$serial"; then
    echo "$serial won't remove the app remotely; the old version is still installed, with its data." >&2
    echo "Restart the TV (hold the power button) and deploy again." >&2
    echo "If that fails, delete the app on the TV, deploy, then: scripts/tv.sh restore $file $serial" >&2
    "$TIZEN" run -p "$APP_ID" -s "$serial" >/dev/null || true
    exit 1
  fi
  if ! install_pkg "$serial"; then
    echo "Reinstall failed. Your data is saved in $file;" >&2
    echo "after installing, put it back with: scripts/tv.sh restore $file $serial" >&2
    exit 1
  fi
  node "$ROOT/scripts/tv-data.mjs" restore "$serial" "$file"
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
  package-store) package_store ;;
  connect) "$SDB" connect "${1:?TV IP address}" ;;
  devices) "$SDB" devices ;;
  install)
    package
    install_keeping_data "$(target_args "${1:-}")"
    ;;
  run) "$TIZEN" run -p "$APP_ID" -s "$(target_args "${1:-}")" ;;
  deploy)
    package
    serial="$(target_args "${1:-}")"
    install_keeping_data "$serial"
    "$TIZEN" run -p "$APP_ID" -s "$serial"
    ;;
  reinstall)
    package
    serial="$(target_args "${1:-}")"
    reinstall_keeping_data "$serial"
    "$TIZEN" run -p "$APP_ID" -s "$serial"
    ;;
  backup)
    serial="$(target_args "${1:-}")"
    file="$(backup "$serial")"
    echo "Saved to $file"
    "$TIZEN" run -p "$APP_ID" -s "$serial" >/dev/null
    ;;
  restore)
    file="${1:?backup file (from .tv-backups/)}"
    serial="$(target_args "${2:-}")"
    node "$ROOT/scripts/tv-data.mjs" restore "$serial" "$file"
    "$TIZEN" run -p "$APP_ID" -s "$serial" >/dev/null
    ;;
  *)
    sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
