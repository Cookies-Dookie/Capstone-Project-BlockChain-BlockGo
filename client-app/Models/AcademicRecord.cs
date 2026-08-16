using System.Linq;
using System.Text.Json.Serialization;

namespace BlockGo.Models
{
    public class AcademicRecord
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("student_hash")]
        public string StudentHash { get; set; } = string.Empty;

        [JsonPropertyName("student_no")]
        public string StudentNo { get; set; } = string.Empty;

        [JsonPropertyName("student_name")]
        public string StudentName { get; set; } = string.Empty;

        [JsonPropertyName("section")]
        public string Section { get; set; } = string.Empty;

        [JsonPropertyName("year_level")]
        public string YearLevel { get; set; } = string.Empty;

        [JsonPropertyName("course")]
        public string Course { get; set; } = string.Empty;

        [JsonPropertyName("subject_code")]
        public string SubjectCode { get; set; } = string.Empty;

        [JsonPropertyName("grade")]
        public string Grade { get; set; } = string.Empty;

        [JsonPropertyName("semester")]
        public string Semester { get; set; } = string.Empty;

        [JsonPropertyName("school_year")]
        public string SchoolYear { get; set; } = string.Empty;

        [JsonPropertyName("faculty_id")]
        public string FacultyId { get; set; } = string.Empty;

        [JsonPropertyName("date")]
        public string Date { get; set; } = string.Empty;

        [JsonPropertyName("ipfs_cid")]
        public string IpfsCid { get; set; } = string.Empty;

        [JsonPropertyName("university")]
        public string University { get; set; } = string.Empty;

        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("normalized_status")]
        public string NormalizedStatus => NormalizeStatus(Status);

        [JsonPropertyName("note")]
        public string? Note { get; set; }

        [JsonPropertyName("version")]
        public int Version { get; set; }

        private static string NormalizeStatus(string? status)
        {
            var normalized = new string((status ?? string.Empty)
                .Trim()
                .ToLowerInvariant()
                .Where(char.IsLetterOrDigit)
                .ToArray());

            if (string.IsNullOrEmpty(normalized)) return "draft";
            if (normalized.Contains("return") || normalized.Contains("reject")) return "returned";
            if (normalized.Contains("final")) return "finalized";
            if (normalized.Contains("departmentapproved") || normalized.Contains("approved") || normalized.Contains("forwarded")) return "approved";
            if (normalized.Contains("submitted") || normalized.Contains("issued")) return "submitted";
            if (normalized.Contains("corrected")) return "corrected";

            return "draft";
        }
    }
}
