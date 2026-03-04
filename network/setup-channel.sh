#!/bin/bash
set -e

export CORE_PEER_LOCALMSPID='RegistrarMSP'
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
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
# This fixes the 'creator org unknown' error on the peers by ensuring they use the same NodeOU configuration
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

cd /opt/fabric-config/channel-artifacts

echo "=== Step 1: Create channel ==="
if peer channel fetch 0 registrar-channel.block -o orderer.capstone.com:7050 -c registrar-channel --tls --cafile $ORDERER_CA; then
  echo "Channel 'registrar-channel' already exists. Block 0 fetched."
else
  echo "Creating channel 'registrar-channel'..."
  peer channel create \
    -o orderer.capstone.com:7050 \
    -c registrar-channel \
    -f registrar-channel.tx \
    --tls \
    --cafile $ORDERER_CA \
    --connTimeout 120s
fi

echo "Waiting for channel creation to propagate..."
sleep 5

echo "=== Step 2: Join all peers to channel ==="
for i in 0 1 2 3 4 5; do
  export CORE_PEER_ADDRESS=peer${i}.registrar.capstone.com:7051
  echo "Joining peer${i}..."
  # Capture output to check for "already exists" vs real errors
  if JOIN_OUTPUT=$(peer channel join -b registrar-channel.block 2>&1); then
    echo "✓ Peer${i} joined successfully."
  elif echo "$JOIN_OUTPUT" | grep -q "LedgerID already exists"; then
    echo "✓ Peer${i} was already joined."
  else
    echo "❌ Error joining peer${i}: $JOIN_OUTPUT"
    echo "!!! Critical failure. Stopping setup to prevent looping."
    exit 1
  fi
done

echo "=== Step 3: Verify peers joined ==="
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
peer channel list

echo "✓ Channel created and all peers joined"
