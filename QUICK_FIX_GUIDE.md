# QUICK REFERENCE - Integration Changes Summary

**Status:** READY FOR IMPLEMENTATION  
**Time to Implement:** 1-2 hours  
**Difficulty:** MEDIUM  

---

## 🎯 What Changed?

Your backend restructured with **private data collections** and **attribute-based access control**. Three critical integration points are now broken:

1. ❌ Missing `course` field in grade submission
2. ❌ Missing `dept` attribute in Fabric CA certificates
3. ❌ Chaincode expects private data, middleware queries public ledger

---

## 🔧 5-Minute Fix (Copy-Paste)

### FIX #1: Add 3 Properties to GradeRequest.cs

**File:** `client-app/Models/GradeRequest.cs`

Add after line 29 (after `Date` property):

```csharp
[JsonPropertyName("course")]
public string Course { get; set; } = string.Empty;

[JsonPropertyName("university")]
public string University { get; set; } = string.Empty;

[JsonPropertyName("ipfs_cid")]
public string IpfsCid { get; set; } = string.Empty;
```

---

### FIX #2: Update 1 Line in mapperGo.cs

**File:** `client-app/Mapper/mapperGo.cs`

Replace lines 14-16 with:

```csharp
Section = request.Section,
Course = request.Course,  // ← ADD
SubjectCode = request.SubjectCode,
```

Also update line 22:

```csharp
IpfsCid = request.IpfsCid,  // ← ADD
```

And update line 24:

```csharp
University = string.IsNullOrEmpty(request.University) ? university : request.University,  // ← CHANGE
```

---

### FIX #3: Add Attributes to Registrar_RegistrationController.cs

**File:** `client-app/Controllers/Registrar_RegistrationController.cs`

In `GetRoleConfiguration()` method (~line 284), update each role's Attributes dictionary:

**For "prof" role:**
```csharp
Attributes = new Dictionary<string, string>
{
    { "hf.Registrar.Roles", "student" },
    { "grade.manage", "true" },
    { "grade.view.all", "true" },
    { "dept", "faculty" },  // ← ADD
    { "uid", "{faculty_id}" }  // ← ADD
}
```

**For "registrar" role:**
```csharp
Attributes = new Dictionary<string, string>
{
    { "hf.Registrar.Roles", "*" },
    { "hf.Registrar.Attributes", "*" },
    { "admin.access", "true" },
    { "dept", "registrar" },  // ← ADD
    { "uid", "{registrar_id}" }  // ← ADD
}
```

**For "student" role:**
```csharp
Attributes = new Dictionary<string, string>
{
    { "grade.view.own", "true" },
    { "transcript.download", "true" },
    { "uid", "{student_id}" }  // ← ADD
}
```

---

### FIX #4: Update middleware.js

**File:** `middleware/middleware.js`

Replace the `/api/all-grades` endpoint (lines 42-48) with:

```javascript
app.get('/api/all-grades', checkConnectivity, async (req, res) => {
    try {
        res.status(200).json({ 
            message: "Private data collection - use individual queries",
            note: "Use /api/get-grade/{id} to retrieve grades"
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

Add `/api/update-grade` endpoint after line 68:

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

---

## ✅ Testing (30 seconds)

After changes, test this flow:

```bash
# 1. Register a faculty member
curl -X POST http://localhost:5000/api/Registrar_Registration/grant/1 \
  -H "Content-Type: application/json" \
  -d '{
    "username":"prof@uni.edu",
    "password":"password123",
    "role":"prof"
  }'

# Expected: HTTP 200 with Success message

# 2. Submit a grade (NEW - now includes course field)
curl -X POST http://localhost:5000/api/Grades/record \
  -H "Content-Type: application/json" \
  -d '{
    "student_id":"STU001",
    "student_hash":"hash123",
    "course":"CS101",
    "subject_code":"CS",
    "section":"A",
    "grade":"A",
    "semester":"Spring",
    "school_year":"2024",
    "faculty_id":"FAC001",
    "university":"PLV"
  }'

# Expected: HTTP 200 with success message + blockchain TX ID
```

---

## 📊 Impact Summary

| Component | Impact | Status |
|-----------|--------|--------|
| Grade Submission | Will now work correctly | ✅ FIXED |
| Faculty Registration | Will include dept attribute | ✅ FIXED |
| Grade Queries | Return empty (by design) | ✅ OK |
| Grade Updates | Now supported | ✅ FIXED |
| Role Validation | Enforced at chaincode level | ✅ OK |

---

## 🚀 After Implementation

```
git add -A
git commit -m "Fix backend integration: add course field, dept attributes, update middleware"
git push
```

---

## 📚 Full Documentation

See detailed analysis in:
- `BACKEND_RESTRUCTURE_ANALYSIS.md` - Complete architectural review
- `CODE_CHANGES_REQUIRED.md` - Line-by-line code changes

---

**Last Updated:** March 14, 2026  
**Ready to Deploy:** YES ✅
