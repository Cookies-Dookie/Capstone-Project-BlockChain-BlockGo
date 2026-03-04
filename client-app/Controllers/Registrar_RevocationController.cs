using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Client_app.Services;
using Client_app.Models;
using For_Testing_Only_Capstone.Models;

namespace Client_app.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class Registrar_RevocationController : ControllerBase
    {
        private readonly RegistrarDbContext _context;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IFabricCaAuthService _fabricCaAuthService;
        private readonly IConfiguration _configuration; 

        public Registrar_RevocationController(RegistrarDbContext context, IHttpClientFactory httpClientFactory, IFabricCaAuthService fabricCaAuthService, IConfiguration configuration)
        {
            _context = context;
            _httpClientFactory = httpClientFactory;
            _fabricCaAuthService = fabricCaAuthService;
            _configuration = configuration;
        }

        [HttpPost("revoke/{username}")]
        public async Task<IActionResult> RevokeAccess(string username)
        {
            try
            {
                using var httpClient = _httpClientFactory.CreateClient("FabricCAClient");

                var revokePayload = new { id = username };
                string revokeJson = JsonSerializer.Serialize(revokePayload);
                string revokeToken = _fabricCaAuthService.GenerateAuthToken("POST", "/api/v1/revoke", revokeJson);

                var caBaseUrl = _configuration["FabricCA:Url"];
                var revokeMessage = new HttpRequestMessage(HttpMethod.Post, $"{caBaseUrl}/api/v1/revoke")
                {
                    Content = new StringContent(revokeJson, Encoding.UTF8, "application/json")
                };
                revokeMessage.Headers.TryAddWithoutValidation("Authorization", revokeToken);

                var revokeResponse = await httpClient.SendAsync(revokeMessage);
                if (!revokeResponse.IsSuccessStatusCode)
                {
                    var err = await revokeResponse.Content.ReadAsStringAsync();
                    return StatusCode((int)revokeResponse.StatusCode, new { status = "Error", message = $"Revocation failed: {err}" });
                }

                var crlPayload = new { };
                string crlJson = JsonSerializer.Serialize(crlPayload);
                string crlToken = _fabricCaAuthService.GenerateAuthToken("POST", "/api/v1/gencrl", crlJson);

                var crlMessage = new HttpRequestMessage(HttpMethod.Post, $"{caBaseUrl}/api/v1/gencrl")
                {
                    Content = new StringContent(crlJson, Encoding.UTF8, "application/json")
                };
                crlMessage.Headers.TryAddWithoutValidation("Authorization", crlToken);
                await httpClient.SendAsync(crlMessage);

                var sqlUser = await _context.Userrequests.FirstOrDefaultAsync(u => u.Email == username);
                if (sqlUser != null)
                {
                    sqlUser.Requeststatus = "REVOKED";
                    await _context.SaveChangesAsync();
                }

                return Ok(new { status = "Success", message = $"Access for '{username}' has been revoked and the Certificate Revocation List (CRL) has been updated." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { status = "Error", message = ex.Message });
            }
        }
    }
}