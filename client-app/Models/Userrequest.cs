using System;
using System.Collections.Generic;

namespace For_Testing_Only_Capstone.Models;

public partial class Userrequest
{
    public int Requestid { get; set; }

    public string Fullname { get; set; } = null!;

    public string Email { get; set; } = null!;

    public string? Role { get; set; }

    public string? Requeststatus { get; set; }

    public DateTime? Createdat { get; set; }
}
