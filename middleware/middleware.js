const express = require('express');
const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const app = express();
app.use(express.json());

async function getContractInstance() {
    const walletPath = path.join(__dirname, 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    const connectionProfilePath = path.join(__dirname, 'connection.yaml');
    const connectionProfile = yaml.load(fs.readFileSync(connectionProfilePath, 'utf8'));

    const gateway = new Gateway();
    await gateway.connect(connectionProfile, {
        wallet,
        identity: 'admin',
        discovery: { enabled: false, asLocalhost: true }
    });

    const network = await gateway.getNetwork('registrar-channel');
    return { contract: network.getContract('registrar-chaincode'), gateway };
}

app.post('/api/record-grade', async (req, res) => {
    const { gateway, contract } = await getContractInstance();
    try {
        const gradeData = req.body;
        const ipfsCid = "QmBlockGoTestCID123456789";

        const result = await contract.submitTransaction(
            'RecordGrade',
            gradeData.record_id,
            gradeData.student_hash,
            gradeData.subject_code,
            gradeData.subject_name,
            gradeData.section,
            gradeData.grade,
            gradeData.semester,
            gradeData.school_year,
            gradeData.faculty_id,
            gradeData.date
        );

        res.json({
            status: "SUCCESS",
            ipfs_cid: ipfsCid,
            blockchain_result: result.toString() || "Success",
            message: "Grade securely recorded on BlockGo."
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        await gateway.disconnect();
    }
});

app.get('/api/get-grade/:id', async (req, res) => {
    const { gateway, contract } = await getContractInstance();
    try {
        const recordId = req.params.id;
        
        const result = await contract.evaluateTransaction('ReadGrade', recordId);
        
        res.json(JSON.parse(result.toString()));
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        await gateway.disconnect();
    }
});
app.get('/api/all-grades', async (req, res) => {
    const { gateway, contract } = await getContractInstance();
    try {
        const result = await contract.evaluateTransaction('GetAllGrades');        
        res.json(JSON.parse(result.toString()));
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        await gateway.disconnect();
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`BlockGo Web3 Middleware running on port ${PORT}`);
});