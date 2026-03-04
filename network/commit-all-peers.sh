#!/bin/bash
export CORE_PEER_LOCALMSPID="RegistrarMSP"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
export ORDERER_CA=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt

peer lifecycle chaincode commit -o orderer.capstone.com:7050 --tls true --cafile $ORDERER_CA --channelID registrar-channel --name registrar-chaincode --version 1.0 --sequence 1 --peerAddresses peer0.registrar.capstone.com:7051 --tlsRootCertFiles /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt --peerAddresses peer1.registrar.capstone.com:7051 --tlsRootCertFiles /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer1.registrar.capstone.com/tls/ca.crt --peerAddresses peer2.registrar.capstone.com:7051 --tlsRootCertFiles /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer2.registrar.capstone.com/tls/ca.crt
