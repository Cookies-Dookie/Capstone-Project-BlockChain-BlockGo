#!/bin/bash
set -e

export CORE_PEER_LOCALMSPID='RegistrarMSP'
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
export ORDERER_CA=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt

cd /tmp
rm -f metadata.json connection.json code.tar.gz registrar-chaincode.tar.gz

echo "=== Creating new CCAAS chaincode package (with TLS) ==="
echo '{"type":"ccaas","label":"registrar-chaincode_3.0"}' > metadata.json
echo '{"address":"registrar-chaincode:9999","dial_timeout":"15s","tls_required":true}' > connection.json

tar czf code.tar.gz connection.json
tar czf registrar-chaincode.tar.gz metadata.json code.tar.gz

echo "=== Installing new chaincode package ==="
for i in 0 1 2 3 4 5; do
  export CORE_PEER_ADDRESS=peer${i}.registrar.capstone.com:7051
  echo "Installing on peer${i}..."
  peer lifecycle chaincode install registrar-chaincode.tar.gz
done

echo -e "\n=== Calculating New Package ID ==="
PKG_ID=$(peer lifecycle chaincode calculatepackageid registrar-chaincode.tar.gz)
echo "New Package ID: $PKG_ID"

# --- Update .env file automatically ---
# Use absolute path since this script changes directories
ENV_FILE="/opt/fabric-config/network/.env"
if [ -f "$ENV_FILE" ]; then
  echo "Updating CC_ID in $ENV_FILE"
  if grep -q "^CC_ID=" "$ENV_FILE"; then
    sed -i "s#^CC_ID=.*#CC_ID=${PKG_ID}#" "$ENV_FILE"
  else
    echo "" >> "$ENV_FILE" # Add a newline for safety
    echo "CC_ID=${PKG_ID}" >> "$ENV_FILE"
  fi
  echo "✅ CC_ID updated in .env file."
  echo "REMINDER: Restart your chaincode container to pick up the new ID!"
else
  echo "⚠️  Warning: 'chaincode' directory not found. Please update .env manually with Package ID: $PKG_ID"
fi

echo -e "\n=== Approving for RegistrarMSP (sequence 3) ==="
peer lifecycle chaincode approveformyorg \
  -o orderer.capstone.com:7050 \
  --channelID registrar-channel \
  --name registrar-chaincode \
  --version 3.0 \
  --package-id $PKG_ID \
  --sequence 3 \
  --tls \
  --cafile $ORDERER_CA \
  --connTimeout 120s

echo -e "\n=== Committing chaincode (sequence 3) ==="
peer lifecycle chaincode commit \
  -o orderer.capstone.com:7050 \
  --channelID registrar-channel \
  --name registrar-chaincode \
  --version 3.0 \
  --sequence 3 \
  --tls \
  --cafile $ORDERER_CA \
  --connTimeout 120s \
  --peerAddresses peer0.registrar.capstone.com:7051 \
  --tlsRootCertFiles $CORE_PEER_TLS_ROOTCERT_FILE \
  --peerAddresses peer1.registrar.capstone.com:7051 \
  --tlsRootCertFiles /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer1.registrar.capstone.com/tls/ca.crt \
  --peerAddresses peer2.registrar.capstone.com:7051 \
  --tlsRootCertFiles /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer2.registrar.capstone.com/tls/ca.crt

echo -e "\n=== Verifying new chaincode ==="
peer lifecycle chaincode querycommitted --channelID registrar-channel

echo -e "\n✓ Chaincode upgraded successfully with TLS enabled"
