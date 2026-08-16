#!/bin/bash
# Fabric Deployment Fix Script

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'

log_info() { echo -e "${GREEN}[FIX]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Step 1: Verify prerequisites
log_info "Step 1: Verifying prerequisites..."
if [ ! -f "./config/configtx.yaml" ]; then
    log_error "configtx.yaml not found in ./config/"
fi

if [ ! -d "./crypto-config-final-v2" ]; then
    log_warn "Crypto directory not found. Enrollment may not have completed successfully."
fi

# Step 2: Clean up failed containers
log_info "Step 2: Cleaning up failed containers..."
docker compose down -v --remove-orphans 2>/dev/null || true
docker rm -f ca.registrar.capstone.com ca.faculty.capstone.com ca.department.capstone.com cli 2>/dev/null || true

# Step 3: Check if enrollment was partially successful
log_info "Step 3: Checking enrollment status..."
if [ -d "./crypto-config-final-v2/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp/signcerts" ]; then
    log_info "Found admin certificates. Enrollment was successful."
    HAS_CERTS=true
else
    log_warn "Admin certificates not found. Enrollment may have failed."
    HAS_CERTS=false
fi

# Step 4: Fix file paths in configtx.yaml (convert relative paths)
log_info "Step 4: Validating and fixing configtx.yaml paths..."
CONFIGTX_PATH="$(pwd)/config/configtx.yaml"

# Check if paths are correct by verifying at least one cert path exists
if ! grep -q "orderer3.capstone.com" "$CONFIGTX_PATH"; then
    log_error "configtx.yaml missing orderer3 configuration. Please ensure it includes 3-node Raft cluster."
fi

# Step 5: Ensure FABRIC_CFG_PATH is correctly set
log_info "Step 5: Setting FABRIC_CFG_PATH..."
export FABRIC_CFG_PATH="$(pwd)/config"
export PATH=$PATH:$(pwd)/bin

log_info "FABRIC_CFG_PATH = $FABRIC_CFG_PATH"
log_info "CONFIG exists: $([ -f "$FABRIC_CFG_PATH/configtx.yaml" ] && echo 'YES' || echo 'NO')"

# Step 6: Verify TLS certificates were created
log_info "Step 6: Checking TLS certificates..."
MISSING_CERTS=0

for orderer in orderer orderer2 orderer3; do
    CERT_PATH="./crypto-config-final-v2/ordererOrganizations/capstone.com/orderers/${orderer}.capstone.com/tls/server.crt"
    if [ ! -f "$CERT_PATH" ]; then
        log_warn "Missing: $CERT_PATH"
        MISSING_CERTS=$((MISSING_CERTS + 1))
    else
        log_info "Found: $CERT_PATH"
    fi
done

# Step 7: Create channel artifacts directory
log_info "Step 7: Creating channel artifacts directory..."
mkdir -p ./channel-artifacts-final

# Step 8: Generate genesis block (will fail if certs missing, but we'll handle it)
log_info "Step 8: Generating genesis block..."
if [ $MISSING_CERTS -eq 0 ] && [ "$HAS_CERTS" = true ]; then
    log_info "All certificates present. Generating genesis block..."
    
    if ! configtxgen -profile UniversityGenesis -channelID system-channel -outputBlock "./channel-artifacts-final/orderer.genesis.block" 2>&1; then
        log_error "configtxgen failed. Check configtx.yaml syntax and certificate paths."
    fi
    
    log_info "Genesis block created successfully."
    
    log_info "Generating registrar channel block..."
    if ! configtxgen -profile RegistrarChannel -outputBlock "./channel-artifacts-final/registrar-channel.block" -channelID registrar-channel 2>&1; then
        log_error "Failed to generate registrar channel block."
    fi
    
    log_info "Channel blocks generated successfully!"
else
    log_error "Cannot generate blocks: Missing $MISSING_CERTS certificate(s). Re-run enrollment first."
fi

# Step 9: Verify artifacts were created
log_info "Step 9: Verifying artifacts..."
if [ -f "./channel-artifacts-final/orderer.genesis.block" ]; then
    log_info "✓ Genesis block created"
else
    log_error "Genesis block was not created"
fi

if [ -f "./channel-artifacts-final/registrar-channel.block" ]; then
    log_info "✓ Registrar channel block created"
else
    log_error "Registrar channel block was not created"
fi

log_info "========================================="
log_info "Deployment fix complete!"
log_info "Next steps:"
log_info "  1. Verify all certificates are in place"
log_info "  2. Run: docker compose -f docker-compose-main.yaml up -d"
log_info "  3. Run: ./k8s/deploy-k8s.sh apply"
log_info "========================================="
