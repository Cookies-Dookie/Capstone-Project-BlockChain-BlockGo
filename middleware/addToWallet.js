const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    const cryptoPath = path.resolve(__dirname, '..', 'network', 'crypto-config', 'peerOrganizations', 'registrar.capstone.com');
    
    const certPath = path.join(cryptoPath, 'users', 'Admin@registrar.capstone.com', 'msp', 'signcerts', 'Admin@registrar.capstone.com-cert.pem');
    const keyDirectory = path.join(cryptoPath, 'users', 'Admin@registrar.capstone.com', 'msp', 'keystore');
    
    if (!fs.existsSync(certPath)) {
        console.error(`ERROR: Certificate not found at: ${certPath}`);
        return;
    }

    const keyFiles = fs.readdirSync(keyDirectory);
    const privateKeyPath = path.join(keyDirectory, keyFiles.filter(f => f.endsWith('_sk'))[0] || keyFiles[0]);

    const certificate = fs.readFileSync(certPath).toString();
    const privateKey = fs.readFileSync(privateKeyPath).toString();

    const identity = {
        credentials: {
            certificate: certificate,
            privateKey: privateKey,
        },
        mspId: 'RegistrarMSP', 
        type: 'X.509',
    };

    await wallet.put('admin', identity);
    console.log('Successfully imported "admin" identity for RegistrarMSP into the BlockGo wallet.');
}

main().catch(console.error);