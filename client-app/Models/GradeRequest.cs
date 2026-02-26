using System.Text.Json.Serialization;

namespace BlockGo.Models
{
    public class GradeRequest
    {
        [JsonPropertyName("record_id")]
        public string StudentId { get; set; }

        [JsonPropertyName("student_hash")]
        public string StudentHash { get; set; }

        [JsonPropertyName("subject_code")]
        public string SubjectCode { get; set; }

        [JsonPropertyName("subject_name")]
        public string SubjectName { get; set; }

        [JsonPropertyName("section")]
        public string Section { get; set; }

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
    }
}