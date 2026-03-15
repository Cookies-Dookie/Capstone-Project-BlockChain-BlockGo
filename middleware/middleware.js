const FabricCAServices = require('fabric-ca-client');
require('dotenv').config();
const express = require('express');
const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
async function getContractForUser(username) {
    if (!username) {
        throw new Error('No identity provided. Transaction requires a valid username/identity.');
    }

    const walletPath = path.resolve(__dirname, process.env.WALLET_PATH || 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const identity = await wallet.get(username);
    if (!identity) {
        throw new Error(`Access Denied: Wallet identity for '${username}' not found. The Registrar must register this user first.`);
    }

    const ccpPath = path.resolve(__dirname, process.env.CONNECTION_PROFILE_PATH || 'connection.json');
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
    if (!ccp.organizations) ccp.organizations = {};
    
    let clientOrg = null;
    for (const [orgName, orgDetails] of Object.entries(ccp.organizations)) {
        if (orgDetails.mspid === identity.mspId) {
            clientOrg = orgName;
            break;
        }
    }
    
    // If connection.json is missing the organization entirely, dynamically inject it so it doesn't crash
    if (!clientOrg) {
        clientOrg = identity.mspId;
        const peerUrl = identity.mspId === 'FacultyMSP' ? 'peer0.faculty.capstone.com' : 
                        identity.mspId === 'DepartmentMSP' ? 'peer0.department.capstone.com' : 
                        'peer0.registrar.capstone.com';
        ccp.organizations[clientOrg] = { mspid: identity.mspId, peers: [peerUrl] };
    }
    
    if (!ccp.client) ccp.client = {};
    ccp.client.organization = clientOrg;

    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet,
        identity: username, 
        discovery: { enabled: false, asLocalhost: true }
    });

    const network = await gateway.getNetwork(process.env.CHANNEL_NAME || 'registrar-channel');
    const contract = network.getContract(process.env.CHAINCODE_NAME || 'registrar');

    return { contract, gateway }; 
}

const getCallerIdentity = (req) => {
    return req.headers['x-user-identity'] || req.body.facultyId || req.body.ApprovedBy || 'admin';
};  
app.post('/api/enroll', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const FabricCAServices = require('fabric-ca-client');
        let caURL, caName, mspId;
        
        if (role === 'faculty') {
            caURL = 'https://localhost:8054';
            caName = 'ca-faculty';
            mspId = 'FacultyMSP';
        } else if (role === 'department_admin') {
            caURL = 'https://localhost:9054'; 
            caName = 'ca-department';
            mspId = 'DepartmentMSP';
        } else {
            caURL = 'https://localhost:7054'; 
            caName = 'ca-registrar';
            mspId = 'RegistrarMSP';
        }

        const ca = new FabricCAServices(caURL, { verify: false }, caName);

        const walletPath = path.resolve(__dirname, process.env.WALLET_PATH || 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        if (await wallet.get(username)) {
            return res.status(200).json({ status: "success", message: "User is already enrolled in the wallet." });
        }

        console.log(`[Enroll] Downloading certificates for ${username} from ${caName}...`);
        const enrollment = await ca.enroll({ enrollmentID: username, enrollmentSecret: password });
        
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: mspId,
            type: 'X.509',
        };
        await wallet.put(username, x509Identity);

        console.log(`[Enroll] Successfully saved ${username} to wallet as ${mspId}!`);
        res.status(200).json({ status: "success", message: `Wallet created for ${username}` });

    } catch (error) {
        console.error('[Enroll] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const wallet = await Wallets.newFileSystemWallet(path.resolve(__dirname, 'wallet'));
        
        let caURL, caName, adminLabel;
        if (role === 'faculty') {
            caURL = 'https://localhost:8054';
            caName = 'ca-faculty';
            adminLabel = 'admin-faculty';
        } else if (role === 'department_admin') {
            caURL = 'https://localhost:9054'; 
            caName = 'ca-department';
            adminLabel = 'admin-department';
        } else {
            caURL = 'https://localhost:7054'; 
            caName = 'ca-registrar';
            adminLabel = 'admin-registrar';
        }
        
        const adminIdentity = await wallet.get(adminLabel);

        if (!adminIdentity) {
            console.error("Identity Guard Failed: Admin wallet missing from /wallet/ directory.");
            return res.status(500).json({ 
                error: "Middleware configuration error", 
                message: `Admin identity '${adminLabel}' not enrolled. Please run enrollAllAdmins.js first.` 
            });
        }

        const ca = new FabricCAServices(caURL, { verify: false }, caName);

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        const secret = await ca.register({
            enrollmentID: username,
            enrollmentSecret: password,
            role: 'client',
            attrs: [
                { name: 'role', value: role, ecert: true },
                { name: 'grade.manage', value: role === 'faculty' ? 'true' : 'false', ecert: true }
            ]
        }, adminUser);

        res.status(201).json({ status: "success", secret });
    } catch (error) { 
        console.error(`[Register] Error:`, error.message);
        res.status(500).json({ error: "Server Exception", details: error.message }); 
    }
});
app.post('/api/revoke', async (req, res) => {
    try {
        const { username, role } = req.body;
        const wallet = await Wallets.newFileSystemWallet(path.resolve(__dirname, 'wallet'));
        
        let caURL, caName, adminLabel;
        if (role === 'faculty') {
            caURL = 'https://localhost:8054';
            caName = 'ca-faculty';
            adminLabel = 'admin-faculty';
        } else if (role === 'department_admin') {
            caURL = 'https://localhost:9054'; 
            caName = 'ca-department';
            adminLabel = 'admin-department';
        } else {
            caURL = 'https://localhost:7054'; 
            caName = 'ca-registrar';
            adminLabel = 'admin-registrar';
        }
        
        const adminIdentity = await wallet.get(adminLabel);

        if (!adminIdentity) {
            console.error("Identity Guard Failed: Admin wallet missing from /wallet/ directory.");
            return res.status(500).json({ 
                error: "Middleware configuration error", 
                message: `Admin identity '${adminLabel}' not enrolled. Please run enrollAllAdmins.js first.` 
            });
        }

        // 🛡️ Identity Guard: Check if the user's wallet exists before revoking
        const userIdentity = await wallet.get(username);
        if (!userIdentity) {
            return res.status(404).json({
                error: "Identity Mismatch",
                message: `Wallet for user ${username} does not exist.`
            });
        }

        const ca = new FabricCAServices(caURL, { verify: false }, caName);

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        await ca.revoke({ enrollmentID: username, reason: "Revoked by admin" }, adminUser);
        if (await wallet.get(username)) await wallet.remove(username);

        res.status(200).json({ status: "success", message: `Revoked ${username}` });
    } catch (error) { 
        console.error(`[Revoke] Error:`, error.message);
        res.status(500).json({ error: "Server Exception", details: error.message }); 
    }
});
app.get('/api/all-grades', async (req, res) => {
    let gateway;
    try {
        const username = getCallerIdentity(req);
        const { contract, gateway: gw } = await getContractForUser(username);
        gateway = gw;

        console.log(`[GetAllGrades] Querying as ${username}...`);
        const result = await contract.evaluateTransaction('GetAllGrades');
        
        try {
            const grades = JSON.parse(result.toString());
            res.status(200).json({ status: 'success', data: grades });
        } catch (e) {
            res.status(200).json({ status: 'success', data: result.toString() });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (gateway) gateway.disconnect();
    }
});
app.post('/api/issue-grade', async (req, res) => {
    let gateway;
    try {
        const username = getCallerIdentity(req);
        const { contract, gateway: gw } = await getContractForUser(username);
        gateway = gw;

        const gradeAsset = JSON.stringify(req.body);
        console.log(`[IssueGrade] Submitting as ${username}... Payload: ${gradeAsset}`);
        
        const result = await contract.submitTransaction('IssueGrade', gradeAsset);
        res.status(201).json({ status: "success", message: "Grade recorded", details: result.toString() });
    } catch (error) {
        console.error('[IssueGrade] Error:', error.message);
        res.status(500).json({ error: error.message });
    } finally {
        if (gateway) gateway.disconnect();
    }
});
app.get('/api/get-grade/:id', async (req, res) => {
    let gateway;
    try {
        const username = getCallerIdentity(req);
        const { contract, gateway: gw } = await getContractForUser(username);
        gateway = gw;

        console.log(`[ReadGrade] Fetching ${req.params.id} as ${username}...`);
        const result = await contract.evaluateTransaction('ReadGrade', req.params.id);
        
        res.status(200).json(JSON.parse(result.toString()));
    } catch (error) {
        res.status(404).json({ error: "Record not found" });
    } finally {
        if (gateway) gateway.disconnect();
    }
});
app.post('/api/update-grade', async (req, res) => {
    let gateway;
    try {
        const username = getCallerIdentity(req);
        const { contract, gateway: gw } = await getContractForUser(username);
        gateway = gw;

        const gradeAsset = JSON.stringify(req.body);
        console.log(`[UpdateGrade] Updating as ${username}`);
        
        await contract.submitTransaction('UpdateGrade', gradeAsset);
        res.status(200).json({ status: "success", message: "Grade updated" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (gateway) gateway.disconnect();
    }
});
app.post('/api/approve-grade/:id', async (req, res) => {
    let gateway;
    try {
        const username = getCallerIdentity(req);
        const { contract, gateway: gw } = await getContractForUser(username);
        gateway = gw;

        await contract.submitTransaction('ApproveGrade', req.params.id);
        res.status(200).json({ status: "success", message: "Grade approved" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (gateway) gateway.disconnect();
    }
});
app.post('/api/finalize-grade/:id', async (req, res) => {
    let gateway;
    try {
        const username = getCallerIdentity(req);
        const { contract, gateway: gw } = await getContractForUser(username);
        gateway = gw;

        await contract.submitTransaction('FinalizeRecord', req.params.id);
        res.status(200).json({ status: "success", message: "Record finalized" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (gateway) gateway.disconnect();
    }
});
app.delete('/api/wallet/:username', async (req, res) => {
    try {
        const walletPath = path.resolve(__dirname, process.env.WALLET_PATH || 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        
        const exists = await wallet.get(req.params.username);
        if (exists) {
            await wallet.remove(req.params.username);
            return res.status(200).json({ status: "success", message: "Wallet identity deleted." });
        }
        res.status(404).json({ status: "error", message: "Identity not found in wallet." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/health', (req, res) => res.status(200).json({ status: "operational", mode: 'Production Security (ABAC ACTIVE)' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`\nMiddleware online on port ${PORT}`);
    console.log(`Mode: Production Security (ABAC ACTIVE)`);
    console.log(` Dynamic Identity Loading: Enabled\n`);
});