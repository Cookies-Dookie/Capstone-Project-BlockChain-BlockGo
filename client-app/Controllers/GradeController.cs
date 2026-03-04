using Microsoft.AspNetCore.Mvc;
using BlockGo.Models;
using BlockGo.Services;
using Client_app.Models; 
using System;
using System.Threading.Tasks;
using For_Testing_Only_Capstone.Models;
using System.Text.Json;
using System.Collections.Generic;

namespace BlockGo.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GradesController : ControllerBase
    {
        private readonly IBlockchainService _blockchainService;
        private readonly RegistrarDbContext _context; 

       public GradesController(IBlockchainService blockchainService, RegistrarDbContext context)
        {
            _blockchainService = blockchainService;
            _context = context;
        }
        [HttpPost("record")]
        public async Task<IActionResult> RecordGrade([FromBody] GradeRequest request)
        {
            if (request == null) return BadRequest("Invalid grade data.");

            try
            {
                var result = await _blockchainService.SubmitGradeAsync(request);
                return Ok(new { message = "Blockchain transaction successful!", details = result });
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
                var jsonResult = await _blockchainService.GetAllGradesAsync();
                var grades = JsonSerializer.Deserialize<List<AcademicRecord>>(jsonResult, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                return Ok(grades);
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
                var jsonResult = await _blockchainService.GetGradeAsync(id);
                var grade = JsonSerializer.Deserialize<AcademicRecord>(jsonResult, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                return Ok(grade);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error retrieving from blockchain: {ex.Message}");
            }
        }
        
        public class GradeCorrectionRequest
        {
            public string RecordID { get; set; }  
            public string OldGrade { get; set; }
            public string NewGrade { get; set; }
            public string ReasonText { get; set; } 
            public string ApprovedBy { get; set; } 
        }

    [HttpPost("correct")]
    public async Task<IActionResult> CorrectGrade([FromBody] GradeCorrectionRequest correction)
    {
    try
    {
        var auditLog = new Gradecorrectionlog
        {
            Recordid = correction.RecordID,
            Oldgrade = correction.OldGrade,
            Newgrade = correction.NewGrade,
            Reasontext = correction.ReasonText,
            Approvedby = correction.ApprovedBy,
            Timestamp = DateTime.UtcNow
        };

        _context.Gradecorrectionlogs.Add(auditLog);
        await _context.SaveChangesAsync();

        string existingGradeJson = await _blockchainService.GetGradeAsync(correction.RecordID);

        // Deserialize into the full AcademicRecord to preserve all existing fields.
        var gradeToUpdate = JsonSerializer.Deserialize<AcademicRecord>(existingGradeJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (gradeToUpdate == null)
        {
            return NotFound(new { status = "Error", message = "Original grade record not found on the blockchain." });
        }

        gradeToUpdate.Grade = correction.NewGrade;      // Update the grade
        gradeToUpdate.FacultyId = correction.ApprovedBy; // Log who approved the correction
        gradeToUpdate.Date = DateTime.UtcNow.ToString("yyyy-MM-dd"); // Set the correction date
        
        var result = await _blockchainService.UpdateGradeAsync(gradeToUpdate); // Pass the entire updated object

        return Ok(new 
        { 
            status = "Success", 
            message = "Grade correction logged securely in SQL Audit Trail and updated on the Blockchain.",
            blockchainDetails = result
        });
    }
    catch (Exception ex)
    {
        return StatusCode(500, new { status = "Error", message = ex.Message });
    }
    }
    }
}