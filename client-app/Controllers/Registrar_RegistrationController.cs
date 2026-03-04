using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Client_app.Services;
using System.Linq;
using Client_app.Models;
using For_Testing_Only_Capstone.Models;

namespace Client_app.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class Registrar_RegistrationController : ControllerBase
    {
        private readonly RegistrarDbContext _context;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IFabricCaAuthService _fabricCaAuthService;
        private readonly IConfiguration _configuration; 

        public Registrar_RegistrationController(
            RegistrarDbContext context,
            IHttpClientFactory httpClientFactory,
            IFabricCaAuthService fabricCaAuthService,
            IConfiguration configuration)
        {
            _context = context;
            _httpClientFactory = httpClientFactory;
            _fabricCaAuthService = fabricCaAuthService;
            _configuration = configuration;
        }

        public class RegistrationRequest
        {
            public string Username { get; set; }
            public string Password { get; set; }
            public string Role { get; set; }
        }

        [HttpPost("grant/{sqlRequestId}")]
        public async Task<IActionResult> GrantAccess(int sqlRequestId, [FromBody] RegistrationRequest request)
        {
            try
            {
                var sqlRecord = await _context.Userrequests.FindAsync(sqlRequestId);
                if (sqlRecord == null) return NotFound(new { status = "Error", message = "Request ID not found." });

                if (sqlRecord.Requeststatus != "PENDING")
                {
                    return BadRequest(new { status = "Error", message = $"Request is already in '{sqlRecord.Requeststatus}' state." });
                }

                string fabricRole;
                switch (request.Role.ToLower())
                {
                    case "prof":
                        fabricRole = "faculty";
                        break;
                    case "registrar":
                        fabricRole = "registrar";
                        break;
                    default:
                        fabricRole = "student";
                        break;
                }
                var attributes = new[] { new { name = "role", value = fabricRole, ecert = true } };

                var payloadObj = new { id = request.Username, secret = request.Password, type = "client", affiliation = "org1.department1", attrs = attributes };
                string jsonBody = JsonSerializer.Serialize(payloadObj);
                
                string authToken = _fabricCaAuthService.GenerateAuthToken("POST", "/api/v1/register", jsonBody);

                var caBaseUrl = _configuration["FabricCA:Url"];
                using var httpClient = _httpClientFactory.CreateClient("FabricCAClient"); 
                var requestMessage = new HttpRequestMessage(HttpMethod.Post, $"{caBaseUrl}/api/v1/register")
                {
                    Content = new StringContent(jsonBody, Encoding.UTF8, "application/json")
                };
                requestMessage.Headers.TryAddWithoutValidation("Authorization", authToken);

                var response = await httpClient.SendAsync(requestMessage);

                if (response.IsSuccessStatusCode)
                {
                    sqlRecord.Requeststatus = "APPROVED";
                    await _context.SaveChangesAsync();
                    return Ok(new { status = "Success", message = $"Account {request.Username} secured on Blockchain." });
                }

                return StatusCode((int)response.StatusCode, new { status = "Error", message = await response.Content.ReadAsStringAsync() });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { status = "Error", message = ex.Message });
            }
        }
    }
}