# REQUIRED CODE CHANGES - Implementation Guide

**Status:** Ready for Implementation  
**Priority:** 🔴 CRITICAL (Blocking Grade Submission Flow)  
**Estimated Time:** 2-3 hours

---

## 📋 Change Summary

| File | Type | Lines | Severity |
|------|------|-------|----------|
| `GradeRequest.cs` | Add Properties | +3 | 🔴 CRITICAL |
| `mapperGo.cs` | Update Mapper | +2 lines | 🔴 CRITICAL |
| `Registrar_RegistrationController.cs` | Add Attributes | +5 lines | 🔴 CRITICAL |
| `middleware.js` | Fix + Add Routes | +15 lines | 🔴 CRITICAL |
| `main.go` (Chaincode) | Review | No change | 🟢 OK |

---

## CHANGE #1: Update GradeRequest.cs

**File Path:** `client-app/Models/GradeRequest.cs`

**Current Content:**
```csharp
using System.Text.Json.Serialization;

namespace BlockGo.Models
{
    public class GradeRequest
    {
        [JsonPropertyName("record_id")]
        public string StudentId { get; set; } = string.Empty;

        [JsonPropertyName("student_hash")]
        public string StudentHash { get; set; } = string.Empty;

        [JsonPropertyName("subject_code")]
        public string SubjectCode { get; set; } = string.Empty;

        [JsonPropertyName("subject_name")]
        public string SubjectName { get; set; } = string.Empty;

        [JsonPropertyName("section")]
        public string Section { get; set; } = string.Empty;

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
    }
}
```

**Required Changes:**

```csharp
using System.Text.Json.Serialization;

namespace BlockGo.Models
{
    public class GradeRequest
    {
        [JsonPropertyName("record_id")]
        public string StudentId { get; set; } = string.Empty;

        [JsonPropertyName("student_hash")]
        public string StudentHash { get; set; } = string.Empty;

        [JsonPropertyName("subject_code")]
        public string SubjectCode { get; set; } = string.Empty;

        [JsonPropertyName("subject_name")]
        public string SubjectName { get; set; } = string.Empty;

        [JsonPropertyName("section")]
        public string Section { get; set; } = string.Empty;

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

        // ============ ADD THESE THREE PROPERTIES ============
        [JsonPropertyName("course")]
        public string Course { get; set; } = string.Empty;

        [JsonPropertyName("university")]
        public string University { get; set; } = string.Empty;

        [JsonPropertyName("ipfs_cid")]
        public string IpfsCid { get; set; } = string.Empty;
        // ==================================================
    }
}
```

**Why:** Chaincode expects `course` field; middleware needs `ipfs_cid`; both need `university`

---

## CHANGE #2: Update mapperGo.cs

**File Path:** `client-app/Mapper/mapperGo.cs`

**Current Content:**
```csharp
using BlockGo.Models;
using Client_app.Models;
using For_Testing_Only_Capstone.Models;

namespace BlockGo.Mappers
{
    public static class GradeMapper
    {
        public static AcademicRecord ToBlockchainRecord(this GradeRequest request, string university = "PLV")
        {
            return new AcademicRecord
            {
                Id = request.StudentId, 
                StudentHash = request.StudentHash,
                Section = request.Section,
                SubjectCode = request.SubjectCode,
                Grade = request.Grade,
                Semester = request.Semester,
                SchoolYear = request.SchoolYear,
                FacultyId = request.FacultyId,
                Date = request.Date,
                University = university,
                Status = "RECORDED",
                Version = 1
            };
        }

        public static Gradecorrectionlog ToInitialLog(this GradeRequest request)
        {
            return new Gradecorrectionlog
            {
                Recordid = request.StudentId,
                Newgrade = request.Grade,
                Reasontext = "Initial Grade Recording",
                Approvedby = request.FacultyId,
                Timestamp = DateTime.UtcNow
            };
        }
    }
}
```

**Required Changes:**

```csharp
using BlockGo.Models;
using Client_app.Models;
using For_Testing_Only_Capstone.Models;

namespace BlockGo.Mappers
{
    public static class GradeMapper
    {
        public static AcademicRecord ToBlockchainRecord(this GradeRequest request, string university = "PLV")
        {
            return new AcademicRecord
            {
                Id = request.StudentId, 
                StudentHash = request.StudentHash,
                Section = request.Section,
                Course = request.Course,  // ✅ ADD THIS
                SubjectCode = request.SubjectCode,
                Grade = request.Grade,
                Semester = request.Semester,
                SchoolYear = request.SchoolYear,
                FacultyId = request.FacultyId,
                Date = request.Date,
                IpfsCid = request.IpfsCid,  // ✅ ADD THIS
                University = string.IsNullOrEmpty(request.University) ? university : request.University,  // ✅ CHANGE THIS
                Status = "RECORDED",
                Version = 1
            };
        }

        public static Gradecorrectionlog ToInitialLog(this GradeRequest request)
        {
            return new Gradecorrectionlog
            {
                Recordid = request.StudentId,
                Newgrade = request.Grade,
                Reasontext = "Initial Grade Recording",
                Approvedby = request.FacultyId,
                Timestamp = DateTime.UtcNow
            };
        }
    }
}
```

**Changes Made:**
- Line 17: `Course = request.Course,` ✅ NEW
- Line 19: `IpfsCid = request.IpfsCid,` ✅ NEW
- Line 24: Changed `University = university,` to `University = string.IsNullOrEmpty(request.University) ? university : request.University,` ✅ UPDATED

---

## CHANGE #3: Update Registrar_RegistrationController.cs

**File Path:** `client-app/Controllers/Registrar_RegistrationController.cs`

**Location:** Lines 284-318 (GetRoleConfiguration method)

**Current Content:**
```csharp
private RoleConfig GetRoleConfiguration(string role)
{
    return role switch
    {
        "prof" => new RoleConfig
        {
            FabricRole = "faculty",
            Permissions = new[] { "view_all_grades", "manage_student_grades", "submit_grades" },
            Attributes = new Dictionary<string, string>
            {
                { "hf.Registrar.Roles", "student" },
                { "grade.manage", "true" },
                { "grade.view.all", "true" }
            }
        },
        "registrar" => new RoleConfig
        {
            FabricRole = "registrar",
            Permissions = new[] { "full_admin", "manage_users", "manage_grades", "generate_reports" },
            Attributes = new Dictionary<string, string>
            {
                { "hf.Registrar.Roles", "*" },
                { "hf.Registrar.Attributes", "*" },
                { "admin.access", "true" }
            }
        },
        "student" => new RoleConfig
        {
            FabricRole = "student",
            Permissions = new[] { "view_own_grades", "download_transcript" },
            Attributes = new Dictionary<string, string>
            {
                { "grade.view.own", "true" },
                { "transcript.download", "true" }
            }
        },
        _ => new RoleConfig
        {
            FabricRole = "student",
            Permissions = new[] { "view_own_grades" },
            Attributes = new Dictionary<string, string>
            {
                { "grade.view.own", "true" }
            }
        }
    };
}
```

**Required Changes:**

```csharp
private RoleConfig GetRoleConfiguration(string role)
{
    return role switch
    {
        "prof" => new RoleConfig
        {
            FabricRole = "faculty",
            Permissions = new[] { "view_all_grades", "manage_student_grades", "submit_grades" },
            Attributes = new Dictionary<string, string>
            {
                { "hf.Registrar.Roles", "student" },
                { "grade.manage", "true" },
                { "grade.view.all", "true" },
                { "dept", "faculty" },  // ✅ ADD THIS - Required by chaincode
                { "uid", "{faculty_id}" }  // ✅ ADD THIS - For chaincode filtering
            }
        },
        "registrar" => new RoleConfig
        {
            FabricRole = "registrar",
            Permissions = new[] { "full_admin", "manage_users", "manage_grades", "generate_reports" },
            Attributes = new Dictionary<string, string>
            {
                { "hf.Registrar.Roles", "*" },
                { "hf.Registrar.Attributes", "*" },
                { "admin.access", "true" },
                { "dept", "registrar" },  // ✅ ADD THIS
                { "uid", "{registrar_id}" }  // ✅ ADD THIS
            }
        },
        "student" => new RoleConfig
        {
            FabricRole = "student",
            Permissions = new[] { "view_own_grades", "download_transcript" },
            Attributes = new Dictionary<string, string>
            {
                { "grade.view.own", "true" },
                { "transcript.download", "true" },
                { "uid", "{student_id}" }  // ✅ ADD THIS - For student grade filtering
            }
        },
        _ => new RoleConfig
        {
            FabricRole = "student",
            Permissions = new[] { "view_own_grades" },
            Attributes = new Dictionary<string, string>
            {
                { "grade.view.own", "true" },
                { "uid", "{student_id}" }  // ✅ ADD THIS
            }
        }
    };
}
```

**Changes Summary:**
- **"prof" role:** Added `{ "dept", "faculty" }` and `{ "uid", "{faculty_id}" }`
- **"registrar" role:** Added `{ "dept", "registrar" }` and `{ "uid", "{registrar_id}" }`
- **"student" role:** Added `{ "uid", "{student_id}" }`
- **default case:** Added `{ "uid", "{student_id}" }`

**Why:** Chaincode retrieves these attributes with `getAttribute(stub, "dept")` and `getAttribute(stub, "uid")`

---

## CHANGE #4: Update middleware.js - Fix All Grades Endpoint

**File Path:** `middleware/middleware.js`

**Current Content (Lines 42-48):**
```javascript
app.get('/api/all-grades', checkConnectivity, async (req, res) => {
    try {
        const result = await fabricContext.contract.evaluateTransaction('GetAllGrades');
        res.status(200).json(JSON.parse(result.toString()));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

**Problem:** Chaincode stores grades in **private data collection**, so `GetAllGrades` returns empty

**Solution A (Recommended - Keep Private):**

```javascript
app.get('/api/all-grades', checkConnectivity, async (req, res) => {
    try {
        // Private data collections cannot be directly queried
        // Return metadata note for security
        res.status(200).json({ 
            message: "Private data collection query",
            note: "Use /api/get-grade/{id} to retrieve individual grades",
            endpoint: "/api/get-grade/{recordId}",
            example: "/api/get-grade/STU001"
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

**Solution B (If You Need Full Listing):**

Modify chaincode to expose public metadata:

```go
// In chaincode main.go - Add new function
func (cc *SmartContract) getAllGradeMetadata(stub shim.ChaincodeStubInterface, args []string) *pb.Response {
    // Query public ledger index only
    resultsIterator, err := stub.GetStateByRange("grade_meta_", "grade_meta_~")
    if err != nil {
        return shim.Error("Query failed")
    }
    defer resultsIterator.Close()
    // ... build results
}
```

**For now, use Solution A (simpler, more secure)**

---

## CHANGE #5: Add Update Grade Endpoint to middleware.js

**File Path:** `middleware/middleware.js`

**Insert After Line 68 (after the approve-grade endpoint):**

```javascript
app.post('/api/update-grade', checkConnectivity, async (req, res) => {
    try {
        const gradeAsset = JSON.stringify({
            id: String(req.body.id),
            student_hash: req.body.student_hash,
            section: req.body.section,
            course: req.body.course,
            subject_code: req.body.subject_code,
            grade: String(req.body.grade),
            semester: req.body.semester,
            school_year: req.body.school_year,
            date: req.body.date || new Date().toISOString(),
            university: req.body.university,
            ipfs_cid: req.body.ipfs_cid || "",
            status: req.body.status || "Corrected",
            version: (req.body.version || 0) + 1
        });

        await fabricContext.contract.submitTransaction('UpdateGrade', gradeAsset);
        res.status(200).json({ status: "success", message: "Grade updated on ledger" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

**Why:** Client-App's `BlockchainService.UpdateGradeAsync()` calls this endpoint (line 26 in BlockchainService.cs)

---

## CHANGE #6: Add Logging to middleware.js (Optional but Recommended)

**File Path:** `middleware/middleware.js`

**Add at Line 3 (after `const app = express();`):**

```javascript
// Add logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    if (req.method === 'POST') {
        console.log('Payload:', JSON.stringify(req.body, null, 2));
    }
    next();
});
```

**Why:** Helps debug payload mismatches

---

## ✅ Verification Steps (After Implementation)

### Step 1: Verify GradeRequest Serialization
```csharp
// In a test file or Program.cs
var request = new GradeRequest
{
    StudentId = "STU001",
    StudentHash = "hash123",
    Course = "CS101",  // ← NEW
    University = "PLV"  // ← NEW
};

var json = JsonSerializer.Serialize(request);
Console.WriteLine(json);

// Expected output:
// {"record_id":"STU001","student_hash":"hash123","course":"CS101","university":"PLV",...}
```

### Step 2: Verify Mapper Transformation
```csharp
var academic = request.ToBlockchainRecord();
Assert.AreEqual("CS101", academic.Course);
Assert.AreEqual("PLV", academic.University);
```

### Step 3: Test Fabric CA Registration
```bash
curl -X POST http://localhost:5000/api/Registrar_Registration/grant/1 \
  -H "Content-Type: application/json" \
  -d '{
    "username": "prof@uni.edu",
    "password": "secure_password_123",
    "role": "prof"
  }'

# Check response - should see dept attribute
```

### Step 4: Test Grade Submission End-to-End
```bash
# Submit a grade
curl -X POST http://localhost:5000/api/Grades/record \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "STU001",
    "student_hash": "hash123",
    "course": "CS101",
    "subject_code": "CS",
    "section": "A",
    "grade": "A",
    "semester": "Spring",
    "school_year": "2024",
    "faculty_id": "FAC001",
    "university": "PLV"
  }'

# Expected: HTTP 200 with success message
```

### Step 5: Verify Middleware Receives Correct Payload
```bash
# Look for logs from middleware showing payload received
# Should include "course" field
```

---

## 🚨 Common Issues & Fixes

### Issue: "course" field null in middleware logs
**Fix:** Ensure GradeRequest.cs has `Course` property with `[JsonPropertyName("course")]`

### Issue: Chaincode returns "Faculty cannot issue grades"
**Fix:** Verify `dept` attribute is in certificate. Re-register user after code change.

### Issue: Middleware GetAllGrades returns empty
**Fix:** This is expected. Use Solution A (metadata note) or implement public metadata in chaincode.

### Issue: "Cannot update grade" error
**Fix:** Ensure `/api/update-grade` endpoint exists in middleware.js

---

## 📋 Deployment Checklist

- [ ] Backup database
- [ ] Update GradeRequest.cs
- [ ] Update mapperGo.cs
- [ ] Update Registrar_RegistrationController.cs
- [ ] Test client-app build: `dotnet build`
- [ ] Update middleware.js (all-grades + update-grade endpoints)
- [ ] Restart middleware: `npm restart`
- [ ] Test registration endpoint
- [ ] Test grade submission endpoint
- [ ] Test grade update endpoint
- [ ] Verify blockchain recorded grades

---

**Generated:** March 14, 2026  
**Ready for Implementation:** YES ✅
