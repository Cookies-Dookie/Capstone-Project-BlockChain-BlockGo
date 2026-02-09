const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    console.log(`Wallet path: ${walletPath}`);

    const cryptoPath = path.resolve(__dirname, '..', 'network', 'crypto-config', 'peerOrganizations', 'registrar.capstone.com');
    
    const certPath = path.join(cryptoPath, 'users', 'Admin@registrar.capstone.com', 'msp', 'signcerts', 'Admin@registrar.capstone.com-cert.pem');
    const keyDirectory = path.join(cryptoPath, 'users', 'Admin@registrar.capstone.com', 'msp', 'keystore');
    
    if (!fs.existsSync(certPath)) {
        console.error(`ERROR: Cannot find certificate at: ${certPath}`);
        console.error("Double check: Did you run 'cryptogen' inside the 'network' folder?");
        return;
    }

    const keyFiles = fs.readdirSync(keyDirectory);
    const keyPath = path.join(keyDirectory, keyFiles[0]); 

    const certificate = fs.readFileSync(certPath).toString();
    const privateKey = fs.readFileSync(keyPath).toString();

    const identity = {
        credentials: {
            certificate: certificate,
            privateKey: privateKey,
        },
        mspId: 'Org1MSP',
        type: 'X.509',
    };

    await wallet.put('admin', identity);
    console.log('Successfully created wallet and imported "admin" identity.');
}

main().catch(console.error);