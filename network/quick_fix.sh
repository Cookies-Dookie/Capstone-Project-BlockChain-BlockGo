#!/bin/bash
# Quick fix: Stop containers, remove bad crypto, and restart with longer wait times

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'

log_info() { echo -e "${GREEN}[QUICK FIX]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log_info "========================================="
log_info "BLOCKGO - Quick Fix for CA Startup"
log_info "========================================="

# Step 1: Stop everything
log_info "Step 1: Stopping all containers..."
docker compose -f docker-compose-main.yaml -f docker-compose-annex.yaml -f docker-compose-pubad.yaml down -v --remove-orphans 2>/dev/null || true
sleep 3

# Step 2: Clean crypto directories (NOT the CA fabric-ca dirs which have TLS certs)
log_info "Step 2: Cleaning failed enrollments..."
rm -rf ./crypto-config-final-v2 ./channel-artifacts-final 2>/dev/null || true

# Step 3: Start CAs ONLY
log_info "Step 3: Starting Certificate Authorities (this will take 30+ seconds)..."
export PATH=$PATH:$(pwd)/bin
export FABRIC_CFG_PATH="$(pwd)/config"

TMP_DOCKER_CFG=$(mktemp -d)
echo "{}" > "$TMP_DOCKER_CFG/config.json"
DOCKER_CONFIG=$TMP_DOCKER_CFG docker compose -f docker-compose-main.yaml -f docker-compose-annex.yaml -f docker-compose-pubad.yaml up -d ca.registrar.capstone.com ca.faculty.capstone.com ca.department.capstone.com cli
rm -rf "$TMP_DOCKER_CFG"

# Step 4: Wait MUCH longer for CAs to initialize
log_info "Step 4: Waiting 60 seconds for CAs to fully initialize..."
sleep 60

log_info "Step 5: Checking CA health..."
for i in 1 2 3; do
    CONTAINER=$(docker ps -q -f name="ca\." | head -1)
    if docker exec $CONTAINER fabric-ca-server version 2>/dev/null | grep -q "fabric-ca-server"; then
        log_info "✓ CA is responding"
        break
    fi
    if [ $i -lt 3 ]; then
        log_info "CA not ready yet, waiting 10 more seconds..."
        sleep 10
    fi
done

log_info "Step 6: Checking port connectivity..."
docker run --rm --network registrar-net alpine sh -c "nc -z -v ca.registrar.capstone.com 7054" 2>&1 || log_error "Cannot reach Registrar CA"
docker run --rm --network faculty-net alpine sh -c "nc -z -v ca.faculty.capstone.com 8054" 2>&1 || log_error "Cannot reach Faculty CA"
docker run --rm --network department-net alpine sh -c "nc -z -v ca.department.capstone.com 9054" 2>&1 || log_error "Cannot reach Department CA"

log_info "✓ All CAs are responding!"
log_info ""
log_info "========================================="
log_info "Now run the full deployment:"
log_info "  bash full_deploy.sh hybrid all"
log_info "========================================="
