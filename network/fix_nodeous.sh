#!/bin/bash

export ORDERER_CA=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt
export CHANNEL_NAME="registrar-channel"

echo "====================================================="
echo "==> PHASE 1: Relaxing NodeOUs for RegistrarMSP..."
echo "====================================================="
export CORE_PEER_LOCALMSPID="RegistrarMSP"
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051

peer channel fetch config config_reg.pb -o orderer.capstone.com:7050 -c $CHANNEL_NAME --tls --cafile $ORDERER_CA
configtxlator proto_decode --input config_reg.pb --type common.Block | jq .data.data[0].payload.data.config > config_reg.json

jq '
del(.channel_group.groups.Application.groups.RegistrarMSP.values.MSP.value.config.fabric_node_ous.admin_ou_identifier.certificate) |
del(.channel_group.groups.Application.groups.RegistrarMSP.values.MSP.value.config.fabric_node_ous.client_ou_identifier.certificate) |
del(.channel_group.groups.Application.groups.RegistrarMSP.values.MSP.value.config.fabric_node_ous.peer_ou_identifier.certificate) |
del(.channel_group.groups.Application.groups.RegistrarMSP.values.MSP.value.config.fabric_node_ous.orderer_ou_identifier.certificate)
' config_reg.json > mod_reg.json

configtxlator proto_encode --input config_reg.json --type common.Config > c_reg.pb
configtxlator proto_encode --input mod_reg.json --type common.Config > m_reg.pb
configtxlator compute_update --channel_id $CHANNEL_NAME --original c_reg.pb --updated m_reg.pb > u_reg.pb
configtxlator proto_decode --input u_reg.pb --type common.ConfigUpdate > u_reg.json
echo '{"payload":{"header":{"channel_header":{"channel_id":"'$CHANNEL_NAME'", "type":2}},"data":{"config_update":'$(cat u_reg.json)'}}}' | jq . > env_reg.json
configtxlator proto_encode --input env_reg.json --type common.Envelope > env_reg.pb
peer channel update -f env_reg.pb -c $CHANNEL_NAME -o orderer.capstone.com:7050 --tls --cafile $ORDERER_CA
echo "SUCCESS: RegistrarMSP NodeOUs relaxed."
sleep 2

echo ""
echo "====================================================="
echo "==> PHASE 2: Relaxing NodeOUs for FacultyMSP..."
echo "====================================================="
export CORE_PEER_LOCALMSPID="FacultyMSP"
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/faculty.capstone.com/peers/peer0.faculty.capstone.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/faculty.capstone.com/users/Admin@faculty.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.faculty.capstone.com:7051

peer channel fetch config config_fac.pb -o orderer.capstone.com:7050 -c $CHANNEL_NAME --tls --cafile $ORDERER_CA
configtxlator proto_decode --input config_fac.pb --type common.Block | jq .data.data[0].payload.data.config > config_fac.json

jq '
del(.channel_group.groups.Application.groups.FacultyMSP.values.MSP.value.config.fabric_node_ous.admin_ou_identifier.certificate) |
del(.channel_group.groups.Application.groups.FacultyMSP.values.MSP.value.config.fabric_node_ous.client_ou_identifier.certificate) |
del(.channel_group.groups.Application.groups.FacultyMSP.values.MSP.value.config.fabric_node_ous.peer_ou_identifier.certificate) |
del(.channel_group.groups.Application.groups.FacultyMSP.values.MSP.value.config.fabric_node_ous.orderer_ou_identifier.certificate)
' config_fac.json > mod_fac.json

configtxlator proto_encode --input config_fac.json --type common.Config > c_fac.pb
configtxlator proto_encode --input mod_fac.json --type common.Config > m_fac.pb
configtxlator compute_update --channel_id $CHANNEL_NAME --original c_fac.pb --updated m_fac.pb > u_fac.pb
configtxlator proto_decode --input u_fac.pb --type common.ConfigUpdate > u_fac.json
echo '{"payload":{"header":{"channel_header":{"channel_id":"'$CHANNEL_NAME'", "type":2}},"data":{"config_update":'$(cat u_fac.json)'}}}' | jq . > env_fac.json
configtxlator proto_encode --input env_fac.json --type common.Envelope > env_fac.pb
peer channel update -f env_fac.pb -c $CHANNEL_NAME -o orderer.capstone.com:7050 --tls --cafile $ORDERER_CA
echo "SUCCESS: FacultyMSP NodeOUs relaxed."
sleep 2

echo ""
echo "====================================================="
echo "==> PHASE 3: Relaxing NodeOUs for DepartmentMSP..."
echo "====================================================="
export CORE_PEER_LOCALMSPID="DepartmentMSP"
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/department.capstone.com/peers/peer0.department.capstone.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/department.capstone.com/users/Admin@department.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.department.capstone.com:7051

peer channel fetch config config_dep.pb -o orderer.capstone.com:7050 -c $CHANNEL_NAME --tls --cafile $ORDERER_CA
configtxlator proto_decode --input config_dep.pb --type common.Block | jq .data.data[0].payload.data.config > config_dep.json

jq '
del(.channel_group.groups.Application.groups.DepartmentMSP.values.MSP.value.config.fabric_node_ous.admin_ou_identifier.certificate) |
del(.channel_group.groups.Application.groups.DepartmentMSP.values.MSP.value.config.fabric_node_ous.client_ou_identifier.certificate) |
del(.channel_group.groups.Application.groups.DepartmentMSP.values.MSP.value.config.fabric_node_ous.peer_ou_identifier.certificate) |
del(.channel_group.groups.Application.groups.DepartmentMSP.values.MSP.value.config.fabric_node_ous.orderer_ou_identifier.certificate)
' config_dep.json > mod_dep.json

configtxlator proto_encode --input config_dep.json --type common.Config > c_dep.pb
configtxlator proto_encode --input mod_dep.json --type common.Config > m_dep.pb
configtxlator compute_update --channel_id $CHANNEL_NAME --original c_dep.pb --updated m_dep.pb > u_dep.pb
configtxlator proto_decode --input u_dep.pb --type common.ConfigUpdate > u_dep.json
echo '{"payload":{"header":{"channel_header":{"channel_id":"'$CHANNEL_NAME'", "type":2}},"data":{"config_update":'$(cat u_dep.json)'}}}' | jq . > env_dep.json
configtxlator proto_encode --input env_dep.json --type common.Envelope > env_dep.pb
peer channel update -f env_dep.pb -c $CHANNEL_NAME -o orderer.capstone.com:7050 --tls --cafile $ORDERER_CA
echo "SUCCESS: DepartmentMSP NodeOUs relaxed."
echo "ALL RESTRAINTS REMOVED! THE CHANNEL NOW FULLY TRUSTS YOUR FABRIC CAS!"