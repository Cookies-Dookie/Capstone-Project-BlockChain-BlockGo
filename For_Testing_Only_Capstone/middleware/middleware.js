const express = require('express');
const bodyParser = require('body-parser');
const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const PORT = 3000;
const CHANNEL_NAME = 'registrar-channel';
const CHAINCODE_NAME = 'registrar'; 
const USER_ID = 'admin'; 

async function connectToNetwork() {
   const ccpPath = path.resolve(__dirname, 'connection-org1.json');
    if (!fs.existsSync(ccpPath)) {
        throw new Error(`Connecti   on profile not found at ${ccpPath}`);
    }
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const identity = await wallet.get(USER_ID);
    if (!identity) {
        throw new Error(`Identity for "${USER_ID}" not found. Please run: node addToWallet.js`);
    }

    const gateway = new Gateway();

    await gateway.connect(ccp, {
        wallet,
        identity: USER_ID,
        discovery: { enabled: false, asLocalhost: true } 
    });

    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME);

    return { gateway, contract };
}

app.get('/api/query/:function', async (req, res) => {
    let gateway;
    try {
        const { gateway: g, contract } = await connectToNetwork();
        gateway = g;

        const args = req.query.args ? [req.query.args] : [];
        
        const result = await contract.evaluateTransaction(req.params.function, ...args);
        console.log(`Query ${req.params.function} successful.`);
        
        res.status(200).json(JSON.parse(result.toString()));
        
    } catch (error) {
        console.error(`Query Failed: ${error}`);
        res.status(500).json({ error: error.message });
    } finally {
        if (gateway) await gateway.disconnect();
    }
});

app.post('/api/invoke', async (req, res) => {
    let gateway;
    try {
        const { fcn, args } = req.body;
        const { gateway: g, contract } = await connectToNetwork();
        gateway = g;

        console.log(`Invoking: ${fcn} with args: ${args}`);
        await contract.submitTransaction(fcn, ...args);
        
        res.status(200).json({ message: `Transaction ${fcn} committed successfully` });

    } catch (error) {
        console.error(`Invoke Failed: ${error}`);
        res.status(500).json({ error: error.message });
    } finally {
        if (gateway) await gateway.disconnect();
    }
});

app.get('/', (req, res) => res.send("Registrar Middleware is running!"));

app.listen(PORT, () => {
    console.log(`Middleware running on http://localhost:${PORT}`);
});