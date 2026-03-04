const { Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const fs = require('fs');

async function main() {
    try {
        const ccpPath = path.resolve(__dirname, '..', 'network', 'connection.json');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        const caInfo = ccp.certificateAuthorities['ca.registrar.capstone.com'];
        const ca = new FabricCAServices(caInfo.url);

        const walletPath = path.resolve(__dirname, 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'RegistrarMSP',
            type: 'X.509',
        };
        await wallet.put('admin', x509Identity);

        const adminIdentity = await wallet.get('admin');
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        const secret = await ca.register({
            affiliation: 'org1.department1',
            enrollmentID: 'teacher1',
            role: 'client',
            attrs: [{ name: 'role', value: 'faculty', ecert: true }] 
        }, adminUser);

        const enrollmentTeacher = await ca.enroll({
            enrollmentID: 'teacher1',
            enrollmentSecret: secret
        });

        const teacherIdentity = {
            credentials: {
                certificate: enrollmentTeacher.certificate,
                privateKey: enrollmentTeacher.key.toBytes(),
            },
            mspId: 'RegistrarMSP',
            type: 'X.509',
        };
        await wallet.put('teacher1', teacherIdentity);

        console.log('[SUCCESS] teacher1 enrolled with role: faculty');
    } catch (error) {
        console.error(`[ERROR]: ${error}`);
    }
}
main();