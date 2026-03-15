#!/bin/bash
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt

peer chaincode query -C registrar-channel -n registrar-chaincode -c '{"Args":["GetAllGrades"]}'
