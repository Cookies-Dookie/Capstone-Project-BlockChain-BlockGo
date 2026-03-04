using System;
using System.Collections.Generic;

namespace For_Testing_Only_Capstone.Models;

public partial class Gradecorrectionlog
{
    public int Logid { get; set; }

    public string Recordid { get; set; } = null!;

    public string? Oldgrade { get; set; }

    public string? Newgrade { get; set; }

    public string Reasontext { get; set; } = null!;

    public string? Approvedby { get; set; }

    public DateTime? Timestamp { get; set; }
}
