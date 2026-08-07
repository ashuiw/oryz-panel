#!/usr/bin/env bash
# Component selection: what this host should run.
#
#   panel        the web panel, database, redis, reverse proxy
#   wings        the node daemon that actually runs game containers
#   panel+wings  both on one machine (small deployments, evaluation)
#
# Wings is deliberately installable on its own: a wings-only host produces a
# portable node configuration that can be registered with ANY Oryz panel,
# not just one running on the same machine.

collect_components() {
  step "What do you want to install?"
  cat <<EOF
  1) panel+wings   panel and one local node on this machine
  2) panel         panel only — nodes are installed separately
  3) wings         node daemon only — attaches to an existing panel

EOF
  ask_choice INSTALL_COMPONENTS "Selection:" "${INSTALL_COMPONENTS:-panel+wings}" \
    "panel+wings" "panel" "wings"

  case "$INSTALL_COMPONENTS" in
    panel)       INSTALL_PANEL=yes; INSTALL_WINGS=no ;;
    wings)       INSTALL_PANEL=no;  INSTALL_WINGS=yes ;;
    panel+wings) INSTALL_PANEL=yes; INSTALL_WINGS=yes ;;
    *) die "invalid INSTALL_COMPONENTS: $INSTALL_COMPONENTS (panel | wings | panel+wings)" ;;
  esac

  # Wings runs containers, so Docker is mandatory wherever it is installed.
  [[ "$INSTALL_WINGS" == "yes" ]] && INSTALL_DOCKER=yes

  export INSTALL_PANEL INSTALL_WINGS INSTALL_DOCKER
}

installing_panel() { [[ "${INSTALL_PANEL:-yes}" == "yes" ]]; }
installing_wings() { [[ "${INSTALL_WINGS:-no}"  == "yes" ]]; }
