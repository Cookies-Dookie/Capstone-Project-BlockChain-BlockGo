const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const credPath = path.join(__dirname, '..', 'network', 'crypto-config', 'peerOrganizations', 'registrar.capstone.com', 'users', 'Admin@registrar.capstone.com', 'msp');

        const certPath = path.join(credPath, 'signcerts', 'Admin@registrar.capstone.com-cert.pem');
        const certificate = fs.readFileSync(certPath).toString();

        const keystorePath = path.join(credPath, 'keystore');
        const files = fs.readdirSync(keystorePath);
        const keyPath = path.join(keystorePath, files[0]);
        const privateKey = fs.readFileSync(keyPath).toString();

        const identity = {
            credentials: {
                certificate,
                privateKey,
            },
            mspId: 'RegistrarMSP',
            type: 'X.509',
        };

        await wallet.put('admin', identity);
        console.log('[SUCCESS] Imported true Cryptogen Admin identity into the wallet!');

    } catch (error) {
        console.error(`[ERROR] Failed to populate wallet: ${error}`);
    }
}

main();