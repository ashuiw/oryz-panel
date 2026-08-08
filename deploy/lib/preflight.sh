#!/usr/bin/env bash
# Operating system detection and hardware preflight validation.

# --- distribution support matrix ------------------------------------------
# Add a distribution by appending an entry here and, if its package names
# differ, a branch in lib/deps.sh::pkg_install.
SUPPORTED_MATRIX=(
  "ubuntu:22.04:Ubuntu 22.04 LTS"
  "ubuntu:24.04:Ubuntu 24.04 LTS"
  "debian:12:Debian 12 (bookworm)"
  "debian:13:Debian 13 (trixie)"
)

OS_ID=""; OS_VERSION=""; OS_CODENAME=""; OS_PRETTY=""; OS_FAMILY=""
CPU_CORES=0; RAM_MB=0; DISK_MB=0; VIRT_TYPE="unknown"; ARCH=""

detect_os() {
  [[ -r /etc/os-release ]] || die "cannot read /etc/os-release — unsupported system"
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID:-unknown}"
  OS_VERSION="${VERSION_ID:-unknown}"
  OS_CODENAME="${VERSION_CODENAME:-}"
  OS_PRETTY="${PRETTY_NAME:-$OS_ID $OS_VERSION}"
  ARCH="$(uname -m)"
  case "$OS_ID" in
    ubuntu|debian) OS_FAMILY="debian" ;;
    *) OS_FAMILY="${ID_LIKE:-unknown}" ;;
  esac
}

os_supported() {
  local entry id ver
  for entry in "${SUPPORTED_MATRIX[@]}"; do
    IFS=: read -r id ver _ <<<"$entry"
    [[ "$OS_ID" == "$id" && "$OS_VERSION" == "$ver" ]] && return 0
  done
  return 1
}

print_supported_matrix() {
  local entry label
  for entry in "${SUPPORTED_MATRIX[@]}"; do
    label="${entry##*:}"
    printf '    · %s\n' "$label"
  done
}

detect_virtualization() {
  if has_cmd systemd-detect-virt; then
    VIRT_TYPE="$(systemd-detect-virt 2>/dev/null || echo none)"
  elif [[ -r /proc/cpuinfo ]] && grep -qi hypervisor /proc/cpuinfo; then
    VIRT_TYPE="virtualized"
  else
    VIRT_TYPE="none"
  fi
}

detect_hardware() {
  CPU_CORES="$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1)"
  RAM_MB="$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
  DISK_MB="$(df -Pm "${ORYZ_HOME%/*}" 2>/dev/null | awk 'NR==2 {print $4}' || echo 0)"
  [[ -n "$DISK_MB" ]] || DISK_MB=0
}

detect_conflicts() {
  CONFLICTS=()
  # Another panel already installed here
  [[ -d "$ORYZ_APP_DIR" && -n "$(ls -A "$ORYZ_APP_DIR" 2>/dev/null)" ]] &&
    CONFLICTS+=("existing installation at $ORYZ_APP_DIR")
  [[ -f "$ORYZ_ENV_FILE" ]] && CONFLICTS+=("existing configuration at $ORYZ_ENV_FILE")
  # Competing web servers / panels holding :80 or :443
  local p
  for p in 80 443; do
    port_in_use "$p" && CONFLICTS+=("port $p already bound")
  done
  for svc in apache2 lighttpd pterodactyl-panel; do
    systemctl list-unit-files 2>/dev/null | grep -q "^${svc}" &&
      CONFLICTS+=("conflicting service unit: ${svc}")
  done
  ((${#CONFLICTS[@]})) || return 1
  return 0
}

check_row() {
  # check_row "label" "value" ok|warn|fail
  local label="$1" value="$2" state="$3" mark
  case "$state" in
    ok)   mark="${C_GREEN}ok  ${C_RESET}" ;;
    warn) mark="${C_YELLOW}warn${C_RESET}" ;;
    *)    mark="${C_RED}fail${C_RESET}" ;;
  esac
  printf '  %s  %-22s %s\n' "$mark" "$label" "$value"
  _log_raw "CHECK $label=$value ($state)"
}

run_preflight() {
  step "System validation"
  detect_os; detect_virtualization; detect_hardware

  local failures=0

  if os_supported; then
    check_row "Operating system" "$OS_PRETTY" ok
  else
    check_row "Operating system" "$OS_PRETTY" fail
    error "unsupported operating system. Supported releases:"
    print_supported_matrix
    if [[ "${ORYZ_FORCE_OS:-0}" == "1" ]]; then
      warn "ORYZ_FORCE_OS=1 — continuing on an unsupported system, unsupported by the project"
    else
      die "refusing to install on an unsupported operating system (override with ORYZ_FORCE_OS=1)"
    fi
  fi

  case "$ARCH" in
    x86_64|aarch64) check_row "Architecture" "$ARCH" ok ;;
    *) check_row "Architecture" "$ARCH" fail; ((failures += 1)) ;;
  esac

  check_row "Virtualization" "$VIRT_TYPE" ok
  if [[ "$VIRT_TYPE" == "openvz" || "$VIRT_TYPE" == "lxc" ]]; then
    warn "container virtualization detected — Docker-based game servers may not run on this host"
  fi

  if (( CPU_CORES >= MIN_CPU_CORES )); then
    check_row "CPU cores" "$CPU_CORES (min $MIN_CPU_CORES)" ok
  else
    check_row "CPU cores" "$CPU_CORES (min $MIN_CPU_CORES)" warn
  fi

  if (( RAM_MB >= MIN_RAM_MB )); then
    check_row "Memory" "${RAM_MB} MB (min ${MIN_RAM_MB} MB)" ok
  else
    check_row "Memory" "${RAM_MB} MB (min ${MIN_RAM_MB} MB)" fail
    ((failures += 1))
  fi

  if (( DISK_MB >= MIN_DISK_MB )); then
    check_row "Free disk" "${DISK_MB} MB (min ${MIN_DISK_MB} MB)" ok
  else
    check_row "Free disk" "${DISK_MB} MB (min ${MIN_DISK_MB} MB)" fail
    ((failures += 1))
  fi

  if has_cmd systemctl; then
    check_row "Init system" "systemd" ok
  else
    check_row "Init system" "systemd not found" fail; ((failures += 1))
  fi

  if getent hosts deb.debian.org >/dev/null 2>&1 || getent hosts archive.ubuntu.com >/dev/null 2>&1; then
    check_row "Network / DNS" "reachable" ok
  else
    check_row "Network / DNS" "package mirrors unreachable" fail; ((failures += 1))
  fi

  if detect_conflicts; then
    local c
    for c in "${CONFLICTS[@]}"; do check_row "Conflict" "$c" warn; done
    if [[ "${ORYZ_UPGRADE_IN_PLACE:-0}" != "1" ]]; then
      confirm "Continue and overwrite conflicting state?" n ||
        die "installation cancelled — resolve the conflicts above or run 'panelctl uninstall' first"
    fi
  else
    check_row "Conflicts" "none detected" ok
  fi

  (( failures == 0 )) || die "$failures blocking requirement(s) not met"
  success "system validation passed"
}
