# COMPLETE PROJECT AUDIT REPORT
## Capstone Grade Ledger System - Root Cause Analysis

**Status**: 🔴 CRITICAL ISSUES IDENTIFIED & SOLUTIONS PROVIDED

---

## ROOT CAUSE: Chaincode Package ID Mismatch

### The Problem
```
Committed on Channel:  registrar-chaincode_1.0:d23af06e7d54d2dfd6bec339461e35c3c4f1d62f65539420a90035ce3d3554d5
Running in Container:  registrar_1:db52f0b5c1a90b324cfc64bb85d315e2ccb24f68a66a56fba1bc6bec3071505b
                                    ↑ DIFFERENT LABELS - causes peers to reject chaincode
```

When peers try to execute a chaincode query, they look for a container matching the exact CC_ID from the definition. Since the labels don't match, peers can't find the running chaincode and return "Query failed. Errors: []"

---

## Issues Found

### 🔴 ISSUE #1: Chaincode Label Mismatch

**Location**: `network/docker-compose.yaml` (chaincode service)

**Current State**:
- docker-compose builds image with label: `registrar_1` (from Dockerfile)
- .env sets CC_ID: `registrar_1:db52f0b5c1a90b324cfc64bb85d315e2ccb24f68a66a56fba1bc6bec3071505b`
- But peers expect: `registrar-chaincode_1.0:*`

**Why It Fails**:
1. Chaincode was installed multiple times with different labels
2. Latest definition uses `registrar-chaincode_1.0` label
3. Running container uses `registrar_1` label
4. Peer can't match them → Query fails

**Solution**:
Either:
- **Option A (Simple)**: Update docker-compose to build with correct label
- **Option B (Clean)**: Clean up all old definitions and start fresh

### 🟡 ISSUE #2: Multiple Chaincode Packages Installed

**Current Installed Packages** (on peer):
```
1. registrar-chaincode_1.0:fcdf1b70...
2. registrar-chaincode_1.0:65a2a868...
3. registrar-chaincode_1.0:675fc007...
4. registrar-chaincode_1.0:d23af06e... ← COMMITTED ONE
5. registrar_1:db52f0b5c... ← RUNNING ONE (MISMATCH!)
```

**Problem**: Too many packages polluting the peer. The committed one (#4) doesn't match the running one (#5).

### 🟡 ISSUE #3: Chaincode Dockerfile Label

**File**: `chaincode/Dockerfile`

**Current**:
```dockerfile
RUN go build -o registrar_cc main.go
```

**Issue**: The binary is named `registrar_cc` but docker-compose service label is `registrar_1`. This creates confusion about which package is which.

---

## STEP-BY-STEP FIX

### Phase 1: Clean Up

```bash
# 1. Stop all containers
docker compose down

# 2. Remove peer ledger data (to reset chaincode state)
docker volume rm $(docker volume ls | grep "registrar" | awk '{print $2}') 2>/dev/null || true

# 3. Restart fresh
docker compose up -d
```

### Phase 2: Verify Setup

```bash
# 1. Wait for peers to start
sleep 30

# 2. Join peers to channel (if needed)
docker exec cli peer channel join -b registrar-channel.block

# 3. Verify chaincode committed
docker exec cli peer lifecycle chaincode querycommitted --channelID registrar-channel --name registrar-chaincode
```

### Phase 3: Install Chaincode with Correct Label

```bash
# Create proper CCAAS package
docker exec cli bash -c "
  cd /tmp
  rm -rf ccaas
  mkdir -p ccaas/META-INF
  echo '{\"type\":\"ccaas\",\"label\":\"registrar-chaincode_1.0\"}' > ccaas/META-INF/metadata.json
  echo '{\"address\":\"registrar-chaincode:9999\",\"dial_timeout\":\"10s\",\"tls_required\":false,\"client_auth_required\":false,\"client_auth_type\":\"NoClientCert\"}' > ccaas/META-INF/connection.json
  cd ccaas
  tar -czf /opt/fabric-config/network/registrar-ccaas-final.tar.gz META-INF/
"

# Install on all peers
for i in {0..5}; do
  docker exec cli sh -c "
    export CORE_PEER_ADDRESS=peer$i.registrar.capstone.com:7051
    peer lifecycle chaincode install /opt/fabric-config/network/registrar-ccaas-final.tar.gz
  "
done

# Get the package ID
PKG_ID=$(docker exec cli peer lifecycle chaincode calculatepackageid /opt/fabric-config/network/registrar-ccaas-final.tar.gz 2>&1 | tail -1)
echo "Package ID: $PKG_ID"
```

### Phase 4: Approve and Commit

```bash
# Set the package ID from Phase 3
PKG_ID="registrar-chaincode_1.0:XXXXX" # Replace with actual ID

# Approve
docker exec cli peer lifecycle chaincode approveformyorg \
  -o orderer.capstone.com:7050 \
  --tls --cafile /etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/msp/tlscacerts/tlsca.capstone.com-cert.pem \
  --channelID registrar-channel \
  --name registrar-chaincode \
  --version 1.0 \
  --package-id "$PKG_ID" \
  --sequence 1

# Commit
docker exec cli peer lifecycle chaincode commit \
  -o orderer.capstone.com:7050 \
  --tls --cafile /etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/msp/tlscacerts/tlsca.capstone.com-cert.pem \
  --channelID registrar-channel \
  --name registrar-chaincode \
  --version 1.0 \
  --sequence 1 \
  --peerAddresses peer0.registrar.capstone.com:7051 \
  --tlsRootCertFiles /etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/peers/peer0.registrar.capstone.com/tls/ca.crt
```

### Phase 5: Update .env File

```bash
# Update network/.env with the correct CC_ID
sed -i "s/^CHAINCODE_ID=.*/CHAINCODE_ID=$PKG_ID/" network/.env

# Update chaincode/.env
sed -i "s/^CHAINCODE_ID=.*/CHAINCODE_ID=$PKG_ID/" chaincode/.env
```

### Phase 6: Restart Chaincode Container

```bash
# Restart with matching CC_ID
docker compose restart registrar-chaincode

# Wait 10 seconds
sleep 10

# Verify it's running
docker logs registrar-chaincode --tail=5
```

### Phase 7: Test Middleware

```bash
# Restart middleware to reconnect
pkill -f "node middleware.js"
cd middleware
npm start &
sleep 5

# Test API
curl -X GET http://localhost:4000/api/all-grades
# Should return: [] (empty array) or existing grades
```

---

## File Structure & Responsibilities

```
network/
├── docker-compose.yaml          ← Defines chaincode service label
├── .env                         ← Sets CHAINCODE_ID (must match running container)
├── setup-chaincode.sh           ← Install/approve/commit chaincode
└── registrar-ccaas-final.tar.gz ← CCAAS package with correct label

chaincode/
├── main.go                      ← Chaincode logic
├── go.mod / go.sum              ← Go dependencies
├── Dockerfile                   ← Builds binary (registrar_cc)
└── .env                         ← CHAINCODE_ID must match docker-compose

middleware/
├── middleware.js                ← Connects to blockchain & exposes API
├── connection.json              ← Peer connection configs (FIXED: peer ports)
└── .env                         ← Wallet and chaincode configs

client-app/
├── Controllers/GradeController.cs   ← API endpoints calling middleware
├── Services/BlockchainService.cs    ← Calls http://localhost:4000
└── appsettings.json                 ← Database connection
```

---

## Verification Checklist

- [ ] All peers running (docker ps shows 6 peers + orderer + ca)
- [ ] Chaincode container running with matching CC_ID
- [ ] Middleware running on port 4000 without errors
- [ ] Middleware logs show "[SUCCESS] Middleware blockchain gateway is ACTIVE"
- [ ] `curl http://localhost:4000/api/all-grades` returns JSON array
- [ ] C# backend can call `/api/Grades/record` and get 200 response
- [ ] Database entries logged in PostgreSQL

---

## Quick Restart Script

Save as `restart-all.sh`:

```bash
#!/bin/bash
set -e

echo "=== Stopping all services ==="
docker compose down
pkill -f "node middleware.js" || true

echo "=== Restarting Fabric network ==="
docker compose up -d
sleep 30

echo "=== Joining peers to channel ==="
docker exec cli peer channel join -b registrar-channel.block || true

echo "=== Committing chaincode at sequence 1 ==="
docker exec cli bash /opt/fabric-config/network/setup-chaincode.sh || true

echo "=== Starting middleware ==="
cd middleware
npm start &
sleep 5

echo "=== Testing API ==="
curl -X GET http://localhost:4000/api/all-grades

echo "✅ System ready. Test from C# backend:"
echo "   http://localhost:5000/api/Grades/record (POST)"
```

---

## Expected Final State

```
✅ Chaincode committed to channel
✅ Chaincode container running with matching CC_ID
✅ Middleware responding to queries
✅ C# backend receiving responses
✅ Database logging corrections
```

**Result**: `/api/Grades/record` returns **200 OK** instead of **500 Internal Server Error**

Let me know if you need help running any of these commands!
