#!/bin/bash
echo "==> 1. Installing jq for JSON parsing..."
apt-get update && apt-get install -y jq

echo "==> 2. Setting Faculty Admin Environment Variables..."
export CORE_PEER_LOCALMSPID="FacultyMSP"
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/faculty.capstone.com/peers/peer0.faculty.capstone.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/faculty.capstone.com/users/Admin@faculty.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.faculty.capstone.com:7051
export ORDERER_CA=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt
export CHANNEL_NAME="registrar-channel"

echo "==> 3. Fetching the latest configuration block..."
peer channel fetch config config_block.pb -o orderer.capstone.com:7050 -c $CHANNEL_NAME --tls --cafile $ORDERER_CA

echo "==> 4. Decoding Protobuf to JSON..."
configtxlator proto_decode --input config_block.pb --type common.Block | jq .data.data[0].payload.data.config > config.json

echo "==> 5. Injecting the Faculty CA Certificate..."
export NEW_CA_CERT=$(cat /opt/fabric-config/network/fabric-ca/faculty/ca-cert.pem | base64 | tr -d '\n' | tr -d '\r')
jq ".channel_group.groups.Application.groups.FacultyMSP.values.MSP.value.config.root_certs += [\"$NEW_CA_CERT\"] | .channel_group.groups.Application.groups.FacultyMSP.values.MSP.value.config.tls_root_certs += [\"$NEW_CA_CERT\"]" config.json > modified_config.json

echo "==> 6. Encoding back to Protobuf..."
configtxlator proto_encode --input config.json --type common.Config > config.pb
configtxlator proto_encode --input modified_config.json --type common.Config > modified_config.pb

echo "==> 7. Computing the Delta (Differences)..."
configtxlator compute_update --channel_id $CHANNEL_NAME --original config.pb --updated modified_config.pb > update.pb

echo "==> 8. Packaging into an Envelope..."
configtxlator proto_decode --input update.pb --type common.ConfigUpdate > update.json
echo '{"payload":{"header":{"channel_header":{"channel_id":"'$CHANNEL_NAME'", "type":2}},"data":{"config_update":'$(cat update.json)'}}}' | jq . > envelope.json
configtxlator proto_encode --input envelope.json --type common.Envelope > envelope.pb

echo "==> 9. Submitting Channel Update..."
peer channel update -f envelope.pb -c $CHANNEL_NAME -o orderer.capstone.com:7050 --tls --cafile $ORDERER_CA

echo "SUCCESS: The Channel now trusts the Faculty CA!"