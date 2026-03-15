#!/bin/bash
################################################################################
# deploy_network.sh
# Fail-Proof Automated Fabric Network Setup for CCAAS (Chaincode as a Service)
################################################################################

set -euo pipefail

# === CONFIGURATION ===
CHANNEL_NAME="registrar-channel"
CC_NAME="registrar"
CC_VERSION="1.0"
CC_SEQUENCE="1"
ORDERER_ADDRESS="orderer.capstone.com:7050"
ORDERER_CA="/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/msp/tlscacerts/tlsca.capstone.com-cert.pem"
ORG_MSP="RegistrarMSP"
ADMIN_MSP_DIR="/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp"
PEERS=(0 1 2 3 4 5)
WORK_DIR="/tmp/fabric_deploy_$(date +%s)"
LOG_FILE="${WORK_DIR}/deployment.log"

# === COLOR CODES ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# === UTILITY FUNCTIONS ===
log() {
    local level=$1
    shift
    local msg="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${msg}" | tee -a "${LOG_FILE}"
}

success() { log " SUCCESS" "${GREEN}$@${NC}"; }
error() { log " ERROR" "${RED}$@${NC}"; }
warn() { log "  WARN" "${YELLOW}$@${NC}"; }
info() { log "  INFO" "${BLUE}$@${NC}"; }

setup_environment() {
    mkdir -p "${WORK_DIR}"
    touch "${LOG_FILE}"
    info "Working directory: ${WORK_DIR}"
    
    if [ ! -f "$ORDERER_CA" ]; then error "Orderer CA file not found: $ORDERER_CA"; exit 1; fi
    if [ ! -d "$ADMIN_MSP_DIR" ]; then error "Admin MSP directory not found: $ADMIN_MSP_DIR"; exit 1; fi
    success "Environment validated"
}

setGlobals() {
    local PEER_NUM=$1
    export CORE_PEER_LOCALMSPID=$ORG_MSP
    export CORE_PEER_ADDRESS="peer${PEER_NUM}.registrar.capstone.com:7051"
    export CORE_PEER_MSPCONFIGPATH=$ADMIN_MSP_DIR
    export CORE_PEER_TLS_ROOTCERT_FILE="/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer${PEER_NUM}.registrar.capstone.com/tls/ca.crt"
    
    export CORE_PEER_TLS_ENABLED=true
    
    if [ "$CORE_PEER_TLS_ENABLED" = "true" ] && [ ! -f "$CORE_PEER_TLS_ROOTCERT_FILE" ]; then
        error "TLS CA file not found for peer${PEER_NUM}"
        return 1
    fi
}

retry_command() {
    local max_attempts=3
    local attempt=1
    local wait_time=2
    local cmd="$@"
    
    while [ $attempt -le $max_attempts ]; do
        info "Executing (attempt $attempt/$max_attempts): $cmd"
        if eval "$cmd" 2>&1 | tee -a "${LOG_FILE}"; then return 0; fi
        
        if [ $attempt -lt $max_attempts ]; then
            warn "Command failed. Waiting ${wait_time}s before retry..."
            sleep $wait_time
            wait_time=$((wait_time * 2))
        fi
        attempt=$((attempt + 1))
    done
    error "Command failed after $max_attempts attempts: $cmd"
    return 1
}

channel_exists() {
    setGlobals 0 || return 1
    if peer channel list 2>/dev/null | grep -q "^${CHANNEL_NAME}$"; then return 0; else return 1; fi
}

peer_joined() {
    local PEER_NUM=$1
    setGlobals "$PEER_NUM" || return 1
    if peer channel list 2>/dev/null | grep -q "^${CHANNEL_NAME}$"; then return 0; fi
    return 1
}

chaincode_installed() {
    local PEER_NUM=$1
    setGlobals "$PEER_NUM" || return 1
    if peer lifecycle chaincode queryinstalled 2>/dev/null | grep -q "${CC_NAME}_${CC_VERSION}"; then return 0; fi
    return 1
}

chaincode_approved() {
    setGlobals 0 || return 1
    if peer lifecycle chaincode queryapproved -C "$CHANNEL_NAME" -n "$CC_NAME" 2>/dev/null | grep -q "\"Version\": \"${CC_VERSION}\""; then return 0; fi
    return 1
}

chaincode_committed() {
    setGlobals 0 || return 1
    if peer lifecycle chaincode querycommitted -C "$CHANNEL_NAME" -n "$CC_NAME" 2>/dev/null | grep -q "\"Version\": \"${CC_VERSION}\""; then return 0; fi
    return 1
}

# === MAIN DEPLOYMENT STAGES ===

stage_create_channel() {
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "STAGE 1: Channel Creation/Fetch"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    setGlobals 0 || return 1
    
    if channel_exists; then
        success "Channel already exists, fetching genesis block..."
        retry_command "peer channel fetch 0 ${WORK_DIR}/${CHANNEL_NAME}.block -o $ORDERER_ADDRESS -c $CHANNEL_NAME --tls --cafile $ORDERER_CA"
    else
        info "Creating new channel..."
        retry_command "peer channel create -o $ORDERER_ADDRESS -c $CHANNEL_NAME -f /opt/fabric-config/network/channel-artifacts/registrar-channel.tx --tls --cafile $ORDERER_CA -o $ORDERER_ADDRESS"
        retry_command "peer channel fetch 0 ${WORK_DIR}/${CHANNEL_NAME}.block -o $ORDERER_ADDRESS -c $CHANNEL_NAME --tls --cafile $ORDERER_CA"
    fi
}

stage_join_peers() {
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "STAGE 2: Join All Peers"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    local failed_peers=()
    for PEER_NUM in "${PEERS[@]}"; do
        if peer_joined "$PEER_NUM"; then
            success "peer${PEER_NUM} already joined"
        else
            setGlobals "$PEER_NUM"
            if retry_command "peer channel join -b ${WORK_DIR}/${CHANNEL_NAME}.block"; then
                success "peer${PEER_NUM} joined successfully"
            else
                failed_peers+=("$PEER_NUM")
            fi
        fi
    done
    if [ ${#failed_peers[@]} -gt 0 ]; then return 1; fi
}

stage_prepare_ccaas() {
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "STAGE 3: Prepare CCAAS Package"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cd "$WORK_DIR"
    
    # 1. Create connection.json
    cat > connection.json <<'EOF'
{
  "address": "registrar-chaincode:9999",
  "dial_timeout": "10s",
  "tls_required": false
}
EOF
    
    # 2. Package connection.json into code.tar.gz (CRITICAL FIX)
    tar cfz code.tar.gz connection.json
    success "Packaged code.tar.gz"

    # 3. Create metadata.json
    cat > metadata.json <<EOF
{
  "type": "ccaas",
  "label": "${CC_NAME}_${CC_VERSION}"
}
EOF
    
    # 4. Package final chaincode
    if tar cfz "${CC_NAME}.tar.gz" code.tar.gz metadata.json; then
        success "Chaincode package created: ${CC_NAME}.tar.gz"
    else
        return 1
    fi
}

stage_install_chaincode() {
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "STAGE 4: Install Chaincode on All Peers"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    local failed_peers=()
    for PEER_NUM in "${PEERS[@]}"; do
        if chaincode_installed "$PEER_NUM"; then
            success "Chaincode already installed on peer${PEER_NUM}"
        else
            setGlobals "$PEER_NUM"
            if retry_command "peer lifecycle chaincode install ${WORK_DIR}/${CC_NAME}.tar.gz"; then
                success "Chaincode installed on peer${PEER_NUM}"
            else
                failed_peers+=("$PEER_NUM")
            fi
        fi
    done
    if [ ${#failed_peers[@]} -gt 0 ]; then return 1; fi
}

stage_query_and_approve() {
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "STAGE 5: Query Package ID and Approve"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    setGlobals 0
    
    peer lifecycle chaincode queryinstalled > "${WORK_DIR}/installed_cc.txt" 2>&1
    PACKAGE_ID=$(grep "${CC_NAME}_${CC_VERSION}" "${WORK_DIR}/installed_cc.txt" | sed -n 's/^.*Package ID: //; s/, Label:.*$//; p' | head -n 1)
    
    if [ -z "$PACKAGE_ID" ]; then error "Failed to parse Package ID"; return 1; fi
    success "Found Package ID: ${YELLOW}${PACKAGE_ID}${NC}"
    echo "$PACKAGE_ID" > "${WORK_DIR}/PACKAGE_ID.txt"
    
    if chaincode_approved; then
        success "Chaincode already approved"
    else
        retry_command "peer lifecycle chaincode approveformyorg -o $ORDERER_ADDRESS --channelID $CHANNEL_NAME --name $CC_NAME --version $CC_VERSION --package-id $PACKAGE_ID --sequence $CC_SEQUENCE --tls --cafile $ORDERER_CA"
    fi
}

stage_commit_chaincode() {
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "STAGE 6: Commit Chaincode to Channel"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    setGlobals 0
    if chaincode_committed; then
        success "Chaincode already committed"
    else
        retry_command "peer lifecycle chaincode commit -o $ORDERER_ADDRESS --channelID $CHANNEL_NAME --name $CC_NAME --version $CC_VERSION --sequence $CC_SEQUENCE --tls --cafile $ORDERER_CA"
    fi
}

stage_verify() {
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "STAGE 7: Verification"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    setGlobals 0
    if peer lifecycle chaincode querycommitted -C "$CHANNEL_NAME" -n "$CC_NAME" 2>&1 | grep -q "\"Version\": \"${CC_VERSION}\""; then
        success "Chaincode committed and fully functional!"
    else
        error "Verification failed"
        return 1
    fi
}

main() {
    # Move setup_environment FIRST so the folder exists before we try to log to it!
    setup_environment

    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "FABRIC NETWORK DEPLOYMENT - Final Edition"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local stages=("stage_create_channel" "stage_join_peers" "stage_prepare_ccaas" "stage_install_chaincode" "stage_query_and_approve" "stage_commit_chaincode" "stage_verify")
    
    for stage in "${stages[@]}"; do
        if ! $stage; then error "Stage $stage failed."; return 1; fi
    done
    
    PACKAGE_ID=$(cat "${WORK_DIR}/PACKAGE_ID.txt")
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "DEPLOYMENT SUCCESSFUL!"
    info "Package ID: ${YELLOW}${PACKAGE_ID}${NC}"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    return 0
}

main