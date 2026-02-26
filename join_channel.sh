#!/bin/bash
set -e

export CORE_PEER_LOCALMSPID='RegistrarMSP'
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt

echo "=== Joining peers to registrar-channel ==="
for i in 0 1 2 3 4 5; do
  export CORE_PEER_ADDRESS=peer${i}.registrar.capstone.com:7051
  echo "Joining peer${i}..."
  peer channel join -b /opt/fabric-config/channel-artifacts/registrar-channel.block || echo "Already joined or error, continuing..."
done

echo -e "\n=== Verifying channel membership ==="
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
peer channel list
