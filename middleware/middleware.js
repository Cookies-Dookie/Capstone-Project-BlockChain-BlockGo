require('dotenv').config();
const express = require('express');
const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

let gateway;
let contract;
let network;

async function initializeGateway() {
    try {
        console.log('[INFO] Starting Fabric Gateway Initialization...');

        const walletPath = path.resolve(__dirname, process.env.WALLET_PATH || 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const ccpPath = path.resolve(__dirname, process.env.CONNECTION_PROFILE_PATH || '../network/connection.json');
        
        if (!fs.existsSync(ccpPath)) {
            throw new Error(`Connection profile not found at: ${ccpPath}`);
        }

        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        console.log(`[DEBUG] CCP File Loaded Successfully from: ${ccpPath}`);
        console.log(`[DEBUG] Keys found in CCP:`, Object.keys(ccp));
        if (ccp.peers) {
            console.log(`[DEBUG] Peers found:`, Object.keys(ccp.peers));
        } else {
            console.log(`[DEBUG] WARNING: 'peers' key is missing in the loaded JSON!`);
        }

        const peerName = 'peer0.registrar.capstone.com';
        const peer = ccp.peers[peerName];

        if (!peer) {
            throw new Error(`Peer '${peerName}' not found in connection profile.`);
        }

        if (peer?.tlsCACerts?.path) {
            const tlsCertPath = path.resolve(__dirname, '..', 'network', peer.tlsCACerts.path);
            console.log(`[INFO] Embedding PEM for ${peerName}`);
            peer.tlsCACerts.pem = fs.readFileSync(tlsCertPath).toString();
            delete peer.tlsCACerts.path;
        }

        const newGateway = new Gateway();
        await newGateway.connect(ccp, {
            wallet,
            identity: process.env.IDENTITY_LABEL || 'admin',
            discovery: { 
                enabled: process.env.DISCOVERY_ENABLED === 'true', 
                asLocalhost: process.env.AS_LOCAL_HOST === 'true' 
            }
        });

        network = await newGateway.getNetwork(process.env.CHANNEL_NAME || 'registrar-channel');
        contract = network.getContract(process.env.CHAINCODE_NAME || 'registrar-chaincode');
        gateway = newGateway;

        console.log('[SUCCESS] BlockGo Blockchain Bridge is ACTIVE.');
    } catch (error) {
        console.error('[FATAL] Gateway initialization failed:', error.message);
        process.exit(1); 
    }
}

const checkConnectivity = (req, res, next) => {
    if (!contract || !gateway) {
        return res.status(503).json({ 
            error: 'Blockchain Service Unavailable', 
            details: 'The gateway is not connected. Please check logs.' 
        });
    }
    next();
};

app.post('/api/issue-grade', checkConnectivity, async (req, res) => {
    try {
        const data = req.body;
        const gradeAsset = {
            id: String(data.record_id),
            student_hash: data.student_hash,
            subject_code: data.subject_code,
            course: data.subject_name,
            section: data.section,
            grade: data.grade,
            semester: data.semester,
            school_year: data.school_year,
            faculty_id: data.faculty_id,
            date: data.date,
            ipfs_cid: "PENDING",
            status: "Verified"
        };

        await contract.submitTransaction('IssueGrade', JSON.stringify(gradeAsset));

        res.status(200).json({ 
            status: "success", 
            message: "Grade recorded on ledger", 
            txid: data.record_id 
        });
    } catch (error) {
        console.error(`[ERROR] Transaction failed: ${error.message}`);
        res.status(500).json({ error: 'Blockchain rejection', details: error.message });
    }
});

app.get('/api/all-grades', checkConnectivity, async (req, res) => {
    try {
        const result = await contract.evaluateTransaction('GetAllGrades');
        const data = result.toString() ? JSON.parse(result.toString()) : [];
        res.status(200).json(data);
    } catch (error) {
        console.error(`[ERROR] Query failed: ${error.message}`);
        res.status(500).json({ error: 'Ledger query failed', details: error.message });
    }
});

const PORT = 4000;
app.listen(PORT, async () => {
    await initializeGateway();
    console.log(`[INFO] Middleware listening on port ${PORT}`);
});