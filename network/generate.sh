#!/bin/bash
set -e

# Set to the version of Fabric you are using
export FABRIC_VERSION=2.2.0
# Set to the version of Fabric CA you are using
export CA_VERSION=1.5.0


# Function to print a header
print_header() {
  echo
  echo "================================================================="
  echo "$1"
  echo "================================================================="
}

# --- Main script execution ---

print_header "Setting up environment"

# Set the FABRIC_CFG_PATH to the current directory
export FABRIC_CFG_PATH="${PWD}"

# Add Fabric binaries to the PATH
# Assumes you have downloaded them into a 'bin' directory
if [ -d "bin" ]; then
    export PATH="${PWD}/bin:$PATH"
fi

# Check if cryptogen is executable
if ! command -v cryptogen >/dev/null 2>&1; then
    echo "ERROR: 'cryptogen' tool not found or not executable."
    echo "If running in WSL, ensure you have Linux binaries in 'bin/'."
    echo "If running in Git Bash, ensure you have Windows binaries in 'bin/'."
    exit 1
fi

print_header "Cleaning up previous artifacts"
rm -rf channel-artifacts

if [ -d "crypto-config" ]; then
    mv crypto-config crypto-config.tmp 2>/dev/null || rm -rf crypto-config
    rm -rf crypto-config.tmp 2>/dev/null
fi

# Robust wait for directory removal (Windows fix)
while [ -d "crypto-config" ]; do
    echo "Waiting for crypto-config to be removed..."
    sleep 1
done
echo "Cleanup complete."

print_header "Generating cryptographic materials"

# Ensure directory can be created (Windows fix for "The system cannot find the file specified")
until mkdir -p crypto-config; do
    echo "Waiting for file system lock to release..."
    sleep 1
done

cryptogen generate --config=./crypto-config.yaml
if [ $? -ne 0 ]; then
  echo "Failed to generate crypto material."
  exit 1
fi
echo "Crypto materials generated successfully."

# --- FIX: Patch NodeOUs into MSP config.yaml ---
# This ensures peers are recognized as 'peer' role, satisfying the "OR('RegistrarMSP.peer')" policy.
print_header "Patching NodeOUs in MSP configurations"

function create_msp_config_yaml() {
    local msp_dir=$1
    # Find the CA cert file in the cacerts directory
    local ca_cert=$(ls "$msp_dir/cacerts" | head -n 1)
    
    echo "NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/$ca_cert
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/$ca_cert
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/$ca_cert
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/$ca_cert
    OrganizationalUnitIdentifier: orderer" > "$msp_dir/config.yaml"
}

# Patch Peer MSPs
find crypto-config/peerOrganizations -name "msp" | while read msp_path; do
    create_msp_config_yaml "$msp_path"
done

# Patch Orderer MSPs
find crypto-config/ordererOrganizations -name "msp" | while read msp_path; do
    create_msp_config_yaml "$msp_path"
done
echo "NodeOUs patched successfully."
# -----------------------------------------------

print_header "Generating genesis block"
mkdir -p channel-artifacts
configtxgen -profile Genesis -channelID system-channel -outputBlock ./channel-artifacts/genesis.block
if [ $? -ne 0 ]; then
  echo "Failed to generate genesis block."
  exit 1
fi
echo "Genesis block generated successfully."

print_header "Generating channel configuration transaction"
configtxgen -profile RegistrarChannel -outputCreateChannelTx ./channel-artifacts/registrar-channel.tx -channelID registrar-channel
if [ $? -ne 0 ]; then
  echo "Failed to generate channel configuration transaction."
  exit 1
fi
echo "Channel configuration transaction generated successfully."

print_header "Artifact generation complete!"
echo "You can now start your network using 'docker-compose up -d'"