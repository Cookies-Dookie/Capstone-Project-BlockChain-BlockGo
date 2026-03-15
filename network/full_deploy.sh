#!/bin/bash

# --- 1. CONFIGURATION ---
export CHANNEL_NAME="registrar-channel"
export CC_NAME="registrar"
export CC_VERSION="1.0"
export CC_SEQUENCE="1"
# Simplified policy for testing; ensure it matches your requirements
export CC_POLICY="OR('RegistrarMSP.member', 'FacultyMSP.member', 'DepartmentMSP.member')"
export CC_LABEL="${CC_NAME}_${CC_VERSION}"

# TLS Cert Paths
export CRYPTO_PATH="/etc/hyperledger/fabric/crypto-config"
export ORDERER_CA="${CRYPTO_PATH}/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt"

# Peer TLS Root Certs
export REGISTRAR_CA="${CRYPTO_PATH}/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt"
export FACULTY_CA="${CRYPTO_PATH}/peerOrganizations/faculty.capstone.com/peers/peer0.faculty.capstone.com/tls/ca.crt"
export DEPT_CA="${CRYPTO_PATH}/peerOrganizations/department.capstone.com/peers/peer0.department.capstone.com/tls/ca.crt"

echo "--- STARTING FAIL-PROOF DEPLOYMENT ---"

# --- 1.5 FAIL-PROOF TLS CHECK ---
echo "Checking TLS certificates..."
for cert in "$ORDERER_CA" "$REGISTRAR_CA" "$FACULTY_CA" "$DEPT_CA"; do
    if [ ! -f "$cert" ]; then
        echo "❌ FATAL ERROR: TLS Certificate not found at $cert"
        echo "Make sure your crypto-config folder is properly generated and mounted to the CLI container."
        exit 1
    fi
done
echo "✅ All TLS certificates verified."

# --- 2. HELPER: SWITCH IDENTITY ---
setIdentity() {
    local ORG=$1
    # IMPORTANT: Internal Docker Port is ALWAYS 7051
    if [ "$ORG" == "registrar" ]; then
        export CORE_PEER_LOCALMSPID="RegistrarMSP"
        export CORE_PEER_ADDRESS="peer0.registrar.capstone.com:7051"
        export CORE_PEER_MSPCONFIGPATH="${CRYPTO_PATH}/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp"
        export CORE_PEER_TLS_ROOTCERT_FILE=$REGISTRAR_CA
    elif [ "$ORG" == "faculty" ]; then
        export CORE_PEER_LOCALMSPID="FacultyMSP"
        export CORE_PEER_ADDRESS="peer0.faculty.capstone.com:7051"
        export CORE_PEER_MSPCONFIGPATH="${CRYPTO_PATH}/peerOrganizations/faculty.capstone.com/users/Admin@faculty.capstone.com/msp"
        export CORE_PEER_TLS_ROOTCERT_FILE=$FACULTY_CA
    elif [ "$ORG" == "department" ]; then
        export CORE_PEER_LOCALMSPID="DepartmentMSP"
        export CORE_PEER_ADDRESS="peer0.department.capstone.com:7051"
        export CORE_PEER_MSPCONFIGPATH="${CRYPTO_PATH}/peerOrganizations/department.capstone.com/users/Admin@department.capstone.com/msp"
        export CORE_PEER_TLS_ROOTCERT_FILE=$DEPT_CA
    fi
}

# --- 3. CHANNEL CREATION (With Retry Logic) ---
setIdentity "registrar"
echo "Creating channel: $CHANNEL_NAME..."
MAX_RETRY=5
COUNTER=1
while [ $COUNTER -le $MAX_RETRY ]; do
    peer channel create -o orderer.capstone.com:7050 -c $CHANNEL_NAME \
        -f /opt/fabric-config/network/channel-artifacts/${CHANNEL_NAME}.tx \
        --tls true --cafile $ORDERER_CA --outputBlock ./${CHANNEL_NAME}.block
    
    if [ $? -eq 0 ]; then
        echo "✅ Channel created successfully!"
        break
    else
        echo "⏳ Orderer not ready yet (Attempt $COUNTER/$MAX_RETRY). Waiting 5s..."
        sleep 5
        COUNTER=$((COUNTER+1))
    fi
done

# --- 4. JOIN CHANNEL ---
for ORG in "registrar" "faculty" "department"; do
    setIdentity $ORG
    echo "Joining $ORG peer to $CHANNEL_NAME..."
    peer channel join -b ./${CHANNEL_NAME}.block
done

# --- 5. PACKAGE CCAAS & PRIVATE DATA ---
echo "Packaging Chaincode-as-a-Service and generating Private Data Collections..."

# Create the inner code package containing connection.json
cat <<EOF > connection.json
{
  "address": "registrar-chaincode:9999",
  "dial_timeout": "10s",
  "tls_required": false
}
EOF
tar cfz code.tar.gz connection.json

# Create the metadata file
echo '{"path": "", "type": "ccaas", "label": "'${CC_LABEL}'"}' > metadata.json

# Create the final installable package (Outer tar)
tar cfz ${CC_NAME}.tar.gz metadata.json code.tar.gz

# Dynamically Generate the Collections Config File
cat <<EOF > collections.json
[
  {
     "name": "collectionGrades",
     "policy": "OR('RegistrarMSP.member', 'FacultyMSP.member', 'DepartmentMSP.member')",
     "requiredPeerCount": 0,
     "maxPeerCount": 3,
     "blockToLive": 0,
     "memberOnlyRead": true
  }
]
EOF
export CC_COLLECTIONS_CONFIG="$(pwd)/collections.json"

# --- 6. INSTALL & APPROVE ---
for ORG in "registrar" "faculty" "department"; do
    setIdentity $ORG
    echo "Installing CC on $ORG..."
    peer lifecycle chaincode install ${CC_NAME}.tar.gz
    
    # Grab the Package ID from the specific peer
    PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | sed -n 's/.*Package ID: \([^,]*\).*/\1/p')
    echo "Approving CC for $ORG (ID: $PACKAGE_ID)..."
    
    peer lifecycle chaincode approveformyorg -o orderer.capstone.com:7050 --tls true --cafile $ORDERER_CA \
        --channelID $CHANNEL_NAME --name $CC_NAME --version $CC_VERSION \
        --package-id "$PACKAGE_ID" --sequence $CC_SEQUENCE --signature-policy "$CC_POLICY" \
        --collections-config $CC_COLLECTIONS_CONFIG
done

# --- 7. COMMIT ---
setIdentity "registrar"
echo "Committing chaincode definition to channel..."
peer lifecycle chaincode commit -o orderer.capstone.com:7050 --tls true --cafile $ORDERER_CA \
    --channelID $CHANNEL_NAME --name $CC_NAME --version $CC_VERSION \
    --sequence $CC_SEQUENCE --signature-policy "$CC_POLICY" \
    --collections-config $CC_COLLECTIONS_CONFIG \
    --peerAddresses peer0.registrar.capstone.com:7051 --tlsRootCertFiles $REGISTRAR_CA \
    --peerAddresses peer0.faculty.capstone.com:7051 --tlsRootCertFiles $FACULTY_CA \
    --peerAddresses peer0.department.capstone.com:7051 --tlsRootCertFiles $DEPT_CA

echo "🎉 --- DEPLOYMENT SUCCESSFUL --- 🎉"
echo "Final Package ID: $PACKAGE_ID"
echo "Private Data Collections injected seamlessly."