#!/usr/bin/env bash
set -Eeuo pipefail

# Production deploy script for this Vite static application.
# Usage: ./run.sh [--help]
# Optional environment variables: APP_NAME, DEPLOY_DIR, PORT, HOST

APP_NAME="${APP_NAME:-chat-lab}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/${APP_NAME}}"
PORT="${PORT:-4173}"
SERVICE_NAME="${APP_NAME}.service"
HOST="${HOST:-127.0.0.1}"

log() { printf '[%s] %s\n' "${APP_NAME}" "$*"; }
fail() { printf '[%s] ERROR: %s\n' "${APP_NAME}" "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: ./run.sh

Builds this Vite application and deploys it for production.

Environment variables:
  APP_NAME     service/site name (default: chat-lab)
  DEPLOY_DIR   deployed application directory (default: /opt/APP_NAME)
  PORT         systemd service port (default: 4173)
  HOST         bind address for the service (default: 127.0.0.1)

The app is built and managed by systemd. Point your reverse proxy (for
example, Baota nginx) to HOST:PORT after deployment.
EOF
}

[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && { usage; exit 0; }
[[ "$(uname -s)" == "Linux" ]] || fail "run.sh must be executed on Linux."
command -v npm >/dev/null 2>&1 || fail "npm is required (install Node.js 18+ first)."
command -v node >/dev/null 2>&1 || fail "node is required (Node.js 18+ recommended)."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 18 )) || fail "Node.js 18+ is required; found $(node --version)."

if (( EUID == 0 )); then
  SUDO=()
  RUN_USER="${SUDO_USER:-root}"
else
  command -v sudo >/dev/null 2>&1 || fail "sudo is required when this script is not run as root."
  SUDO=(sudo)
  RUN_USER="${USER}"
fi

cd "${SCRIPT_DIR}"
[[ -f package.json ]] || fail "package.json was not found in ${SCRIPT_DIR}."
[[ -f package-lock.json ]] || fail "package-lock.json is required for reproducible deployment."

log "Installing locked dependencies"
npm ci

log "Building production bundle"
npm run build
[[ -d dist && -f dist/index.html ]] || fail "Build completed without dist/index.html."

command -v systemctl >/dev/null 2>&1 || fail "systemd is required to keep the production service running."
log "Deploying files and configuring systemd on ${HOST}:${PORT}"
"${SUDO[@]}" install -d -m 0755 "${DEPLOY_DIR}"
"${SUDO[@]}" find "${DEPLOY_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
"${SUDO[@]}" cp -a dist/. "${DEPLOY_DIR}/"
"${SUDO[@]}" cp -a package.json package-lock.json node_modules "${DEPLOY_DIR}/"

TMP_SERVICE="$(mktemp)"
trap 'rm -f "${TMP_SERVICE:-}"' EXIT
cat >"${TMP_SERVICE}" <<EOF
[Unit]
Description=${APP_NAME} production web service
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${DEPLOY_DIR}
Environment=NODE_ENV=production
ExecStart=$(command -v npm) run preview -- --host ${HOST} --port ${PORT}
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
"${SUDO[@]}" install -D -m 0644 "${TMP_SERVICE}" "/etc/systemd/system/${SERVICE_NAME}"
"${SUDO[@]}" systemctl daemon-reload
"${SUDO[@]}" systemctl enable --now "${SERVICE_NAME}"
"${SUDO[@]}" systemctl is-active --quiet "${SERVICE_NAME}" || {
  "${SUDO[@]}" systemctl --no-pager --full status "${SERVICE_NAME}" || true
  fail "The ${SERVICE_NAME} service did not start."
}
trap - EXIT
rm -f "${TMP_SERVICE}"
log "Deployment complete: http://${HOST}:${PORT}/"
