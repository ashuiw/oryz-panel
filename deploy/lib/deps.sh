#!/usr/bin/env bash
# Dependency detection and installation. Only missing packages are installed.

APT_UPDATED=0

apt_refresh() {
  (( APT_UPDATED )) && return 0
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  APT_UPDATED=1
}

pkg_install() {
  # pkg_install pkg...
  case "$OS_FAMILY" in
    debian)
      apt_refresh
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "$@" >/dev/null
      ;;
    *) die "no package installer implemented for OS family '$OS_FAMILY'" ;;
  esac
}

ensure_cmd() {
  # ensure_cmd command package [label]
  local cmd="$1" pkg="$2" label="${3:-$1}"
  if has_cmd "$cmd"; then
    check_row "$label" "present ($(command -v "$cmd"))" ok
  else
    log "installing $label…"
    pkg_install "$pkg"
    has_cmd "$cmd" || die "failed to install $label"
    check_row "$label" "installed" ok
  fi
}

install_base_tools() {
  step "Base dependencies"
  ensure_cmd curl curl
  ensure_cmd git git
  ensure_cmd unzip unzip
  ensure_cmd tar tar
  ensure_cmd openssl openssl
  ensure_cmd gpg gnupg gnupg
  ensure_cmd ss iproute2 "iproute2"
  pkg_install ca-certificates apt-transport-https xz-utils >/dev/null 2>&1 || true
}

node_major() { has_cmd node && node -v | sed 's/^v\([0-9]*\).*/\1/' || echo 0; }

install_node() {
  step "Node.js ${NODE_MAJOR_REQUIRED}.x"
  local current; current="$(node_major)"
  if (( current >= NODE_MAJOR_REQUIRED )); then
    check_row "Node.js" "$(node -v) (satisfies >= ${NODE_MAJOR_REQUIRED})" ok
  else
    (( current > 0 )) && warn "Node.js v${current} is older than the required v${NODE_MAJOR_REQUIRED}; upgrading"
    log "adding NodeSource repository…"
    install -d -m 0755 /usr/share/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
      gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
    chmod 0644 /usr/share/keyrings/nodesource.gpg
    printf 'deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_%s.x nodistro main\n' \
      "$NODE_MAJOR_REQUIRED" >/etc/apt/sources.list.d/nodesource.list
    APT_UPDATED=0
    pkg_install nodejs
    (( $(node_major) >= NODE_MAJOR_REQUIRED )) || die "Node.js installation did not produce v${NODE_MAJOR_REQUIRED}+"
    check_row "Node.js" "$(node -v) installed" ok
  fi

  if has_cmd pnpm; then
    check_row "pnpm" "$(pnpm --version)" ok
  else
    log "enabling pnpm via corepack…"
    corepack enable >/dev/null 2>&1 || npm install -g pnpm >/dev/null 2>&1
    corepack prepare pnpm@latest --activate >/dev/null 2>&1 || true
    has_cmd pnpm || die "failed to install pnpm"
    check_row "pnpm" "$(pnpm --version) installed" ok
  fi
}

install_postgres() {
  step "PostgreSQL"
  if [[ "${DB_MODE:-local}" == "remote" ]]; then
    ensure_cmd psql postgresql-client "PostgreSQL client"
    check_row "PostgreSQL server" "remote (${DB_HOST}:${DB_PORT})" ok
    return 0
  fi
  if has_cmd psql && systemctl list-unit-files | grep -q '^postgresql'; then
    check_row "PostgreSQL" "$(psql --version | awk '{print $3}') present" ok
  else
    log "installing PostgreSQL server…"
    pkg_install postgresql postgresql-contrib
    check_row "PostgreSQL" "$(psql --version | awk '{print $3}') installed" ok
  fi
  systemctl enable --now postgresql >/dev/null 2>&1 || true
  service_active postgresql || die "PostgreSQL failed to start"
}

install_redis() {
  step "Redis"
  if [[ "${REDIS_MODE:-local}" == "remote" ]]; then
    check_row "Redis" "remote (${REDIS_HOST}:${REDIS_PORT})" ok
    return 0
  fi
  if has_cmd redis-server; then
    check_row "Redis" "$(redis-server --version | awk '{print $3}' | cut -d= -f2) present" ok
  else
    log "installing Redis…"
    pkg_install redis-server
    check_row "Redis" "installed" ok
  fi
  # Bind to loopback and require a password when one was generated.
  if [[ -n "${REDIS_PASSWORD:-}" ]] && [[ -f /etc/redis/redis.conf ]]; then
    sed -i 's/^# *requirepass .*/requirepass PLACEHOLDER/' /etc/redis/redis.conf
    if grep -q '^requirepass' /etc/redis/redis.conf; then
      sed -i "s|^requirepass .*|requirepass ${REDIS_PASSWORD}|" /etc/redis/redis.conf
    else
      printf 'requirepass %s\n' "$REDIS_PASSWORD" >>/etc/redis/redis.conf
    fi
    sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
    chmod 0640 /etc/redis/redis.conf
  fi
  systemctl enable --now redis-server >/dev/null 2>&1 || systemctl enable --now redis >/dev/null 2>&1 || true
}

install_docker() {
  [[ "${INSTALL_DOCKER:-no}" == "yes" ]] || return 0
  step "Docker engine"
  if has_cmd docker; then
    check_row "Docker" "$(docker --version | awk '{print $3}' | tr -d ,) present" ok
    return 0
  fi
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" |
    gpg --dearmor --yes -o /usr/share/keyrings/docker.gpg
  chmod 0644 /usr/share/keyrings/docker.gpg
  printf 'deb [arch=%s signed-by=/usr/share/keyrings/docker.gpg] https://download.docker.com/linux/%s %s stable\n' \
    "$(dpkg --print-architecture)" "$OS_ID" "$OS_CODENAME" >/etc/apt/sources.list.d/docker.list
  APT_UPDATED=0
  pkg_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker >/dev/null 2>&1 || true
  check_row "Docker" "installed" ok
}

install_web_server() {
  case "${PROXY_KIND:-nginx}" in
    nginx)
      step "Nginx"
      has_cmd nginx || pkg_install nginx
      check_row "Nginx" "$(nginx -v 2>&1 | awk -F/ '{print $2}')" ok
      ;;
    caddy)
      step "Caddy"
      if ! has_cmd caddy; then
        curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
          gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable.gpg
        chmod 0644 /usr/share/keyrings/caddy-stable.gpg
        printf 'deb [signed-by=/usr/share/keyrings/caddy-stable.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main\n' \
          >/etc/apt/sources.list.d/caddy-stable.list
        APT_UPDATED=0
        pkg_install caddy
      fi
      check_row "Caddy" "$(caddy version 2>/dev/null | head -n1)" ok
      ;;
    traefik)
      step "Traefik"
      warn "Traefik is expected to be managed externally; a config template will be written to ${ORYZ_HOME}/proxy/"
      ;;
    none)
      check_row "Reverse proxy" "skipped (managed externally)" ok
      ;;
  esac
}

install_certbot() {
  [[ "${SSL_MODE:-letsencrypt}" == "letsencrypt" && "${PROXY_KIND:-nginx}" == "nginx" ]] || return 0
  step "Certbot"
  has_cmd certbot || pkg_install certbot python3-certbot-nginx
  check_row "Certbot" "$(certbot --version 2>&1 | awk '{print $2}')" ok
}

install_all_dependencies() {
  install_base_tools
  install_node
  install_postgres
  install_redis
  install_docker
  install_web_server
  install_certbot
  success "all dependencies satisfied"
}
