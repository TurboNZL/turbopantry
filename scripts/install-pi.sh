#!/usr/bin/env bash
# Install the TurboPantry server on a Raspberry Pi (or any Debian/Ubuntu Linux machine), start it, and print how to connect.
#
#   curl -fsSL https://raw.githubusercontent.com/TurboNZL/turbopantry/main/scripts/install-pi.sh | sudo bash -s -- --install-dir /mnt/data/turbopantry
#   sudo ./scripts/install-pi.sh --help
#
# Safe to run again: it updates what is there. Everything TurboPantry owns goes in ONE folder (--install-dir, asked for if you do not give it);
# the summary it prints first names the few things that live outside it (the system user, the systemd unit, the sudoers file, apt packages).
set -euo pipefail

USER_NAME="turbopantry"; INSTALL_DIR=""; APP_DIR=""; DATA_DIR=""; PORT="47900"; REPO="https://github.com/TurboNZL/turbopantry.git"; BRANCH="main"; ADMIN_NAME="admin"
DRY=0; YES=0; BROWSER=1

usage() { cat <<USAGE
Usage: install-pi.sh [options]
  --install-dir PATH  the ONE folder TurboPantry lives in, e.g. /mnt/data/turbopantry. It gets app/ (the program), data/ (your recipes and
                      lists: back this up), home/ (the service user's files) and pnpm-store/. Asked for if you do not give it (default /opt/turbopantry).
                      It must be new or empty, on a Linux filesystem (ext4, xfs, btrfs...), and not mounted noexec.
  --data-dir PATH     keep the data somewhere else than <install-dir>/data (rarely needed)
  --app-dir PATH      keep the program somewhere else than <install-dir>/app (rarely needed)
  --port N          port of the server (default $PORT)
  --user NAME       the system user that runs the server (default $USER_NAME)
  --repo URL        where to download TurboPantry from (default $REPO)
  --branch NAME     branch to install (default $BRANCH)
  --no-browser      do not install Chromium (it is only used to read Osta links; about 300 MB)
  --admin NAME      name of the first (owner) account, made only if there are no accounts yet (default $ADMIN_NAME)
  --dry-run         print what would be done, change nothing
  --yes             do not ask questions
USAGE
}
while [ $# -gt 0 ]; do
  case "$1" in
    --install-dir) INSTALL_DIR="${2:?--install-dir needs a path}"; shift 2 ;;
    --app-dir) APP_DIR="${2:?--app-dir needs a path}"; shift 2 ;;
    --data-dir) DATA_DIR="${2:?--data-dir needs a path}"; shift 2 ;;
    --port) PORT="${2:?--port needs a number}"; shift 2 ;;
    --user) USER_NAME="${2:?--user needs a name}"; shift 2 ;;
    --repo) REPO="${2:?--repo needs a URL}"; shift 2 ;;
    --branch) BRANCH="${2:?--branch needs a name}"; shift 2 ;;
    --no-browser) BROWSER=0; shift ;;
    --admin) ADMIN_NAME="${2:?--admin needs a name}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --yes|-y) YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die()  { printf '\n\033[31mStopped: %s\033[0m\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY" = 1 ]; then printf '    [dry run] %s\n' "$*"; else "$@"; fi; }
as_user() { if [ "$DRY" = 1 ]; then printf '    [dry run] as %s: %s\n' "$USER_NAME" "$*"; else sudo -u "$USER_NAME" -H bash -c "$*"; fi; }

if [ "$DRY" = 0 ] && [ "$(id -u)" -ne 0 ]; then die "run this as root: sudo ./scripts/install-pi.sh (or put sudo before bash in the one-line command)"; fi
[ "$(uname -s)" = "Linux" ] || die "this installer is for Linux (a Raspberry Pi, or a Debian/Ubuntu machine)."
command -v apt-get >/dev/null 2>&1 || [ "$DRY" = 1 ] || die "this installer uses apt (Raspberry Pi OS, Debian, Ubuntu). On another system follow docs/guides/DEPLOY_PI.md by hand."

case "$(uname -m)" in
  aarch64|arm64) NODE_ARCH="arm64" ;;
  armv7l)        NODE_ARCH="armv7l" ;;
  x86_64|amd64)  NODE_ARCH="x64" ;;
  *) die "no build of Node for this processor: $(uname -m)" ;;
esac

# ---- where everything goes ----
# ONE folder holds all of TurboPantry: app/ (the program, a git checkout), data/ (the database: back it up), home/ (the service user's home:
# caches) and pnpm-store/ (downloaded packages). Pick it BEFORE anything is installed: pass --install-dir, or answer the question below.
if [ -z "$INSTALL_DIR$APP_DIR$DATA_DIR" ] && [ "$YES" = 0 ] && [ "$DRY" = 0 ] && [ -r /dev/tty ]; then
  printf '\n\033[1mWhere should TurboPantry live?\033[0m\n' > /dev/tty
  printf '    One folder holds the program, your data and the service user'"'"'s files, so it can sit on the drive you choose\n    (for example /mnt/data/turbopantry). It must be new or empty.\n' > /dev/tty
  read -r -p "    Install folder [/opt/turbopantry]: " ans < /dev/tty || ans=""
  INSTALL_DIR="$ans"
fi
[ -n "$INSTALL_DIR" ] || INSTALL_DIR="/opt/turbopantry"
tidy() { case "$1" in /*) ;; *) die "$2 must be a full path starting with /  (you gave: $1)" ;; esac; realpath -m -- "$1"; }
INSTALL_DIR="$(tidy "$INSTALL_DIR" "--install-dir")"
case "$INSTALL_DIR" in /|/bin|/boot|/dev|/etc|/home|/lib|/media|/mnt|/opt|/proc|/root|/run|/sbin|/srv|/sys|/tmp|/usr|/var) die "$INSTALL_DIR is a system folder. Choose a folder of its own inside it, for example $INSTALL_DIR/turbopantry." ;; esac
APP_DIR="$(tidy "${APP_DIR:-$INSTALL_DIR/app}" "--app-dir")"; DATA_DIR="$(tidy "${DATA_DIR:-$INSTALL_DIR/data}" "--data-dir")"
HOME_DIR="$INSTALL_DIR/home"; STORE_DIR="$INSTALL_DIR/pnpm-store"

# an existing folder must be empty or one this installer made before (so it never mixes with other files, e.g. all of /mnt/data)
if [ -e "$INSTALL_DIR" ]; then
  [ -d "$INSTALL_DIR" ] || die "$INSTALL_DIR exists and is not a folder."
  if [ ! -e "$INSTALL_DIR/.turbopantry-install" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
    die "$INSTALL_DIR already has other files in it. Choose a new or empty folder (for example $INSTALL_DIR/turbopantry), so TurboPantry stays in a folder of its own."
  fi
fi

nearest_existing() { local p="$1"; while [ ! -e "$p" ] && [ "$p" != "/" ]; do p="$(dirname "$p")"; done; printf '%s' "$p"; }
# "<mount point> <filesystem type> <mount options>" of the filesystem that holds (or would hold) a path
mount_of() { findmnt -no TARGET,FSTYPE,OPTIONS -T "$(nearest_existing "$1")" 2>/dev/null | head -1 || true; }

check_place() { # path, what-it-is
  local path="$1" what="$2" line target fstype opts
  line="$(mount_of "$path")"
  if [ -z "$line" ]; then note "(could not read the mount table for $what; skipping the drive checks)"; return 0; fi
  read -r target fstype opts <<<"$line"
  case "$fstype" in
    vfat|exfat|msdos|ntfs|ntfs3) die "$what ($path) would be on a drive formatted as $fstype. TurboPantry needs a Linux filesystem (ext4, xfs, btrfs): this one has no Linux permissions or symlinks, which the build and the database need. Format the drive as ext4, or choose a folder on another drive." ;;
    fuseblk) note "WARNING: $path is on a FUSE-mounted drive (often NTFS or exFAT via ntfs-3g). That does not work for TurboPantry. If it is really ext4/xfs this is fine; otherwise stop now (Ctrl-C) and use a Linux filesystem." ;;
  esac
  if [ "$what" = "the program" ] && printf ',%s,' "$opts" | grep -q ',noexec,'; then
    die "$path is on a drive mounted with the noexec option ($target), so the build tools cannot run there. Remove noexec from that drive's line in /etc/fstab (then remount), or choose another folder."
  fi
  if [ "$target" = "/" ]; then
    case "$path" in
      /mnt/*|/media/*)
        note "WARNING: $path looks like it should be on a separate drive, but nothing is mounted there: it would go on the system disk."
        if [ "$YES" = 1 ] || [ "$DRY" = 1 ]; then note "(--yes given or dry run: continuing)"; else die "mount the drive first (or check the spelling), then run this again. To install on the system disk anyway, add --yes."; fi ;;
      *) note "NOTE: $what ($path) is on the system disk. On a Raspberry Pi that is the SD card, which constant writes wear out;"
         note "for a Pi, plug in a drive, mount it and use --install-dir /mnt/yourdrive/turbopantry." ;;
    esac
    SYSTEM_DISK=1
  fi
}

say "TurboPantry server"
note "folder:  $INSTALL_DIR"
note "  app:   $APP_DIR        (the program, downloaded from git)"
note "  data:  $DATA_DIR       (your recipes and lists: back this up)"
note "  home:  $HOME_DIR       (the service user's files)"
note "  store: $STORE_DIR      (downloaded packages)"
note "user: $USER_NAME     port: $PORT"
note "Outside that folder this adds only: the system user '$USER_NAME', /etc/systemd/system/turbopantry.service, /etc/sudoers.d/turbopantry,"
note "apt packages (git, curl, and Chromium for Osta links), and Node 22 and pnpm if the machine has none."
SYSTEM_DISK=0
check_place "$APP_DIR" "the program"
[ "$DATA_DIR" = "$APP_DIR" ] || check_place "$DATA_DIR" "the data"
if [ "$SYSTEM_DISK" = 1 ] && [ "$YES" = 0 ] && [ "$DRY" = 0 ]; then
  if [ -r /dev/tty ]; then read -r -p "    Continue anyway? [y/N] " ans < /dev/tty; [[ "$ans" =~ ^[Yy] ]] || die "cancelled. Nothing was changed."; else die "re-run with --yes to accept, or choose --install-dir on another drive."; fi
fi

say "1/7 System packages (git, curl, and Chromium for Osta links)"
run apt-get update -y
run env DEBIAN_FRONTEND=noninteractive apt-get install -y git curl ca-certificates xz-utils
if [ "$BROWSER" = 0 ]; then note "skipping Chromium (--no-browser): Osta links will say the server has no browser"; else
  # Debian and Raspberry Pi OS ship a real 'chromium' package; Ubuntu has none (its 'chromium-browser' is a snap stub that cannot run as a service), so there this step fails and says so
  if [ "$DRY" = 1 ]; then run env DEBIAN_FRONTEND=noninteractive apt-get install -y chromium
  elif env DEBIAN_FRONTEND=noninteractive apt-get install -y chromium && chromium --version >/dev/null 2>&1; then note "Chromium installed: $(chromium --version)"
  else note "could not install a working Chromium: Osta links will not work until you install one (see docs/guides/SELF_HOSTING.md). Everything else works."; fi
fi

say "2/7 Node.js 22 (the server needs 22.13 or newer)"
node_ok() { command -v node >/dev/null 2>&1 && node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)'; }
if node_ok; then note "found $(node -v), keeping it"; else
  if [ "$DRY" = 1 ]; then note "[dry run] download the newest Node 22 for $NODE_ARCH from nodejs.org, check its sha256, unpack to /opt, link node/npm/npx into /usr/local/bin"; else
    base="https://nodejs.org/dist/latest-v22.x"; sums="$(curl -fsSL "$base/SHASUMS256.txt")"
    line="$(printf '%s\n' "$sums" | grep -E "node-v22\.[0-9.]+-linux-$NODE_ARCH\.tar\.xz$" | head -1)"; [ -n "$line" ] || die "could not find a Node 22 download for $NODE_ARCH"
    file="${line##* }"; want="${line%% *}"; tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
    note "downloading $file"; curl -fsSL "$base/$file" -o "$tmp/$file"
    got="$(sha256sum "$tmp/$file" | cut -d' ' -f1)"; [ "$got" = "$want" ] || die "the Node download is damaged (checksum mismatch). Try again."
    dest="/opt/${file%.tar.xz}"; mkdir -p /opt; rm -rf "$dest"; tar -xJf "$tmp/$file" -C /opt
    for b in node npm npx corepack; do [ -e "$dest/bin/$b" ] && ln -sf "$dest/bin/$b" "/usr/local/bin/$b"; done
    note "installed $(node -v)"
  fi
fi
# pnpm must actually run (a leftover corepack stub on the PATH is not enough) and be on a path the service user can see
if (cd / && pnpm -v) >/dev/null 2>&1; then note "pnpm $(cd / && pnpm -v) found"; else
  run npm install -g pnpm@10
  if [ "$DRY" = 0 ]; then pnpm_bin="$(dirname "$(readlink -f "$(command -v node)")")/pnpm"; [ -e "$pnpm_bin" ] && ln -sf "$pnpm_bin" /usr/local/bin/pnpm; fi
fi

say "3/7 The folder, the service user and the data folder"
run mkdir -p "$INSTALL_DIR" "$APP_DIR" "$DATA_DIR" "$HOME_DIR" "$STORE_DIR"
run touch "$INSTALL_DIR/.turbopantry-install"
if id "$USER_NAME" >/dev/null 2>&1; then
  note "user $USER_NAME exists (home: $(getent passwd "$USER_NAME" | cut -d: -f6)); its package store is set to $STORE_DIR below"
else run useradd --system --home-dir "$HOME_DIR" --shell /usr/sbin/nologin "$USER_NAME"; fi
run chown "$USER_NAME:$USER_NAME" "$INSTALL_DIR" "$APP_DIR" "$HOME_DIR" "$STORE_DIR"
run chown -R "$USER_NAME:$USER_NAME" "$DATA_DIR"
# downloaded packages go to the folder, not to the user's home on the system disk (update.sh and the Update button use the same setting)
as_user "pnpm config set store-dir '$STORE_DIR' --global"

say "4/7 Downloading TurboPantry"
if [ -d "$APP_DIR/.git" ]; then as_user "cd '$APP_DIR' && git fetch --depth 1 origin '$BRANCH' && git checkout -q '$BRANCH' && git reset -q --hard FETCH_HEAD"
else as_user "git clone --depth 1 --branch '$BRANCH' '$REPO' '$APP_DIR'"; fi

say "5/7 Building (this takes a few minutes on a Pi)"
as_user "cd '$APP_DIR' && pnpm install --ignore-scripts --filter @turbopantry/shared --filter @turbopantry/server --filter @turbopantry/web && pnpm --filter @turbopantry/web build"

say "6/7 The service"
NODE_PATH_BIN="$(command -v node 2>/dev/null || echo /usr/local/bin/node)"
MOUNT_LINE="RequiresMountsFor=$APP_DIR $DATA_DIR"  # on a separate drive the service waits for it to be mounted
if [ "$DRY" = 1 ]; then note "[dry run] write /etc/systemd/system/turbopantry.service (user $USER_NAME, node $NODE_PATH_BIN, program $APP_DIR, data $DATA_DIR, port $PORT)"; else
  cat > /etc/systemd/system/turbopantry.service <<UNIT
[Unit]
Description=TurboPantry server
After=network-online.target
Wants=network-online.target
$MOUNT_LINE

[Service]
User=$USER_NAME
WorkingDirectory=$APP_DIR/packages/server
Environment=TURBOPANTRY_DATA=$DATA_DIR
Environment=TURBOPANTRY_PORT=$PORT
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE_PATH_BIN --experimental-strip-types --disable-warning=ExperimentalWarning src/index.ts
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
  # the "Update server" button and scripts/update.sh may stop and start the service, and nothing else
  SC="$(command -v systemctl)"
  printf '%s ALL=(root) NOPASSWD: %s stop turbopantry, %s start turbopantry, %s is-active --quiet turbopantry\n' "$USER_NAME" "$SC" "$SC" "$SC" > /etc/sudoers.d/turbopantry
  chmod 440 /etc/sudoers.d/turbopantry
  if ! visudo -cf /etc/sudoers.d/turbopantry >/dev/null; then rm -f /etc/sudoers.d/turbopantry; note "could not set up passwordless restart for updates (skipped)"; fi
fi
run systemctl daemon-reload
run systemctl enable --now turbopantry

say "7/7 Checking it answers, and making the first account"
if [ "$DRY" = 1 ]; then note "[dry run] wait for http://127.0.0.1:$PORT/api/health, then make the owner account '$ADMIN_NAME' if there are no accounts"; else
  ok=0; for _ in $(seq 1 40); do if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi; sleep 1; done
  [ "$ok" = 1 ] || die "the server did not start. Look at: journalctl -u turbopantry -n 50"
  CLI="cd '$APP_DIR/packages/server' && TURBOPANTRY_DATA='$DATA_DIR' '$NODE_PATH_BIN' --experimental-strip-types --disable-warning=ExperimentalWarning src/index.ts"
  EXISTING="$(sudo -u "$USER_NAME" -H bash -c "$CLI users" 2>/dev/null || true)"
  TOKEN_OUT=""
  if [ -z "$EXISTING" ]; then TOKEN_OUT="$(sudo -u "$USER_NAME" -H bash -c "$CLI add-user '$ADMIN_NAME'" 2>&1 | tail -1)"; fi
  printf '\n\033[1m\033[32mDone. TurboPantry is running.\033[0m\n\n'
  note "Open it in a browser on any device on your network:"
  for ip in $(hostname -I 2>/dev/null); do case "$ip" in *:*) ;; *) note "    http://$ip:$PORT" ;; esac; done
  note "    http://$(hostname).local:$PORT"
  note ""
  if [ -n "$TOKEN_OUT" ]; then
    note "Your token (account '$ADMIN_NAME', the owner). It is shown once. Paste it in Settings > Server:"
    note "    $TOKEN_OUT"
  else
    note "Accounts already exist, so none was made. To add someone:"
    note "    sudo -u $USER_NAME -H bash -c \"cd $APP_DIR/packages/server && TURBOPANTRY_DATA=$DATA_DIR node --experimental-strip-types src/index.ts add-user NAME\""
  fi
  note ""
  note "Update later with:  sudo -u $USER_NAME -H bash $APP_DIR/scripts/update.sh      (or the Update server button in Settings > Server)"
  note "Everything is in:      $INSTALL_DIR"
  note "Logs:               journalctl -u turbopantry -f"
  note "Next steps:         docs/guides/GETTING_STARTED.md"
fi
