#!/usr/bin/env bash
# Source acquisition and production build.

fetch_release() {
  step "Application source"

  # Running from a checkout (git clone / extracted tarball)? Use it directly
  # instead of downloading a release the user may not have published yet.
  if [[ -z "${ORYZ_SOURCE_DIR:-}" && -n "${SCRIPT_DIR:-}" && -f "$SCRIPT_DIR/../package.json" ]]; then
    ORYZ_SOURCE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
    info "using the local checkout at ${ORYZ_SOURCE_DIR}"
  fi

  # `panelctl rebuild` runs from the installed copy: its SCRIPT_DIR resolves to
  # /opt/oryz/app/deploy, so the "checkout" is the install itself. Copying it
  # over itself would be pointless (and clobber files mid-read).
  if [[ "${ORYZ_SOURCE_DIR:-}" == "$ORYZ_APP_DIR" ]]; then
    unset ORYZ_SOURCE_DIR
    normalize_panel_permissions
    check_row "Source" "installed copy reused" ok
    return 0
  fi


  if [[ -n "${ORYZ_SOURCE_DIR:-}" ]]; then
    [[ -f "$ORYZ_SOURCE_DIR/package.json" ]] ||
      die "no package.json in ${ORYZ_SOURCE_DIR} — point --source at the project root"
    log "copying local source from ${ORYZ_SOURCE_DIR}…"
    install -d -o "$ORYZ_USER" -g "$ORYZ_GROUP" -m 0750 "$ORYZ_APP_DIR"
    tar -C "$ORYZ_SOURCE_DIR" --exclude=node_modules --exclude=.git \
      --exclude=./.env --exclude=./.env.local --exclude=./.env.production -cf - . |
      tar -C "$ORYZ_APP_DIR" -xf -
    rm -f "$ORYZ_APP_DIR/.env"
  elif [[ -f "$ORYZ_APP_DIR/package.json" && "${ORYZ_REFETCH:-0}" != "1" ]]; then
    check_row "Source" "existing checkout reused" ok
  else
    log "downloading release archive…"
    local tmp; tmp="$(mktemp -d)"
    curl -fsSL "$ORYZ_RELEASE_URL" -o "$tmp/release.tar.gz" || die \
"could not download ${ORYZ_RELEASE_URL} (HTTP error).
    The release repository is not reachable. Either:
      • run the installer from a checkout:  git clone <your-repo> && cd <repo>/deploy && sudo ./install.sh
      • or point it at a source tree:       sudo ./install.sh --source /path/to/oryz
      • or set a valid archive URL:         ORYZ_RELEASE_URL=https://…/archive.tar.gz"
    tar -xzf "$tmp/release.tar.gz" -C "$tmp"
    local root; root="$(find "$tmp" -maxdepth 2 -name package.json -printf '%h\n' | awk 'NR==1')"
    [[ -n "$root" ]] || die "release archive did not contain a package.json"
    install -d -o "$ORYZ_USER" -g "$ORYZ_GROUP" -m 0750 "$ORYZ_APP_DIR"
    tar -C "$root" -cf - . | tar -C "$ORYZ_APP_DIR" -xf -
    rm -rf "$tmp"
  fi

  normalize_panel_permissions
  local version; version="$(node -p "require('$ORYZ_APP_DIR/package.json').version" 2>/dev/null || echo unknown)"
  printf '%s\n' "$version" >"$ORYZ_HOME/VERSION"
  check_row "Version" "$version" ok
}

build_application() {
  step "Build"
  log "installing production dependencies (this takes a few minutes)…"
  run_as_app "pnpm install --frozen-lockfile --prod=false" >/dev/null 2>&1 ||
    run_as_app "pnpm install --prod=false" >/dev/null

  # Self-hosted installs run on plain Node behind systemd, so the server bundle
  # must target Node. Without this the build defaults to a Cloudflare Worker
  # module, which `node .output/server/index.mjs` cannot serve (the unit starts,
  # binds nothing and restarts forever).
  # Vite inlines VITE_* at build time. Without them the generated backend
  # client throws on first use in the browser, hydration dies and every page
  # renders blank after the SSR HTML flashes.
  local sb_url sb_key google_auth
  google_auth="$(env_get GOOGLE_AUTH_ENABLED || true)"; google_auth="${google_auth:-false}"
  sb_url="$(env_get VITE_SUPABASE_URL || true)"; sb_url="${sb_url:-$(env_get SUPABASE_URL || true)}"
  sb_key="$(env_get VITE_SUPABASE_PUBLISHABLE_KEY || true)"; sb_key="${sb_key:-$(env_get SUPABASE_PUBLISHABLE_KEY || true)}"
  if [[ -z "$sb_url" || -z "$sb_key" ]]; then
    warn "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are unset — the panel will build,
        but sign-in stays disabled. Set them and rerun 'panelctl rebuild':
          panelctl config set SUPABASE_URL https://…
          panelctl config set SUPABASE_PUBLISHABLE_KEY …"
  fi

  log "building the panel (Node server target)…"
  run_as_app "NODE_ENV=production NITRO_PRESET=node-server SERVER_PRESET=node-server \
    VITE_SUPABASE_URL='${sb_url}' VITE_SUPABASE_PUBLISHABLE_KEY='${sb_key}' \
    VITE_ORYZ_GOOGLE_AUTH='${google_auth}' \
    pnpm run build" >/dev/null

  local entry="$ORYZ_APP_DIR/.output/server/index.mjs"
  [[ -f "$entry" ]] ||
    die "build finished but produced no Node server entry at ${entry}"
  grep -qE 'node:http|createServer|\.listen\(' "$entry" 2>/dev/null ||
    warn "the server bundle does not look like a Node server — if oryz-web fails to bind, rebuild with NITRO_PRESET=node-server"

  log "pruning development dependencies…"
  run_as_app "pnpm prune --prod" >/dev/null 2>&1 || true

  log "cleaning temporary artefacts…"
  run_as_app "rm -rf .vite node_modules/.cache .pnpm-store 2>/dev/null" || true
  find "$ORYZ_APP_DIR" -name '*.map' -path '*/.output/*' -delete 2>/dev/null || true

  normalize_panel_permissions
  local size; size="$(du -sh "$ORYZ_APP_DIR" 2>/dev/null | cut -f1)"
  check_row "Build output" "ready (${size:-?} on disk)" ok
  success "application built"
}
