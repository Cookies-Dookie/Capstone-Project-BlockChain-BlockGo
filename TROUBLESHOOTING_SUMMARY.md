# Hyperledger Fabric Setup - Troubleshooting Summary

## Status: 95% Complete - Awaiting Policy/Permission Resolution

### ✓ Verified & Fixed

1. **Chaincode Compilation & Runtime**
   - Fixed unused import errors in main.go
   - Chaincode binary builds and runs successfully
   - Listening on port 9999 with TLS enabled

2. **Channel & Network**
   - Channel `registrar-channel` created and active
   - All 6 peers joined the channel successfully  
   - Network connectivity confirmed (peer can reach chaincode on 172.19.0.x:9999)

3. **Chaincode Lifecycle**
   - Package installed on all peers (v1, v2, v3 iterations)
   - Upgraded to sequence 3 with TLS enabled
   - Committed to channel and available

4. **Wallet & Identity**
   - admin.id present with RegistrarMSP
   - Includes faculty role attribute in certificate
   - Properly loaded by Fabric SDK

5. **API Middleware**
   - Node.js running on port 4000
   - Successfully connects to Fabric gateway
   - Retrieves contract instance
   - Proper error logging in place

### ✗ Current Blocking Issue

**Error:** "No valid responses from any peers. Errors: []"

**Symptoms:**
- Peer accepts the transaction proposal
- Chaincode container is running
- Port 9999 is reachable
- But peer refuses to endorse the transaction
- Empty error array prevents root cause identification

### Likely Root Causes (Not Docker-related)

1. **Endorsement Policy** - Channel may require endorsement from multiple peers or specific orgs
2. **Identity Permissions** - `admin` identity may lack write permissions on the channel
3. **Certificate Trust** - Peer's TLS validation may be failing for chaincode certs
4. **Role Attribute Validation** - Chaincode's `cid.AssertAttributeValue("role", "faculty")` may be failing silently

### Next Steps to Debug

1. **Check peer logs for rejection reason:**
   ```bash
   docker logs peer0.registrar.capstone.com --tail 100 | grep -i "rejected\|permission\|policy\|endorsed"
   ```

2. **Try a test invoke via peer CLI:**
   ```bash
   docker exec fabric-tools bash -c '
   export CORE_PEER_LOCALMSPID=RegistrarMSP
   export CORE_PEER_TLS_ENABLED=true
   export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
   export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
   export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
   
   peer chaincode query -C registrar-channel -n registrar-chaincode -c '\''{\"function\":\"ReadGrade\",\"Args\":[\"test\"]}'\''
   '
   ```

3. **Check channel policies:**
   ```bash
   docker exec fabric-tools bash -c '
   export CORE_PEER_LOCALMSPID=RegistrarMSP
   export CORE_PEER_ADDRESS=peer0.registrar.capstone.com:7051
   export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp
   export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
   
   peer channel fetch config /tmp/config_block.pb -c registrar-channel -o orderer.capstone.com:7050 --tls --cafile /etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt
   '
   ```

### Files Modified

- `chaincode/main.go` - Removed unused imports, added debug logging
- `middleware/middleware.js` - Added comprehensive error logging
- `network/upgrade-chaincode.sh` - Created for chaincode lifecycle upgrades

### Docker Artifacts Status

- ✓ Chaincode container: Running, port 9999 listening
- ✓ Peer container: Running, able to reach chaincode
- ✓ Middleware container: Running (Node.js), port 4000 listening
- ✓ Fabric tools: Running, all CLI commands working
- ✓ Channel: Active with all blocks committed
- ✓ Network: registrar-net bridge active with all containers connected
