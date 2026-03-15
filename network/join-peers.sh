#!/bin/bash
for i in 1 2 3 4 5; do
  export CORE_PEER_ADDRESS=peer${i}.registrar.capstone.com:7051
  echo "Joining peer${i}..."
  peer channel join -b registrar-channel.block
done
