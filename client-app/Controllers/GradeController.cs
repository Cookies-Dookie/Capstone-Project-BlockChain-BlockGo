using Microsoft.AspNetCore.Mvc;
using BlockGo.Models;
using BlockGo.Services;

namespace BlockGo.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GradesController : ControllerBase
    {
        private readonly IBlockchainService _blockchainService;

        public GradesController(IBlockchainService blockchainService)
        {
            _blockchainService = blockchainService;
        }

        [HttpPost("record")]
        public async Task<IActionResult> RecordGrade([FromBody] GradeRequest request)
        {
            if (request == null)
            {
                return BadRequest("Invalid grade data.");
            }

            try
            {
                var result = await _blockchainService.SubmitGradeAsync(request);

                return Ok(new
                {
                    message = "Blockchain transaction successful!",
                    details = result
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }
        [HttpGet("all")]
        public async Task<IActionResult> GetAllGrades()
        {
            try
            {
                var result = await _blockchainService.GetAllGradesAsync();
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error fetching all records: {ex.Message}");
            }
        }
        [HttpGet("{id}")]
        public async Task<IActionResult> GetGrade(string id)
        {
            try
            {
                var result = await _blockchainService.GetGradeAsync(id);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error retrieving from blockchain: {ex.Message}");
            }
        }
    }
}