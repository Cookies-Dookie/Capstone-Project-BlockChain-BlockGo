#!/bin/bash
set -e

export CORE_PEER_LOCALMSPID='RegistrarMSP'
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
export ORDERER_CA=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt

echo "=== Calculating Package ID ==="
# Assumes the package file is in the current directory or /tmp. Adjust if necessary.
# If running immediately after install, we can query installed.
PKG_ID=$(peer lifecycle chaincode queryinstalled 2>&1 | grep "registrar-chaincode_1.0" | head -n 1 | awk -F'Package ID: ' '{print $2}' | awk -F',' '{print $1}')

echo "Package ID: $PKG_ID"
export CC_PACKAGE_ID=$PKG_ID

echo "=== Committing chaincode with ALL peers endorsing ==="

peer lifecycle chaincode commit \
  -o orderer.capstone.com:7050 \
  --tls true \
  --cafile $ORDERER_CA \
  --channelID registrar-channel \
  --name registrar-chaincode \
  --version 1.0 \
  --sequence 1 \
  --signature-policy "OR('RegistrarMSP.member')" \
  --peerAddresses peer0.registrar.capstone.com:7051 \
  --tlsRootCertFiles /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt \
  --peerAddresses peer1.registrar.capstone.com:7051 \
  --tlsRootCertFiles /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer1.registrar.capstone.com/tls/ca.crt \
  --peerAddresses peer2.registrar.capstone.com:7051 \
  --tlsRootCertFiles /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer2.registrar.capstone.com/tls/ca.crt

echo "✓ Chaincode committed successfully"

echo ""
echo "=== Verifying commitment ==="
peer lifecycle chaincode querycommitted -C registrar-channel --name registrar-chaincode
