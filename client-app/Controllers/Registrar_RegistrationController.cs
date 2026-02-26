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
    public class Registrar_RegistrationController : ControllerBase
    {
        private readonly string _caUrl = "https://localhost:7054/api/v1/register";
        private readonly string _adminCertPath = @"C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\network\fabric-ca\registrar\admin-msp\signcerts\cert.pem";
        private readonly string _adminKeyPath = @"C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\network\fabric-ca\registrar\admin-msp\keystore\bb3ded1031475bb0f2e6eaa3926fc4401022dd674f2a5d21b92b4f5eb677d1db_sk";
        public class RegistrationRequest
        {
            public string Username { get; set; }
            public string Password { get; set; }
            public string Role { get; set; }
        }

        [HttpPost("grant")]
        public async Task<IActionResult> GrantAccess([FromBody] RegistrationRequest request)
        {
            try
            {
                if (!System.IO.File.Exists(_adminCertPath))
                {
                    return StatusCode(500, new { status = "Error", message = $"Cannot find certificate at: {_adminCertPath}" });
                }
                if (!System.IO.File.Exists(_adminKeyPath))
                {
                    return StatusCode(500, new { status = "Error", message = $"Cannot find private key at: {_adminKeyPath}" });
                }

                var attributes = request.Role.ToLower() == "prof"
                    ? new[] { new { name = "role", value = "faculty", ecert = true } }
                    : new[] { new { name = "role", value = "admin", ecert = true } };

                var payloadObj = new
                {
                    id = request.Username,
                    secret = request.Password,
                    type = "client",
                    attrs = attributes
                };

                string jsonBody = JsonSerializer.Serialize(payloadObj);
                string authToken = GenerateFabricCaToken("POST", "/api/v1/register", jsonBody, _adminCertPath, _adminKeyPath);

                var handler = new HttpClientHandler
                {
                    ServerCertificateCustomValidationCallback = (sender, cert, chain, sslPolicyErrors) => true
                };

                using var httpClient = new HttpClient(handler);

                var requestMessage = new HttpRequestMessage(HttpMethod.Post, _caUrl)
                {
                    Content = new StringContent(jsonBody, Encoding.UTF8, "application/json")
                };

                requestMessage.Headers.TryAddWithoutValidation("Authorization", authToken);

                var response = await httpClient.SendAsync(requestMessage);

                if (response.IsSuccessStatusCode)
                {
                    return Ok(new { status = "Success", message = $"Account {request.Username} registered natively via REST." });
                }

                string errorContent = await response.Content.ReadAsStringAsync();
                return StatusCode((int)response.StatusCode, new { status = "Error", message = errorContent });
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