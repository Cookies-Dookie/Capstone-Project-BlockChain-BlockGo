using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System;

namespace Client_app.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class Registrar_RevocationController : ControllerBase
    {
        private readonly string _caRevokeUrl = "https://localhost:7054/api/v1/revoke";
        private readonly string _caGenCrlUrl = "https://localhost:7054/api/v1/gencrl";

        private readonly string _adminCertPath = @"C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\network\fabric-ca\registrar\admin-msp\signcerts\cert.pem";
        private readonly string _adminKeyPath = @"C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\network\fabric-ca\registrar\admin-msp\keystore\bb3ded1031475bb0f2e6eaa3926fc4401022dd674f2a5d21b92b4f5eb677d1db_sk";

        [HttpPost("revoke/{username}")]
        public async Task<IActionResult> RevokeAccess(string username)
        {
            try
            {
                var handler = new HttpClientHandler
                {
                    ServerCertificateCustomValidationCallback = (sender, cert, chain, sslPolicyErrors) => true
                };
                using var httpClient = new HttpClient(handler);

                var revokePayload = new { id = username };
                string revokeJson = JsonSerializer.Serialize(revokePayload);

                string revokeToken = GenerateFabricCaToken("POST", "/api/v1/revoke", revokeJson, _adminCertPath, _adminKeyPath);

                var revokeMessage = new HttpRequestMessage(HttpMethod.Post, _caRevokeUrl)
                {
                    Content = new StringContent(revokeJson, Encoding.UTF8, "application/json")
                };
                revokeMessage.Headers.TryAddWithoutValidation("Authorization", revokeToken);

                var revokeResponse = await httpClient.SendAsync(revokeMessage);

                if (!revokeResponse.IsSuccessStatusCode)
                {
                    string err = await revokeResponse.Content.ReadAsStringAsync();
                    return StatusCode((int)revokeResponse.StatusCode, new { status = "Error", message = $"Revocation failed: {err}" });
                }

                var crlPayload = new { };
                string crlJson = JsonSerializer.Serialize(crlPayload);
                string crlToken = GenerateFabricCaToken("POST", "/api/v1/gencrl", crlJson, _adminCertPath, _adminKeyPath);

                var crlMessage = new HttpRequestMessage(HttpMethod.Post, _caGenCrlUrl)
                {
                    Content = new StringContent(crlJson, Encoding.UTF8, "application/json")
                };
                crlMessage.Headers.TryAddWithoutValidation("Authorization", crlToken);

                var crlResponse = await httpClient.SendAsync(crlMessage);

                return Ok(new { status = "Success", message = $"Access for {username} revoked and CRL updated via REST." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { status = "Error", message = ex.Message });
            }
        }

        private string GenerateFabricCaToken(string method, string uri, string body, string certPath, string keyPath)
        {
            string certPem = System.IO.File.ReadAllText(certPath);
            string b64Cert = Convert.ToBase64String(Encoding.UTF8.GetBytes(certPem));

            string b64Uri = Convert.ToBase64String(Encoding.UTF8.GetBytes(uri));
            string b64Body = Convert.ToBase64String(Encoding.UTF8.GetBytes(body));

            string payloadToSign = $"{method}.{b64Uri}.{b64Body}.{b64Cert}";
            byte[] payloadBytes = Encoding.UTF8.GetBytes(payloadToSign);

            string privateKeyPem = System.IO.File.ReadAllText(keyPath);
            using var ecdsa = ECDsa.Create();
            ecdsa.ImportFromPem(privateKeyPem);

            byte[] signatureBytes = ecdsa.SignData(payloadBytes, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence);
            string b64Signature = Convert.ToBase64String(signatureBytes);

            return $"{b64Cert}.{b64Signature}";
        }
    }
}