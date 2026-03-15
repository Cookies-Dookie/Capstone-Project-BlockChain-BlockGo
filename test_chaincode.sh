#!/bin/bash
cd /opt/fabric-config/network
peer chaincode query -C registrar-channel -n registrar-chaincode -c '{"Args":["GetAllGrades"]}'
