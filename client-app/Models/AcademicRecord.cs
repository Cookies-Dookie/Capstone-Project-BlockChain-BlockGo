using System.Text.Json.Serialization;

namespace BlockGo.Models
{
    public class AcademicRecord
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("student_hash")]
        public string StudentHash { get; set; }

        [JsonPropertyName("section")]
        public string Section { get; set; }

        [JsonPropertyName("course")]
        public string Course { get; set; }

        [JsonPropertyName("subject_code")]
        public string SubjectCode { get; set; }

        [JsonPropertyName("grade")]
        public string Grade { get; set; }

        [JsonPropertyName("semester")]
        public string Semester { get; set; }

        [JsonPropertyName("school_year")]
        public string SchoolYear { get; set; }

        [JsonPropertyName("faculty_id")]
        public string FacultyId { get; set; }

        [JsonPropertyName("date")]
        public string Date { get; set; }

        [JsonPropertyName("ipfs_cid")]
        public string IpfsCid { get; set; }

        [JsonPropertyName("university")]
        public string University { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; }

        [JsonPropertyName("version")]
        public int Version { get; set; }
    }
}