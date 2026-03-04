#!/bin/bash
set -e

export CORE_PEER_LOCALMSPID='RegistrarMSP'
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
export ORDERER_CA=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt

cd /opt/fabric-config/channel-artifacts

# Create the JSON payload in a file first
cat > /tmp/grade_payload.json << 'EOF'
{
  "id": "test-cli-001",
  "student_hash": "student001",
  "subject_code": "CS101",
  "course": "Intro to CS",
  "section": "A",
  "grade": "A",
  "semester": "Spring",
  "school_year": "2025",
  "faculty_id": "prof001",
  "date": "2026-03-02",
  "ipfs_cid": "QmTest",
  "university": "PLV",
  "status": "Verified",
  "version": 1
}
EOF

# Convert to string for chaincode
GRADE_JSON=$(cat /tmp/grade_payload.json | tr -d '\n')

echo "=== Testing chaincode invoke ==="
echo "Grade JSON: $GRADE_JSON"

peer chaincode invoke \
  -C registrar-channel \
  -n registrar-chaincode \
  -c "{\"function\":\"IssueGrade\",\"Args\":[\"$GRADE_JSON\"]}" \
  -o orderer.capstone.com:7050 \
  --tls \
  --cafile $ORDERER_CA \
  --peerAddresses peer0.registrar.capstone.com:7051 \
  --tlsRootCertFiles /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt

echo -e "\n✓ Chaincode invoke successful"
