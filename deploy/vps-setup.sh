#!/usr/bin/env bash
# =============================================================================
# Oncident VPS Deployment Script
#
# Run this on your fresh VPS (Ubuntu 22.04/24.04, Debian 12, etc.)
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/deploy/vps-setup.sh | bash
#   # OR, after cloning manually:
#   bash deploy/vps-setup.sh
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration (override with env vars if desired)
# ---------------------------------------------------------------------------
REPO_URL="${REPO_URL:-}"
APP_DIR="${APP_DIR:-$HOME/oncident}"
DOMAIN="${DOMAIN:-}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info() { echo -e "\033[1;34m[INFO]\033[0m $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $*"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $*"; exit 1; }

# ---------------------------------------------------------------------------
# 1. System dependencies
# ---------------------------------------------------------------------------
install_deps() {
  info "Installing system dependencies..."
  sudo apt-get update
  sudo apt-get install -y \
    ca-certificates \
    curl \
    git \
    jq

  # Docker (official repo)
  if ! command -v docker &>/dev/null; then
    info "Installing Docker..."

    # Detect distro (Ubuntu vs Debian) for the correct repo URL
    . /etc/os-release
    DOCKER_DIST="${ID}"
    DOCKER_CODENAME="${VERSION_CODENAME}"
    if [ "$DOCKER_DIST" = "debian" ]; then
      DOCKER_URL="https://download.docker.com/linux/debian"
    else
      DOCKER_URL="https://download.docker.com/linux/ubuntu"
    fi

    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL "${DOCKER_URL}/gpg" -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] ${DOCKER_URL} ${DOCKER_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker "$USER"
    info "Docker installed. You may need to log out and back in for group changes to take effect."
  else
    info "Docker already installed."
  fi
}

# ---------------------------------------------------------------------------
# 2. Clone repo
# ---------------------------------------------------------------------------
clone_repo() {
  if [ -d "$APP_DIR/.git" ]; then
    info "Repo already exists at $APP_DIR. Pulling latest..."
    BRANCH=$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)
    git -C "$APP_DIR" fetch origin "$BRANCH"
    git -C "$APP_DIR" merge --ff-only "origin/$BRANCH" || \
      error "Fast-forward failed on $APP_DIR. Resolve manually and re-run."
  else
    if [ -z "$REPO_URL" ]; then
      error "REPO_URL is not set. Either export it or clone the repo manually to $APP_DIR."
    fi
    info "Cloning repo to $APP_DIR..."
    git clone "$REPO_URL" "$APP_DIR"
  fi
}

# ---------------------------------------------------------------------------
# 3. Environment setup
# ---------------------------------------------------------------------------
setup_env() {
  cd "$APP_DIR"

  if [ ! -f .env ]; then
    info "Creating .env from template..."
    cp .env.example .env

    # Generate a random Postgres password
    RANDOM_PASS=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)
    sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$RANDOM_PASS/" .env
    info "Generated random POSTGRES_PASSWORD in .env"
  fi

  if [ -n "$DOMAIN" ]; then
    info "Configuring for domain: $DOMAIN"
    # If Caddyfile exists, we can auto-configure it later
  fi
}

# ---------------------------------------------------------------------------
# 4. Build & run
# ---------------------------------------------------------------------------
deploy() {
  cd "$APP_DIR"
  info "Building and starting services..."

  # Ensure user is in docker group (warn if not)
  if ! groups "$USER" | grep -q '\bdocker\b'; then
    warn "Current user is not in the 'docker' group."
    warn "Either run: newgrp docker"
    warn "Or the build below may fail. Re-logging in will fix this permanently."
  fi

  docker compose pull
  docker compose build
  docker compose up -d

  # Run DB migrations
  info "Running database migrations (drizzle-kit push)..."
  docker compose exec -T api npx drizzle-kit push --config ./lib/db/drizzle.config.ts || \
    warn "Migration failed or already applied. Check logs with: docker compose logs api"

  info "Deployment complete!"
}

# ---------------------------------------------------------------------------
# 5. (Optional) Caddy HTTPS setup
# ---------------------------------------------------------------------------
setup_caddy() {
  if [ -z "$DOMAIN" ]; then
    info "No DOMAIN set. Skipping Caddy HTTPS setup."
    info "Access the app at: http://YOUR_VPS_IP:3000"
    return
  fi

  info "Setting up Caddy for HTTPS on $DOMAIN..."

  # Create Caddyfile
  mkdir -p deploy
  cat > deploy/Caddyfile <<EOF
$DOMAIN {
  reverse_proxy api:3000
}
EOF

  info "Caddy configured. Running docker compose up with HTTPS profile..."
  COMPOSE_PROFILES=https docker compose up -d

  info "Caddy will automatically request an HTTPS certificate for $DOMAIN."
  info "Make sure DNS for $DOMAIN points to this server's IP."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  info "Starting Oncident VPS deployment..."

  install_deps
  clone_repo
  setup_env
  deploy
  setup_caddy

  echo ""
  info "=============================="
  info "Deployment finished!"
  if [ -n "$DOMAIN" ]; then
    info "App URL: https://$DOMAIN"
  else
    info "App URL: http://$(curl -s ifconfig.me || echo 'YOUR_VPS_IP'):3000"
  fi
  info "Logs:    docker compose logs -f api"
  info "DB:      docker compose exec postgres psql -U oncident -d oncident"
  info "=============================="
}

main "$@"
