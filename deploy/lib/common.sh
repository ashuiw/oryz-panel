#!/usr/bin/env bash
# Oryz Panel — shared shell library.
# Sourced by install.sh, panelctl and every lib/*.sh module.
# No side effects beyond defining variables and functions.

set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Paths and defaults
# ---------------------------------------------------------------------------
ORYZ_NAME="Oryz Panel"
ORYZ_SLUG="oryz"
ORYZ_USER="${ORYZ_USER:-oryz}"
ORYZ_GROUP="${ORYZ_GROUP:-oryz}"
ORYZ_HOME="${ORYZ_HOME:-/opt/oryz}"
ORYZ_APP_DIR="${ORYZ_APP_DIR:-$ORYZ_HOME/app}"
ORYZ_ENV_FILE="${ORYZ_ENV_FILE:-/etc/oryz/oryz.env}"
ORYZ_ENV_DIR="$(dirname "$ORYZ_ENV_FILE")"
ORYZ_STATE_DIR="${ORYZ_STATE_DIR:-/var/lib/oryz}"
ORYZ_BACKUP_DIR="${ORYZ_BACKUP_DIR:-$ORYZ_STATE_DIR/backups}"
ORYZ_LOG_DIR="${ORYZ_LOG_DIR:-/var/log/oryz}"
ORYZ_LOG_FILE="${ORYZ_LOG_FILE:-$ORYZ_LOG_DIR/install.log}"
ORYZ_RELEASE_URL="${ORYZ_RELEASE_URL:-https://github.com/oryz-panel/oryz/archive/refs/heads/main.tar.gz}"

NODE_MAJOR_REQUIRED="${NODE_MAJOR_REQUIRED:-22}"
MIN_RAM_MB="${MIN_RAM_MB:-2048}"
MIN_CPU_CORES="${MIN_CPU_CORES:-2}"
MIN_DISK_MB="${MIN_DISK_MB:-10240}"

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
if [[ -t 1 && "${NO_COLOR:-}" == "" ]]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'; C_CYAN=$'\033[36m'
else
  C_RESET=""; C_DIM=""; C_BOLD=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_CYAN=""
fi

_log_raw() {
  # Secrets are never routed here; callers pass redacted text only.
  [[ -d "$ORYZ_LOG_DIR" ]] || return 0
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$1" >>"$ORYZ_LOG_FILE" 2>/dev/null || true
}

log()      { printf '%s\n' "  $1"; _log_raw "$1"; }
info()     { printf '%s\n' "${C_BLUE}::${C_RESET} $1"; _log_raw "INFO $1"; }
success()  { printf '%s\n' "${C_GREEN} ok ${C_RESET} $1"; _log_raw "OK $1"; }
warn()     { printf '%s\n' "${C_YELLOW} !! ${C_RESET} $1" >&2; _log_raw "WARN $1"; }
error()    { printf '%s\n' "${C_RED}fail${C_RESET} $1" >&2; _log_raw "ERROR $1"; }
die()      { error "$1"; exit "${2:-1}"; }
dim()      { printf '%s\n' "${C_DIM}$1${C_RESET}"; }

step() {
  printf '\n%s\n' "${C_BOLD}${C_CYAN}==>${C_RESET} ${C_BOLD}$1${C_RESET}"
  _log_raw "STEP $1"
}

banner() {
  printf '\n%s\n' "${C_BOLD}${C_CYAN}"
  cat <<'ART'
   _  _     _         _
  | \| |___| |__ _  _| |__ _
  | .` / -_) '_ \ || | / _` |
  |_|\_\___|_.__/\_,_|_\__,_|
ART
  printf '%s' "${C_RESET}"
  printf '  %s\n\n' "${C_DIM}Game server control panel · self-hosted installer${C_RESET}"
}

# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------
ORYZ_CLEANUP_HOOKS=()
on_cleanup() { ORYZ_CLEANUP_HOOKS+=("$1"); }

_trap_err() {
  local code=$? line=${1:-?}
  error "aborted at line $line (exit $code)"
  local hook
  for hook in "${ORYZ_CLEANUP_HOOKS[@]:-}"; do
    [[ -n "$hook" ]] && eval "$hook" || true
  done
  [[ -f "$ORYZ_LOG_FILE" ]] && dim "  full log: $ORYZ_LOG_FILE"
  exit "$code"
}
enable_error_trap() { trap '_trap_err $LINENO' ERR; }

# ---------------------------------------------------------------------------
# Environment checks
# ---------------------------------------------------------------------------
require_root() {
  [[ ${EUID:-$(id -u)} -eq 0 ]] || die "this command must run as root (try: sudo $0 $*)"
}

has_cmd() { command -v "$1" >/dev/null 2>&1; }

is_interactive() { [[ "${ORYZ_NON_INTERACTIVE:-0}" != "1" && -t 0 ]]; }

# ---------------------------------------------------------------------------
# Prompts (no-ops in non-interactive mode; defaults must be pre-set)
# ---------------------------------------------------------------------------
ask() {
  # ask VAR "Prompt" "default"
  local var="$1" prompt="$2" default="${3:-}" reply
  local current="${!var:-}"
  if [[ -n "$current" ]]; then return 0; fi
  if ! is_interactive; then
    [[ -n "$default" ]] || die "missing required value for $var in non-interactive mode"
    printf -v "$var" '%s' "$default"
    return 0
  fi
  if [[ -n "$default" ]]; then
    read -r -p "  $prompt [${default}]: " reply || true
    reply="${reply:-$default}"
  else
    while :; do
      read -r -p "  $prompt: " reply || true
      [[ -n "$reply" ]] && break
      warn "a value is required"
    done
  fi
  printf -v "$var" '%s' "$reply"
}

ask_secret() {
  # ask_secret VAR "Prompt" — never echoed, never logged
  local var="$1" prompt="$2" reply confirm
  [[ -n "${!var:-}" ]] && return 0
  if ! is_interactive; then die "missing required secret $var in non-interactive mode"; fi
  while :; do
    read -r -s -p "  $prompt: " reply; echo
    read -r -s -p "  confirm: " confirm; echo
    [[ "$reply" == "$confirm" && -n "$reply" ]] && break
    warn "values did not match or were empty"
  done
  printf -v "$var" '%s' "$reply"
}

confirm() {
  # confirm "Question" [default y|n]
  local prompt="$1" default="${2:-n}" reply
  if ! is_interactive; then [[ "${ORYZ_ASSUME_YES:-0}" == "1" || "$default" == "y" ]]; return; fi
  local hint="y/N"; [[ "$default" == "y" ]] && hint="Y/n"
  read -r -p "  $prompt [$hint]: " reply || true
  reply="${reply:-$default}"
  [[ "$reply" =~ ^[Yy] ]]
}

ask_choice() {
  # ask_choice VAR "Prompt" default option...
  local var="$1" prompt="$2" default="$3"; shift 3
  local options=("$@") i reply
  [[ -n "${!var:-}" ]] && return 0
  if ! is_interactive; then printf -v "$var" '%s' "$default"; return 0; fi
  printf '  %s\n' "$prompt"
  for i in "${!options[@]}"; do
    printf '    %s) %s%s\n' "$((i + 1))" "${options[$i]}" \
      "$([[ "${options[$i]}" == "$default" ]] && echo "  ${C_DIM}(default)${C_RESET}")"
  done
  read -r -p "  choice [1-${#options[@]}]: " reply || true
  if [[ "$reply" =~ ^[0-9]+$ ]] && (( reply >= 1 && reply <= ${#options[@]} )); then
    printf -v "$var" '%s' "${options[$((reply - 1))]}"
  else
    printf -v "$var" '%s' "$default"
  fi
}

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
valid_domain()  { [[ "$1" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$ ]]; }
valid_email()   { [[ "$1" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$ ]]; }
valid_port()    { [[ "$1" =~ ^[0-9]+$ ]] && (( $1 >= 1 && $1 <= 65535 )); }
valid_ident()   { [[ "$1" =~ ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$ ]]; }

require_valid() {
  # require_valid validator VAR "message"
  local fn="$1" var="$2" msg="$3"
  "$fn" "${!var:-}" || die "invalid value for $var — $msg"
}

# ---------------------------------------------------------------------------
# Secrets
# ---------------------------------------------------------------------------
gen_secret() {
  # gen_secret [bytes] -> url-safe base64, cryptographically random
  local bytes="${1:-48}"
  if has_cmd openssl; then
    openssl rand -base64 "$bytes" | tr -d '\n=' | tr '+/' '-_'
  else
    head -c "$bytes" /dev/urandom | base64 | tr -d '\n=' | tr '+/' '-_'
  fi
}

gen_hex() { local bytes="${1:-32}"; od -An -tx1 -N "$bytes" /dev/urandom | tr -d ' \n'; }

gen_password() {
  # Alphanumeric only — safe inside connection URLs without escaping.
  # NOTE: never pipe an unbounded /dev/urandom stream into `head` — head exits
  # early, the upstream process dies with SIGPIPE and `set -o pipefail` turns
  # that into exit 141, aborting the installer. Read a bounded chunk instead.
  local len="${1:-32}" out=""
  while (( ${#out} < len )); do
    out+="$(head -c $(( (len + 16) * 3 )) /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' || true)"
  done
  printf '%s' "${out:0:len}"
}

# ---------------------------------------------------------------------------
# Env file helpers (0600, root:oryz)
# ---------------------------------------------------------------------------
env_set() {
  # env_set KEY VALUE [file]
  local key="$1" value="$2" file="${3:-$ORYZ_ENV_FILE}"
  install -d -m 0750 "$(dirname "$file")"
  [[ -f "$file" ]] || { : >"$file"; chmod 0600 "$file"; }
  if grep -qE "^${key}=" "$file"; then
    local tmp; tmp="$(mktemp)"; chmod 0600 "$tmp"
    grep -vE "^${key}=" "$file" >"$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
    cat "$tmp" >"$file"
    rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

env_get() {
  local key="$1" file="${2:-$ORYZ_ENV_FILE}"
  [[ -f "$file" ]] || return 1
  sed -n "s/^${key}=//p" "$file" | tail -n1
}

env_load() {
  local file="${1:-$ORYZ_ENV_FILE}"
  [[ -f "$file" ]] || return 1
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

secure_env_file() {
  local file="${1:-$ORYZ_ENV_FILE}"
  chown "root:${ORYZ_GROUP}" "$file" 2>/dev/null || true
  chmod 0640 "$file"
}

redact() { printf '%s' "${1:0:2}****"; }

# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------
timestamp() { date -u +%Y%m%d-%H%M%S; }

run_as_app() {
  # Execute a command as the unprivileged service account inside the app dir.
  runuser -u "$ORYZ_USER" -- env HOME="$ORYZ_HOME" PATH="$PATH" bash -lc "cd '$ORYZ_APP_DIR' && $*"
}

port_in_use() {
  if has_cmd ss; then ss -ltn "( sport = :$1 )" 2>/dev/null | grep -q LISTEN
  else has_cmd lsof && lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; fi
}

service_active() { systemctl is-active --quiet "$1"; }
