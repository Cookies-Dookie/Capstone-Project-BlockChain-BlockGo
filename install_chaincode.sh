#!/bin/bash

export CORE_PEER_LOCALMSPID='RegistrarMSP'
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
export ORDERER_CA=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt

cd /tmp

echo "=== Installing on all peers ==="
for i in 0 1 2 3 4 5; do
  export CORE_PEER_ADDRESS=peer${i}.registrar.capstone.com:7051
  echo "Installing on peer${i}..."
  peer lifecycle chaincode install registrar-chaincode.tar.gz || echo "Already installed on peer${i}, continuing..."
done

echo -e "\n=== Querying installed chaincodes on peer0 ==="
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
peer lifecycle chaincode queryinstalled
PKG_ID=$(peer lifecycle chaincode queryinstalled | grep registrar-chaincode_1.0 | cut -d' ' -f1 | cut -d':' -f2)
echo "Package ID: $PKG_ID"

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

echo -e "\n✓ Chaincode installed and committed successfully"
