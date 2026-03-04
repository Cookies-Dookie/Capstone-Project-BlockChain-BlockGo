using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace Client_app.Services
{
    public class FabricCaAuthService : IFabricCaAuthService
    {
        private readonly string _adminCertPath;
        private readonly string _adminKeystoreDir;

        public FabricCaAuthService(IConfiguration configuration)
        {
            _adminCertPath = configuration["FabricCA:AdminCertPath"] 
                ?? throw new InvalidOperationException("Fabric CA AdminCertPath is not configured in appsettings.");
            _adminKeystoreDir = configuration["FabricCA:AdminKeystoreDir"] 
                ?? throw new InvalidOperationException("Fabric CA AdminKeystoreDir is not configured in appsettings.");
        }

        public string GenerateAuthToken(string method, string uri, string body)
        {
            string currentKeyPath = GetLatestAdminKeyPath(_adminKeystoreDir);

            string certPem = File.ReadAllText(_adminCertPath);
            string b64Cert = Convert.ToBase64String(Encoding.UTF8.GetBytes(certPem));
            string b64Uri = Convert.ToBase64String(Encoding.UTF8.GetBytes(uri));
            string b64Body = Convert.ToBase64String(Encoding.UTF8.GetBytes(body));

            string payloadToSign = $"{method}.{b64Uri}.{b64Body}.{b64Cert}";
            byte[] payloadBytes = Encoding.UTF8.GetBytes(payloadToSign);

            using var ecdsa = ECDsa.Create();
            ecdsa.ImportFromPem(File.ReadAllText(currentKeyPath));

            byte[] signatureBytes;
            do
            {
                signatureBytes = ecdsa.SignData(payloadBytes, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence);
            } while (signatureBytes.Length > 70); // LOW-S Fix for Fabric CA

            return $"{b64Cert}.{Convert.ToBase64String(signatureBytes)}";
        }

        private string GetLatestAdminKeyPath(string keystoreDirectory)
        {
            if (!Directory.Exists(keystoreDirectory))
            {
                throw new DirectoryNotFoundException($"Keystore directory not found: {keystoreDirectory}");
            }
            var files = Directory.GetFiles(keystoreDirectory);
            var keyFile = files.FirstOrDefault(f => f.EndsWith("_sk"));
            if (string.IsNullOrEmpty(keyFile))
                throw new FileNotFoundException($"No private key ('_sk' file) found in the directory: {keystoreDirectory}");
            return keyFile;
        }
    }
}