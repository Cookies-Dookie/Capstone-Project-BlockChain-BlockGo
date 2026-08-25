using System.ComponentModel.DataAnnotations;

namespace Client_app.Models
{
    public sealed class CreateSupportTicketRequest
    {
        [Required, StringLength(200, MinimumLength = 3)]
        public string Title { get; set; } = string.Empty;

        [Required, StringLength(5000, MinimumLength = 10)]
        public string Description { get; set; } = string.Empty;

        [Required]
        public string Severity { get; set; } = "NORMAL";
    }

    public sealed class UpdateSupportTicketRequest
    {
        [Required]
        public string Status { get; set; } = string.Empty;

        [StringLength(5000)]
        public string? AdminResponse { get; set; }

        public int? AssignedToUserId { get; set; }
    }
}
