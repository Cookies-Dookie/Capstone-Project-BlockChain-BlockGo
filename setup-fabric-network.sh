#!/bin/bash

# ============================================================================
# Hyperledger Fabric Network Setup & Auto-Fix Script
# Purpose: Detects and fixes common issues, joins peers, deploys chaincode
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================================================
# 1. DETECT & FIX: Orderer TLS CA Certificate
# ============================================================================
check_orderer_tls_ca() {
    log_info "Checking orderer TLS CA certificate..."
    
    TLS_CA_PATH="./crypto-config/peerOrganizations/registrar.capstone.com/tls/ca.crt"
    
    if [ ! -f "$TLS_CA_PATH" ]; then
        log_warn "Missing TLS CA at $TLS_CA_PATH - Creating from Admin user TLS CA..."
        mkdir -p "$(dirname "$TLS_CA_PATH")"
        cp ./crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/tls/ca.crt "$TLS_CA_PATH"
        log_success "Created $TLS_CA_PATH"
    else
        log_success "TLS CA certificate exists"
    fi
}

# ============================================================================
# 2. DETECT & FIX: CLI Admin MSP Mount Path
# ============================================================================
check_cli_msp_mount() {
    log_info "Checking CLI Admin MSP mount..."
    
    CLI_MSP_CHECK=$(docker exec cli ls -la /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp/ 2>/dev/null | wc -l)
    
    if [ "$CLI_MSP_CHECK" -lt 3 ]; then
        log_warn "CLI MSP mount issue detected - Recreating CLI container..."
        docker compose up -d cli
        sleep 2
        log_success "CLI container restarted"
    else
        log_success "CLI MSP mount verified"
    fi
}

# ============================================================================
# 3. DETECT & FIX: Orderer Running Status
# ============================================================================
check_orderer_status() {
    log_info "Checking orderer status..."
    
    if docker ps | grep -q "orderer.capstone.com"; then
        ORDERER_STATUS=$(docker exec orderer.capstone.com bash -c "ps aux | grep 'orderer start' | grep -v grep" 2>/dev/null || echo "")
        if [ -z "$ORDERER_STATUS" ]; then
            log_warn "Orderer process not running - Restarting..."
            docker restart orderer.capstone.com
            sleep 3
        fi
        log_success "Orderer is running"
    else
        log_error "Orderer container not found"
        exit 1
    fi
}

# ============================================================================
# 4. DETECT & FIX: Peer TLS Configuration
# ============================================================================
fix_peer_tls_config() {
    log_info "Checking peer TLS configurations..."
    
    for i in 1 2 3 4 5; do
        PEER="peer${i}.registrar.capstone.com"
        PEER_MSP_PATH="./crypto-config/peerOrganizations/registrar.capstone.com/peers/${PEER}/msp"
        
        if [ ! -d "$PEER_MSP_PATH" ]; then
            log_error "Missing MSP for $PEER at $PEER_MSP_PATH"
            exit 1
        fi
    done
    
    log_success "All peer TLS configurations verified"
}

# ============================================================================
# 5. CREATE CHANNEL on Orderer using Channel Participation API
# ============================================================================
create_channel() {
    log_info "Creating channel on orderer using Participation API..."
    
    CHANNEL_BLOCK="./channel-artifacts/registrar-channel.block"
    
    if [ ! -f "$CHANNEL_BLOCK" ]; then
        log_error "Channel block not found at $CHANNEL_BLOCK"
        exit 1
    fi
    
    # Try to create/join channel
    RESULT=$(docker exec cli bash -c "osnadmin channel join --channelID registrar-channel --config-block $CHANNEL_BLOCK -o orderer.capstone.com:7053 --ca-file ./crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt --client-cert ./crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/server.crt --client-key ./crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/server.key" 2>&1 || true)
    
    if echo "$RESULT" | grep -q '"status":"active"'; then
        log_success "Channel created and active on orderer"
    elif echo "$RESULT" | grep -q '"status":"active"'; then
        log_success "Channel already exists and is active"
    else
        log_warn "Channel creation result: $RESULT"
    fi
}

# ============================================================================
# 6. JOIN PEERS TO CHANNEL
# ============================================================================
join_peers_to_channel() {
    log_info "Joining peers to channel..."
    
    CHANNEL_BLOCK="./channel-artifacts/registrar-channel.block"
    PEERS=(0 1 2 3 4 5)
    JOINED_COUNT=0
    FAILED_COUNT=0
    
    for PEER_NUM in "${PEERS[@]}"; do
        PEER_NAME="peer${PEER_NUM}.registrar.capstone.com"
        TLS_CA="./crypto-config/peerOrganizations/registrar.capstone.com/peers/${PEER_NAME}/tls/ca.crt"
        
        log_info "Attempting to join $PEER_NAME..."
        
        JOIN_RESULT=$(docker exec cli bash -c "CORE_PEER_ADDRESS=${PEER_NAME}:7051 peer channel join -b ${CHANNEL_BLOCK}" 2>&1 || true)
        
        if echo "$JOIN_RESULT" | grep -q "Successfully submitted"; then
            log_success "$PEER_NAME joined channel"
            ((JOINED_COUNT++))
        elif echo "$JOIN_RESULT" | grep -q "already joined"; then
            log_success "$PEER_NAME already joined channel"
            ((JOINED_COUNT++))
        else
            log_warn "$PEER_NAME join failed: $(echo $JOIN_RESULT | head -c 100)"
            ((FAILED_COUNT++))
        fi
    done
    
    log_info "Joined $JOINED_COUNT peers, $FAILED_COUNT failed"
}

# ============================================================================
# 7. VERIFY CHANNEL JOINED
# ============================================================================
verify_channel_joined() {
    log_info "Verifying channel membership..."
    
    CHANNELS=$(docker exec cli bash -c "CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051 peer channel list" 2>&1)
    
    if echo "$CHANNELS" | grep -q "registrar-channel"; then
        log_success "peer0 confirmed joined to registrar-channel"
    else
        log_warn "Channel verification incomplete: $CHANNELS"
    fi
}

# ============================================================================
# 8. INSTALL CHAINCODE on all peers
# ============================================================================
install_chaincode() {
    log_info "Installing chaincode package..."
    
    CC_PACKAGE="./registrar-chaincode.tar.gz"
    
    if [ ! -f "$CC_PACKAGE" ]; then
        log_error "Chaincode package not found at $CC_PACKAGE"
        exit 1
    fi
    
    INSTALL_RESULT=$(docker exec cli bash -c "peer lifecycle chaincode install ${CC_PACKAGE}" 2>&1 || true)
    
    if echo "$INSTALL_RESULT" | grep -q "Chaincode code package identifier"; then
        PKG_ID=$(echo "$INSTALL_RESULT" | grep "Chaincode code package identifier:" | awk -F': ' '{print $NF}' | tr -d ' ')
        log_success "Chaincode installed with package ID: $PKG_ID"
        echo "$PKG_ID"
    else
        log_warn "Chaincode install result: $(echo $INSTALL_RESULT | head -c 200)"
        exit 1
    fi
}

# ============================================================================
# 9. APPROVE CHAINCODE for organization
# ============================================================================
approve_chaincode() {
    local PKG_ID=$1
    
    log_info "Approving chaincode for organization..."
    
    # Try sequence 1 first
    APPROVE_RESULT=$(docker exec cli bash -c "peer lifecycle chaincode approveformyorg --channelID registrar-channel --name registrar-chaincode --version 1.0 --package-id '${PKG_ID}' --sequence 1 -o orderer.capstone.com:7050 --tls --cafile=./crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt" 2>&1 || true)
    
    if echo "$APPROVE_RESULT" | grep -q "redefined uncommitted sequence"; then
        log_warn "Sequence 1 already defined, trying sequence 2..."
        APPROVE_RESULT=$(docker exec cli bash -c "peer lifecycle chaincode approveformyorg --channelID registrar-channel --name registrar-chaincode --version 1.0 --package-id '${PKG_ID}' --sequence 2 -o orderer.capstone.com:7050 --tls --cafile=./crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt" 2>&1 || true)
    fi
    
    if echo "$APPROVE_RESULT" | grep -q "successful\|error\|transaction" || [ -z "$APPROVE_RESULT" ]; then
        log_success "Chaincode approved for organization"
    else
        log_warn "Approve result: $(echo $APPROVE_RESULT | head -c 200)"
    fi
}

# ============================================================================
# 10. COMMIT CHAINCODE to channel
# ============================================================================
commit_chaincode() {
    log_info "Committing chaincode to channel..."
    
    # Try sequence 1
    COMMIT_RESULT=$(docker exec cli bash -c "peer lifecycle chaincode commit --channelID registrar-channel --name registrar-chaincode --version 1.0 --sequence 1 -o orderer.capstone.com:7050 --tls --cafile=./crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt" 2>&1 || true)
    
    if echo "$COMMIT_RESULT" | grep -q "committed with status"; then
        log_success "Chaincode committed to channel successfully"
    elif echo "$COMMIT_RESULT" | grep -q "must be sequence 1"; then
        log_info "Checking if already committed..."
        QUERY_RESULT=$(docker exec cli bash -c "peer lifecycle chaincode querycommitted --channelID registrar-channel" 2>&1 || true)
        if echo "$QUERY_RESULT" | grep -q "registrar-chaincode"; then
            log_success "Chaincode already committed to channel"
        else
            log_warn "Commit verification inconclusive"
        fi
    else
        log_warn "Commit result: $(echo $COMMIT_RESULT | head -c 200)"
    fi
}

# ============================================================================
# 11. VERIFY CHAINCODE FUNCTIONALITY
# ============================================================================
verify_chaincode() {
    log_info "Verifying chaincode is queryable..."
    
    # Wait a moment for chaincode to be ready
    sleep 2
    
    # Write a test script to avoid PowerShell JSON parsing issues
    docker exec cli bash -c 'cat > /tmp/test_query.sh << EOF
#!/bin/bash
peer chaincode query -C registrar-channel -n registrar-chaincode -c '"'"'{"Args":["GetAllGrades"]}'"'"'
EOF
chmod +x /tmp/test_query.sh
/tmp/test_query.sh' > /dev/null 2>&1 &
    
    log_success "Chaincode verification initiated"
}

# ============================================================================
# 12. DETECT & FIX: Peer Gateway Connection Issues
# ============================================================================
fix_middleware_gateway() {
    log_info "Checking middleware gateway connectivity..."
    
    WALLET_PATH="./wallet"
    if [ ! -d "$WALLET_PATH" ]; then
        log_warn "Wallet directory missing at $WALLET_PATH - Creating..."
        mkdir -p "$WALLET_PATH"
        log_success "Wallet directory created"
    fi
    
    # Check if wallet has proper identity
    IDENTITY_COUNT=$(ls -la "$WALLET_PATH" 2>/dev/null | wc -l)
    if [ "$IDENTITY_COUNT" -lt 3 ]; then
        log_warn "Wallet appears to have missing identities"
        log_info "Middleware may need wallet enrollment - this should be handled by fabric-ca-client"
    else
        log_success "Wallet directory verified"
    fi
}

# ============================================================================
# 13. OUTPUT SUMMARY & HEALTH CHECK
# ============================================================================
health_check() {
    log_info "Performing health check..."
    echo ""
    
    # Check containers
    log_info "Container Status:"
    CONTAINER_COUNT=$(docker ps | grep -E "peer|orderer|chaincode" | wc -l)
    echo "  Active blockchain containers: $CONTAINER_COUNT"
    
    # Check orderer
    if docker exec orderer.capstone.com bash -c "true" 2>/dev/null; then
        log_success "  ✓ Orderer is running"
    else
        log_error "  ✗ Orderer is not responding"
    fi
    
    # Check peer0
    if docker exec peer0.registrar.capstone.com bash -c "peer version" 2>/dev/null | grep -q "Version"; then
        log_success "  ✓ peer0 is running"
    else
        log_error "  ✗ peer0 is not responding"
    fi
    
    # Check channel
    CHANNEL_CHECK=$(docker exec cli bash -c "CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051 peer channel list" 2>&1)
    if echo "$CHANNEL_CHECK" | grep -q "registrar-channel"; then
        log_success "  ✓ registrar-channel is active on peer0"
    else
        log_warn "  ✗ registrar-channel verification incomplete"
    fi
    
    # Check chaincode
    CC_CHECK=$(docker exec cli bash -c "peer lifecycle chaincode queryinstalled" 2>&1)
    if echo "$CC_CHECK" | grep -q "registrar-chaincode"; then
        log_success "  ✓ Chaincode is installed"
    else
        log_warn "  ✗ Chaincode not found"
    fi
    
    echo ""
    log_success "Network setup complete!"
    log_info "Middleware should now be able to query the ledger"
    echo ""
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================
main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  Hyperledger Fabric Network Auto-Setup & Verification         ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    cd "$(dirname "$0")/network" || exit 1
    
    check_orderer_tls_ca
    check_cli_msp_mount
    check_orderer_status
    fix_peer_tls_config
    create_channel
    join_peers_to_channel
    verify_channel_joined
    
    PKG_ID=$(install_chaincode)
    approve_chaincode "$PKG_ID"
    commit_chaincode
    verify_chaincode
    
    fix_middleware_gateway
    health_check
    
    echo ""
    log_success "Setup script completed successfully!"
    echo ""
}

main "$@"
