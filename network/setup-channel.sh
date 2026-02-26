#!/bin/bash
set -e

export CORE_PEER_LOCALMSPID='RegistrarMSP'
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
export ORDERER_CA=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt

cd /opt/fabric-config/channel-artifacts

echo "=== Step 1: Create channel ==="
peer channel create \
  -o orderer.capstone.com:7050 \
  -c registrar-channel \
  -f registrar-channel.tx \
  --tls \
  --cafile $ORDERER_CA

echo "=== Step 2: Join all peers to channel ==="
for i in 0 1 2 3 4 5; do
  export CORE_PEER_ADDRESS=peer${i}.registrar.capstone.com:7051
  echo "Joining peer${i}..."
  peer channel join -b registrar-channel.block
done

echo "=== Step 3: Verify peers joined ==="
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
peer channel list

echo "✓ Channel created and all peers joined"
