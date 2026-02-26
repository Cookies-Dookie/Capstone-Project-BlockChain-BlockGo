#!/bin/bash
set -e

export CORE_PEER_LOCALMSPID='RegistrarMSP'
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
export ORDERER_CA=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt

# Create chaincode package (CCAAS format)
cd /tmp
rm -f metadata.json connection.json code.tar.gz registrar-chaincode.tar.gz

echo "=== Creating CCAAS chaincode package ==="
echo '{"type":"ccaas","label":"registrar-chaincode_1.0"}' > metadata.json
echo '{"address":"registrar-chaincode:9999","dial_timeout":"10s","tls_required":false}' > connection.json

tar czf code.tar.gz connection.json
tar czf registrar-chaincode.tar.gz metadata.json code.tar.gz

echo "=== Installing chaincode on all peers ==="
for i in 0 1 2 3 4 5; do
  export CORE_PEER_ADDRESS=peer${i}.registrar.capstone.com:7051
  echo "Installing on peer${i}..."
  peer lifecycle chaincode install registrar-chaincode.tar.gz || echo "Already installed"
done

echo -e "\n=== Querying installed chaincodes ==="
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
peer lifecycle chaincode queryinstalled
PKG_ID=$(peer lifecycle chaincode queryinstalled 2>&1 | grep "registrar-chaincode_1.0:" | head -1 | awk -F': ' '{print $2}' | awk -F', ' '{print $1}')
echo "Package ID: $PKG_ID"

if [ -z "$PKG_ID" ]; then
  echo "ERROR: Could not find package ID"
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

echo -e "\n=== Verifying chaincode is committed ==="
peer lifecycle chaincode querycommitted --channelID registrar-channel

echo -e "\n✓ Chaincode installed, approved, and committed successfully"
