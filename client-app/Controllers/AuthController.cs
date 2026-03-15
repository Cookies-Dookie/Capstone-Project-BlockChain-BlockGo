using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System;
using System.Threading.Tasks;

namespace Client_app.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly string _connectionString;

        public AuthController(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("PostgresConnection") 
                ?? "Host=127.0.0.1;Database=ActivityLogs;Username=BLOCKGO;Password=PLVBLOCKGO";
        }

        public class SignupRequest
        {
            public string FullName { get; set; }
            public string Email { get; set; }
            public string Password { get; set; }
            public string Role { get; set; }
            public string Department { get; set; }
        }

        [HttpPost("request")]
        public async Task<IActionResult> RequestAccess([FromBody] SignupRequest request)
        {
            try
            {
                using var conn = new NpgsqlConnection(_connectionString);
                await conn.OpenAsync();

                var cmd = new NpgsqlCommand(
                    "INSERT INTO userrequests (fullname, email, role, department, requeststatus, createdat) VALUES (@name, @email, @role, @dept, 'PENDING', CURRENT_TIMESTAMP)", conn);
                
                cmd.Parameters.AddWithValue("name", request.FullName);
                cmd.Parameters.AddWithValue("email", request.Email);
                cmd.Parameters.AddWithValue("role", request.Role); // 'student' or 'faculty'
                cmd.Parameters.AddWithValue("dept", request.Department);

                await cmd.ExecuteNonQueryAsync();

                return Ok(new { status = "Success", message = "Registration request added to waitlist." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { status = "Error", message = ex.Message });
            }
        }
    }
}