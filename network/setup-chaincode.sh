#!/bin/bash
set -e

export CORE_PEER_LOCALMSPID='RegistrarMSP'
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
export ORDERER_CA=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt

echo "=== Ensuring Admin MSP config.yaml is present and correct ==="
ADMIN_CERT_NAME=$(ls "$CORE_PEER_MSPCONFIGPATH/cacerts" | head -n 1)
cat <<EOF > "$CORE_PEER_MSPCONFIGPATH/config.yaml"
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/$ADMIN_CERT_NAME
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/$ADMIN_CERT_NAME
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/$ADMIN_CERT_NAME
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/$ADMIN_CERT_NAME
    OrganizationalUnitIdentifier: orderer
EOF
echo "Admin MSP config.yaml verified."

echo "=== Propagating config.yaml to all Peer MSPs ==="
# This ensures peers have the correct NodeOU config before installation
for i in 0 1 2 3 4 5; do
   PEER_MSP="/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer${i}.registrar.capstone.com/msp"
   if [ -d "$PEER_MSP" ]; then
      # Dynamically find the CA cert for this specific peer to avoid filename mismatches
      PEER_CA_CERT=$(ls "$PEER_MSP/cacerts" 2>/dev/null | head -n 1)
      
      if [ -z "$PEER_CA_CERT" ]; then
         echo "Warning: No CA cert found in $PEER_MSP/cacerts. Skipping config update for peer${i}."
         continue
      fi
      
      cat <<EOF > "$PEER_MSP/config.yaml"
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/$PEER_CA_CERT
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/$PEER_CA_CERT
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/$PEER_CA_CERT
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/$PEER_CA_CERT
    OrganizationalUnitIdentifier: orderer
EOF
      echo "Updated $PEER_MSP/config.yaml (using CA: $PEER_CA_CERT)"
   fi
done

# Create chaincode package (CCAAS format)
cd /tmp
rm -f metadata.json connection.json code.tar.gz registrar-chaincode.tar.gz

echo "=== Creating CCAAS chaincode package ==="
echo '{"type":"ccaas","label":"registrar-chaincode_1.0"}' > metadata.json
echo '{"address":"registrar-chaincode:9999","dial_timeout":"10s","tls_required":false,"client_auth_required":false,"client_auth_type":"NoClientCert"}' > connection.json

tar czf code.tar.gz connection.json
tar czf registrar-chaincode.tar.gz metadata.json code.tar.gz

echo "=== Installing chaincode on all peers ==="
for i in 0 1 2 3 4 5; do
  export CORE_PEER_ADDRESS=peer${i}.registrar.capstone.com:7051
  echo "Installing on peer${i}..."
  if ! peer lifecycle chaincode install registrar-chaincode.tar.gz; then
    echo "Error: Chaincode installation failed on peer${i}"
    # We don't exit here to allow checking other peers, but the script will likely fail later
  fi
done

echo -e "\n=== Calculating Package ID ==="
PKG_ID=$(peer lifecycle chaincode calculatepackageid registrar-chaincode.tar.gz)
echo "Package ID: $PKG_ID"

if [ -z "$PKG_ID" ]; then
  echo "Error: Failed to calculate Package ID. Ensure registrar-chaincode.tar.gz exists."
  exit 1
fi

# --- Update .env file automatically ---
# Use absolute path since this script changes directories
# Check multiple possible locations for .env
if [ -f "/opt/fabric-config/network/.env" ]; then
    ENV_FILE="/opt/fabric-config/network/.env"
else
    ENV_FILE="/opt/fabric-config/.env"
fi

if [ -f "$ENV_FILE" ]; then
  echo "Updating CC_ID in $ENV_FILE"
  if grep -q "^CC_ID=" "$ENV_FILE"; then
    sed -i "s#^CC_ID=.*#CC_ID=${PKG_ID}#" "$ENV_FILE"
  else
    echo "" >> "$ENV_FILE" # Add a newline for safety
    echo "CC_ID=${PKG_ID}" >> "$ENV_FILE"
  fi
  echo "✅ CC_ID updated in .env file."
  echo "⚠️  REMINDER: Restart your chaincode container to pick up the new ID!"
else
  echo "⚠️  Warning: 'chaincode' directory not found. Please update .env manually with Package ID: $PKG_ID"
fi

# Check if chaincode is already committed and get current sequence
COMMITTED=$(peer lifecycle chaincode querycommitted --channelID registrar-channel --name registrar-chaincode 2>/dev/null | grep -c "Committed chaincode definition") || true

if [ "$COMMITTED" -gt 0 ]; then
  CURRENT_SEQUENCE=$(peer lifecycle chaincode querycommitted --channelID registrar-channel --name registrar-chaincode 2>/dev/null | grep "Sequence:" | grep -oE '[0-9]+' | tail -1)
  if [ -z "$CURRENT_SEQUENCE" ]; then
    CURRENT_SEQUENCE=1
  fi
  SEQUENCE=$((CURRENT_SEQUENCE + 1))
  echo -e "\n=== Chaincode already committed at sequence $CURRENT_SEQUENCE. Upgrading to sequence $SEQUENCE ==="
else
  echo -e "\n=== First deployment. Using sequence 1 ==="
  SEQUENCE=1
fi

echo -e "\n=== Approving for RegistrarMSP (Sequence: $SEQUENCE) ==="
peer lifecycle chaincode approveformyorg \
  -o orderer.capstone.com:7050 \
  --channelID registrar-channel \
  --name registrar-chaincode \
  --version 1.0 \
  --package-id $PKG_ID \
  --sequence $SEQUENCE \
  --tls \
  --cafile $ORDERER_CA \
  --connTimeout 120s

echo -e "\n=== Committing to channel (Sequence: $SEQUENCE) ==="
peer lifecycle chaincode commit \
  -o orderer.capstone.com:7050 \
  --channelID registrar-channel \
  --name registrar-chaincode \
  --version 1.0 \
  --sequence $SEQUENCE \
  --tls \
  --cafile $ORDERER_CA \
  --connTimeout 120s \
  --peerAddresses peer0.registrar.capstone.com:7051 \
  --tlsRootCertFiles $CORE_PEER_TLS_ROOTCERT_FILE \
  --peerAddresses peer1.registrar.capstone.com:7051 \
  --tlsRootCertFiles /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer1.registrar.capstone.com/tls/ca.crt \
  --peerAddresses peer2.registrar.capstone.com:7051 \
  --tlsRootCertFiles /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer2.registrar.capstone.com/tls/ca.crt

echo -e "\n=== Verifying chaincode is committed ==="
peer lifecycle chaincode querycommitted --channelID registrar-channel

echo -e "\n✓ Chaincode installed, approved, and committed successfully"
