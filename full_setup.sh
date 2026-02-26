#!/bin/bash
set -e

export CORE_PEER_LOCALMSPID='RegistrarMSP'
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
export ORDERER_CA=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt

cd /tmp

echo "=== Step 1: Create channel ==="
peer channel create \
  -o orderer.capstone.com:7050 \
  -c registrar-channel \
  -f /opt/fabric-config/channel-artifacts/registrar-channel.tx \
  --tls \
  --cafile $ORDERER_CA

echo -e "\n=== Step 2: Join all peers to channel ==="
for i in 0 1 2 3 4 5; do
  export CORE_PEER_ADDRESS=peer${i}.registrar.capstone.com:7051
  echo "Joining peer${i}..."
  peer channel join -b /opt/fabric-config/channel-artifacts/registrar-channel.block || echo "Already joined, continuing..."
done

echo -e "\n=== Step 3: Install chaincode on all peers ==="
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
for i in 0 1 2 3 4 5; do
  export CORE_PEER_ADDRESS=peer${i}.registrar.capstone.com:7051
  echo "Installing on peer${i}..."
  peer lifecycle chaincode install registrar-chaincode.tar.gz || echo "Already installed, continuing..."
done

echo -e "\n=== Step 4: Query installed chaincodes ==="
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
peer lifecycle chaincode queryinstalled
PKG_ID=$(peer lifecycle chaincode queryinstalled 2>&1 | grep "registrar-chaincode_1.0:" | head -1 | awk -F': ' '{print $2}' | awk -F', ' '{print $1}')
echo "Package ID: $PKG_ID"

if [ -z "$PKG_ID" ]; then
  echo "ERROR: Could not find package ID"
  exit 1
fi

echo -e "\n=== Step 5: Approve chaincode for RegistrarMSP ==="
peer lifecycle chaincode approveformyorg \
  -o orderer.capstone.com:7050 \
  --channelID registrar-channel \
  --name registrar-chaincode \
  --version 1.0 \
  --package-id $PKG_ID \
  --sequence 1 \
  --tls \
  --cafile $ORDERER_CA

echo -e "\n=== Step 6: Commit chaincode to channel ==="
peer lifecycle chaincode commit \
  -o orderer.capstone.com:7050 \
  --channelID registrar-channel \
  --name registrar-chaincode \
  --version 1.0 \
  --sequence 1 \
  --tls \
  --cafile $ORDERER_CA

echo -e "\n=== Step 7: Verify chaincode is committed ==="
peer lifecycle chaincode querycommitted --channelID registrar-channel

echo -e "\n✓ All steps completed successfully!"
