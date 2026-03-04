#!/bin/bash

# --- 1. CONFIGURATION ---
export CC_NAME="registrar-chaincode"
export CC_VERSION="1.4"
export CC_SEQUENCE="1"
export CC_POLICY="OR('RegistrarMSP.member')" # Example policy
export ORDERER_CA="/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt"
export PEER0_CA="/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt"

echo "--- Querying installed package ID for ${CC_NAME}_${CC_VERSION} ---"
# This assumes the package has already been installed on the target peer (peer0)
export CC_PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep "Package ID: ${CC_NAME}_${CC_VERSION}" | awk -F'Package ID: ' '{print $2}' | awk -F',' '{print $1}')

if [ -z "$CC_PACKAGE_ID" ]; then
  echo "!!! Error: Could not find installed package for ${CC_NAME}_${CC_VERSION}."
  exit 1
fi
echo "Found Package ID: $CC_PACKAGE_ID"

echo "--- 1. Repairing Corrupted config.yaml ---"
cat <<EOF > /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/msp/config.yaml
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/ca.registrar.capstone.com-cert.pem
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/ca.registrar.capstone.com-cert.pem
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/ca.registrar.capstone.com-cert.pem
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/ca.registrar.capstone.com-cert.pem
    OrganizationalUnitIdentifier: orderer
EOF
cp /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/msp/config.yaml \
   /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/msp/config.yaml

echo "--- 2. Approving Version $CC_VERSION ---"
peer lifecycle chaincode approveformyorg \
  -o orderer.capstone.com:7050 --tls true --cafile $ORDERER_CA \
  --channelID registrar-channel --name $CC_NAME --version $CC_VERSION \
  --package-id $CC_PACKAGE_ID --sequence $CC_SEQUENCE --signature-policy "$CC_POLICY"

echo "--- 3. Committing Version $CC_VERSION ---"
peer lifecycle chaincode commit \
  -o orderer.capstone.com:7050 --tls true --cafile $ORDERER_CA \
  --channelID registrar-channel --name $CC_NAME --version $CC_VERSION \
  --sequence $CC_SEQUENCE --signature-policy "$CC_POLICY" \
  --peerAddresses peer0.registrar.capstone.com:7051 \
  --tlsRootCertFiles $PEER0_CA

echo "--- 4. Waiting for ledger (5s) ---"
sleep 5

echo "--- 5. Invoking InitLedger ---"
peer chaincode invoke \
  -o orderer.capstone.com:7050 --tls true --cafile $ORDERER_CA \
  --channelID registrar-channel --name $CC_NAME \
  --peerAddresses peer0.registrar.capstone.com:7051 \
  --tlsRootCertFiles $PEER0_CA \
  -c '{"Args":["InitLedger"]}'