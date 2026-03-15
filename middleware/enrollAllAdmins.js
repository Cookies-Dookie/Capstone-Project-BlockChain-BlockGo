const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const path = require('path');

async function main() {
    try {
        const walletPath = path.resolve(__dirname, 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // 1. Enroll Registrar Admin
        const caRegistrar = new FabricCAServices('https://localhost:7054', { verify: false }, 'ca-registrar');
        const enrollmentReq = await caRegistrar.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
        await wallet.put('admin-registrar', {
            credentials: { certificate: enrollmentReq.certificate, privateKey: enrollmentReq.key.toBytes() },
            mspId: 'RegistrarMSP',
            type: 'X.509',
        });
        console.log('✓ Successfully enrolled admin-registrar (Port 7054)');

        // 2. Enroll Faculty Admin
        const caFaculty = new FabricCAServices('https://localhost:8054', { verify: false }, 'ca-faculty');
        const enrollmentFac = await caFaculty.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
        await wallet.put('admin-faculty', {
            credentials: { certificate: enrollmentFac.certificate, privateKey: enrollmentFac.key.toBytes() },
            mspId: 'FacultyMSP',
            type: 'X.509',
        });
        console.log('✓ Successfully enrolled admin-faculty (Port 8054)');

        // 3. Enroll Department Admin
        const caDept = new FabricCAServices('https://localhost:9054', { verify: false }, 'ca-department');
        const enrollmentDept = await caDept.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
        await wallet.put('admin-department', {
            credentials: { certificate: enrollmentDept.certificate, privateKey: enrollmentDept.key.toBytes() },
            mspId: 'DepartmentMSP',
            type: 'X.509',
        });
        console.log('✓ Successfully enrolled admin-department (Port 9054)');

    } catch (error) {
        console.error(`Failed to enroll admins: ${error}`);
    }
}
main();