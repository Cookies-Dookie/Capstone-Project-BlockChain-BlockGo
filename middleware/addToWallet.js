const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

const DEFAULT_AFFILIATION = 'org1.department1';

async function main() {
    try {
        const isRegisteringNewUser = process.argv[2] === '--register';
        const newUsername = process.argv[3];
        const newUserRole = process.argv[4];
        const newUserAffiliation = process.argv[5] || DEFAULT_AFFILIATION;

        if (isRegisteringNewUser && (!newUsername || !newUserRole)) {
            console.error('Error: To register a new user, a username and role are required.');
            printUsage();
            process.exit(1);
        }

        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Using wallet at: ${walletPath}`);

        const ccpPath = path.resolve(__dirname, '..', 'network', 'connection.json');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
        
        const caInfo = ccp.certificateAuthorities['ca.registrar.capstone.com'];
        if (!caInfo) {
            throw new Error("CA 'ca-registrar' not found in connection profile. Please check your connection.json file.");
        }

        const caTLSCACerts = fs.readFileSync(path.resolve(__dirname, '..', 'network', caInfo.tlsCACerts.path));
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);


        let caAdminIdentity = await wallet.get('ca-admin');
        if (!caAdminIdentity) {
            console.log('Enrolling the CA administrator ("ca-admin")...');
            const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
            const x509Identity = {
                credentials: { certificate: enrollment.certificate, privateKey: enrollment.key.toBytes() },
                mspId: 'RegistrarMSP',
                type: 'X.509',
            };
            await wallet.put('ca-admin', x509Identity);
            console.log('Successfully enrolled CA administrator "ca-admin" and imported it into the wallet.');
            caAdminIdentity = await wallet.get('ca-admin');
        }

        const provider = wallet.getProviderRegistry().getProvider(caAdminIdentity.type);
        const adminUser = await provider.getUserContext(caAdminIdentity, 'ca-admin');

        if (isRegisteringNewUser) {
            const userIdentity = await wallet.get(newUsername);
            if (userIdentity) {
                console.log(`An identity for the user "${newUsername}" already exists in the wallet`);
                return;
            }
            console.log(`Registering user "${newUsername}" with role "${newUserRole}"...`);
            const secret = await ca.register({ affiliation: newUserAffiliation, enrollmentID: newUsername, role: 'client', attrs: [{ name: 'role', value: newUserRole, ecert: true }] }, adminUser);
            const enrollment = await ca.enroll({ enrollmentID: newUsername, enrollmentSecret: secret });
            const x509Identity = { credentials: { certificate: enrollment.certificate, privateKey: enrollment.key.toBytes() }, mspId: 'RegistrarMSP', type: 'X.509' };
            await wallet.put(newUsername, x509Identity);
            console.log(`Successfully registered and enrolled user "${newUsername}" and imported it into the wallet.`);
        } else {
            const appAdminIdentity = await wallet.get('admin');
            if (appAdminIdentity) {
                console.log('An identity for the application admin user ("admin") already exists in the wallet.');
                return;
            }
            console.log('Attempting to enroll admin user "admin"...');
            
            try {
                // First, try to enroll the admin user. If it exists, this will succeed.
                const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
                const x509Identity = { credentials: { certificate: enrollment.certificate, privateKey: enrollment.key.toBytes() }, mspId: 'RegistrarMSP', type: 'X.509' };
                await wallet.put('admin', x509Identity);
                console.log('Successfully enrolled admin user "admin" and imported it into the wallet.');
            } catch (error) {
                // If enrollment fails, it's likely because the user isn't registered. So, register and then enroll.
                console.log('Admin user not found, registering a new one...');
                const secret = await ca.register({ affiliation: DEFAULT_AFFILIATION, enrollmentID: 'admin', role: 'client', attrs: [{ name: 'role', value: 'faculty', ecert: true }] }, adminUser);
                const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: secret });
                const x509Identity = { credentials: { certificate: enrollment.certificate, privateKey: enrollment.key.toBytes() }, mspId: 'RegistrarMSP', type: 'X.509' };
                await wallet.put('admin', x509Identity);
                console.log('Successfully registered and enrolled admin user "admin" and imported it into the wallet.');
            }
        }

    } catch (error) {
        console.error(`FAILED to run the addToWallet script: ${error.stack || error}`);
        process.exit(1);
    }
}

function printUsage() {
    console.log('\nUsage:');
    console.log('  To setup the default admin for the middleware: node addToWallet.js');
    console.log('  To register a new user:                      node addToWallet.js --register <username> <role> [affiliation]');
    console.log('\nExamples:');
    console.log('  node addToWallet.js --register professor.smith faculty');
    console.log('  node addToWallet.js --register student.jones student org1.department2');
}

main();