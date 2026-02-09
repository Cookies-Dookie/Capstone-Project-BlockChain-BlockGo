#!/bin/bash

echo "Creating channel 'mychannel'..."
MSYS_NO_PATHCONV=1 docker exec \
  -e CORE_PEER_LOCALMSPID=Org1MSP \
  -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/msp \
  peer0.registrar.capstone.com \
  peer channel create -o orderer.capstone.com:7050 -c mychannel -f /etc/hyperledger/fabric/channel.tx --outputBlock /etc/hyperledger/fabric/mychannel.block

PEERS=("peer0" "peer1" "peer2" "peer3" "peer4" "peer5")

for PEER in "${PEERS[@]}"; do
    echo "Joining $PEER to 'mychannel'..."
    MSYS_NO_PATHCONV=1 docker exec \
      -e CORE_PEER_LOCALMSPID=Org1MSP \
      -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/msp \
      $PEER.registrar.capstone.com \
      peer channel join -b /etc/hyperledger/fabric/mychannel.block
done

echo " All 6 peers have successfully joined 'mychannel'!"