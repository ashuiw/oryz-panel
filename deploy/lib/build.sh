#!/usr/bin/env bash
# Source acquisition and production build.

fetch_release() {
  step "Application source"
  if [[ -n "${ORYZ_SOURCE_DIR:-}" ]]; then
    log "copying local source from ${ORYZ_SOURCE_DIR}…"
    install -d -o "$ORYZ_USER" -g "$ORYZ_GROUP" -m 0750 "$ORYZ_APP_DIR"
    tar -C "$ORYZ_SOURCE_DIR" --exclude=node_modules --exclude=.git -cf - . |
      tar -C "$ORYZ_APP_DIR" -xf -
  elif [[ -f "$ORYZ_APP_DIR/package.json" && "${ORYZ_REFETCH:-0}" != "1" ]]; then
    check_row "Source" "existing checkout reused" ok
  else
    log "downloading release archive…"
    local tmp; tmp="$(mktemp -d)"
    curl -fsSL "$ORYZ_RELEASE_URL" -o "$tmp/release.tar.gz"
    tar -xzf "$tmp/release.tar.gz" -C "$tmp"
    local root; root="$(find "$tmp" -maxdepth 2 -name package.json -printf '%h\n' | head -n1)"
    [[ -n "$root" ]] || die "release archive did not contain a package.json"
    install -d -o "$ORYZ_USER" -g "$ORYZ_GROUP" -m 0750 "$ORYZ_APP_DIR"
    tar -C "$root" -cf - . | tar -C "$ORYZ_APP_DIR" -xf -
    rm -rf "$tmp"
  fi
  chown -R "$ORYZ_USER:$ORYZ_GROUP" "$ORYZ_APP_DIR"
  local version; version="$(node -p "require('$ORYZ_APP_DIR/package.json').version" 2>/dev/null || echo unknown)"
  printf '%s\n' "$version" >"$ORYZ_HOME/VERSION"
  check_row "Version" "$version" ok
}

build_application() {
  step "Build"
  log "installing production dependencies (this takes a few minutes)…"
  run_as_app "pnpm install --frozen-lockfile --prod=false" >/dev/null 2>&1 ||
    run_as_app "pnpm install --prod=false" >/dev/null

  log "building the panel…"
  run_as_app "NODE_ENV=production pnpm run build" >/dev/null

  [[ -d "$ORYZ_APP_DIR/.output" || -d "$ORYZ_APP_DIR/dist" ]] ||
    die "build finished but produced no output directory"

  log "pruning development dependencies…"
  run_as_app "pnpm prune --prod" >/dev/null 2>&1 || true

  log "cleaning temporary artefacts…"
  run_as_app "rm -rf .vite node_modules/.cache .pnpm-store 2>/dev/null" || true
  find "$ORYZ_APP_DIR" -name '*.map' -path '*/.output/*' -delete 2>/dev/null || true

  chown -R "$ORYZ_USER:$ORYZ_GROUP" "$ORYZ_APP_DIR"
  local size; size="$(du -sh "$ORYZ_APP_DIR" 2>/dev/null | cut -f1)"
  check_row "Build output" "ready (${size:-?} on disk)" ok
  success "application built"
}
