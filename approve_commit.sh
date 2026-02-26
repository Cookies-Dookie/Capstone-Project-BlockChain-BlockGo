#!/bin/bash
set -e

export CORE_PEER_LOCALMSPID='RegistrarMSP'
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
export ORDERER_CA=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt

cd /tmp

# Get the package ID properly
PKG_ID=$(peer lifecycle chaincode queryinstalled 2>&1 | grep "registrar-chaincode_1.0:" | awk -F': ' '{print $2}' | awk -F', ' '{print $1}')
echo "Package ID: $PKG_ID"

if [ -z "$PKG_ID" ]; then
  echo "ERROR: Could not find package ID"
  peer lifecycle chaincode queryinstalled
  exit 1
fi

echo -e "\n=== Approving for RegistrarMSP ==="
peer lifecycle chaincode approveformyorg \
  -o orderer.capstone.com:7050 \
  --channelID registrar-channel \
  --name registrar-chaincode \
  --version 1.0 \
  --package-id $PKG_ID \
  --sequence 1 \
  --tls \
  --cafile $ORDERER_CA

echo -e "\n=== Committing to channel ==="
peer lifecycle chaincode commit \
  -o orderer.capstone.com:7050 \
  --channelID registrar-channel \
  --name registrar-chaincode \
  --version 1.0 \
  --sequence 1 \
  --tls \
  --cafile $ORDERER_CA

echo -e "\n=== Verifying chaincode status ==="
peer lifecycle chaincode querycommitted --channelID registrar-channel

echo -e "\n✓ Chaincode approved and committed successfully"
