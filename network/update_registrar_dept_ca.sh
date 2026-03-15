#!/bin/bash

export ORDERER_CA=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt
export CHANNEL_NAME="registrar-channel"

echo "====================================================="
echo "==> PHASE 1: Updating Registrar CA..."
echo "====================================================="
export CORE_PEER_LOCALMSPID="RegistrarMSP"
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051

echo "Fetching the latest configuration block..."
peer channel fetch config config_block_reg.pb -o orderer.capstone.com:7050 -c $CHANNEL_NAME --tls --cafile $ORDERER_CA
configtxlator proto_decode --input config_block_reg.pb --type common.Block | jq .data.data[0].payload.data.config > config_reg.json

echo "Injecting the Registrar CA Certificate..."
export REGISTRAR_CA_CERT=$(cat /opt/fabric-config/network/fabric-ca/registrar/ca-cert.pem | base64 | tr -d '\n' | tr -d '\r')
jq ".channel_group.groups.Application.groups.RegistrarMSP.values.MSP.value.config.root_certs += [\"$REGISTRAR_CA_CERT\"] | .channel_group.groups.Application.groups.RegistrarMSP.values.MSP.value.config.tls_root_certs += [\"$REGISTRAR_CA_CERT\"]" config_reg.json > modified_config_reg.json

configtxlator proto_encode --input config_reg.json --type common.Config > config_reg.pb
configtxlator proto_encode --input modified_config_reg.json --type common.Config > modified_config_reg.pb
configtxlator compute_update --channel_id $CHANNEL_NAME --original config_reg.pb --updated modified_config_reg.pb > update_reg.pb
configtxlator proto_decode --input update_reg.pb --type common.ConfigUpdate > update_reg.json
echo '{"payload":{"header":{"channel_header":{"channel_id":"'$CHANNEL_NAME'", "type":2}},"data":{"config_update":'$(cat update_reg.json)'}}}' | jq . > envelope_reg.json
configtxlator proto_encode --input envelope_reg.json --type common.Envelope > envelope_reg.pb

peer channel update -f envelope_reg.pb -c $CHANNEL_NAME -o orderer.capstone.com:7050 --tls --cafile $ORDERER_CA
echo "SUCCESS: Registrar CA injected."

sleep 3

echo ""
echo "====================================================="
echo "==> PHASE 2: Updating Department CA..."
echo "====================================================="
export CORE_PEER_LOCALMSPID="DepartmentMSP"
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/department.capstone.com/peers/peer0.department.capstone.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/department.capstone.com/users/Admin@department.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.department.capstone.com:7051

echo "Fetching the new configuration block..."
peer channel fetch config config_block_dept.pb -o orderer.capstone.com:7050 -c $CHANNEL_NAME --tls --cafile $ORDERER_CA
configtxlator proto_decode --input config_block_dept.pb --type common.Block | jq .data.data[0].payload.data.config > config_dept.json

echo "Injecting the Department CA Certificate..."
export DEPT_CA_CERT=$(cat /opt/fabric-config/network/fabric-ca/department/ca-cert.pem | base64 | tr -d '\n' | tr -d '\r')
jq ".channel_group.groups.Application.groups.DepartmentMSP.values.MSP.value.config.root_certs += [\"$DEPT_CA_CERT\"] | .channel_group.groups.Application.groups.DepartmentMSP.values.MSP.value.config.tls_root_certs += [\"$DEPT_CA_CERT\"]" config_dept.json > modified_config_dept.json

configtxlator proto_encode --input config_dept.json --type common.Config > config_dept.pb
configtxlator proto_encode --input modified_config_dept.json --type common.Config > modified_config_dept.pb
configtxlator compute_update --channel_id $CHANNEL_NAME --original config_dept.pb --updated modified_config_dept.pb > update_dept.pb
configtxlator proto_decode --input update_dept.pb --type common.ConfigUpdate > update_dept.json
echo '{"payload":{"header":{"channel_header":{"channel_id":"'$CHANNEL_NAME'", "type":2}},"data":{"config_update":'$(cat update_dept.json)'}}}' | jq . > envelope_dept.json
configtxlator proto_encode --input envelope_dept.json --type common.Envelope > envelope_dept.pb

peer channel update -f envelope_dept.pb -c $CHANNEL_NAME -o orderer.capstone.com:7050 --tls --cafile $ORDERER_CA
echo "SUCCESS: Department CA injected."
echo "All CA certificates successfully updated!"