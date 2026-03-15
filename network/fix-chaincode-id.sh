#!/bin/bash

# Get the current chaincode container ID
RUNNING_CC_ID=$(docker logs registrar-chaincode 2>&1 | grep "ID:" | tail -1 | grep -oE "registrar-chaincode_1.0:[a-f0-9]{64}" | head -1)

echo "Running Chaincode CC_ID: $RUNNING_CC_ID"
echo ""

# Update .env with running CC_ID
if [ ! -z "$RUNNING_CC_ID" ]; then
  sed -i "s|^CC_ID=.*|CC_ID=$RUNNING_CC_ID|" .env
  echo "✅ Updated .env with CC_ID: $RUNNING_CC_ID"
else
  echo "❌ Could not determine running CC_ID"
  exit 1
fi

echo ""
echo "Now installing chaincode with matching ID..."
echo ""

# Install on all peers
for i in 0 1 2 3 4 5; do
  export CORE_PEER_ADDRESS=peer${i}.registrar.capstone.com:7051
  echo "Installing on peer${i}..."
  docker exec cli peer lifecycle chaincode install /opt/fabric-config/network/registrar-ccaas.tar.gz 2>&1 | grep -E "(Installed|Error)" || echo "✓ Peer $i processed"
done

echo ""
echo "✅ Installation complete. Chaincode should now respond to queries."
