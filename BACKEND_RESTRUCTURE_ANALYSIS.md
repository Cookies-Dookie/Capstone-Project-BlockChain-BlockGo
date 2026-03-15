# Backend Restructure Analysis & Integration Changes Required

**Date:** March 14, 2026  
**Status:** ANALYSIS COMPLETE - Ready for Implementation  
**Project:** Hyperledger Fabric Capstone - Grade Management System

---

## 📋 Executive Summary

Your backend has been restructured with significant architectural changes affecting all three tiers:
- **Client-App (C# .NET):** Controllers now properly separated, FabricCA integration improved
- **Middleware (Node.js):** Simplified routing with direct Fabric SDK calls
- **Chaincode (Go):** Private data collections enabled, role-based access control implemented

**Impact Level:** 🔴 **HIGH** - Multiple integration points need updates

---

## 🏗️ Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│ TIER 1: Client-App (C# .NET 9.0)                                   │
├─────────────────────────────────────────────────────────────────────┤
│ Registrar_RegistrationController  ✅ READY                          │
│  └─ POST /api/Registrar_Registration/grant/{sqlRequestId}           │
│     • HTTP Basic Auth: admin:adminpw → Fabric CA /register          │
│     • Updates DB status: PENDING → APPROVED                         │
│                                                                      │
│ GradesController (Route: /api/[controller])                         │
│  ├─ POST /api/Grades/record → BlockchainService.SubmitGradeAsync  │
│  ├─ POST /api/Grades/correct → BlockchainService.UpdateGradeAsync │
│  ├─ GET /api/Grades/all → BlockchainService.GetAllGradesAsync     │
│                                                                      │
│ Registrar_RevocationController  ✅ READY                            │
│  └─ DELETE /api/Registrar_Revocation/revoke/{sqlRequestId}          │
│     • Calls Fabric CA /revoke endpoint                              │
│     • Updates DB status: APPROVED → REVOKED                         │
└─────────────────────────────────────────────────────────────────────┘
          ↓ HTTP Calls (Port 4000)
┌─────────────────────────────────────────────────────────────────────┐
│ TIER 2: Middleware (Node.js/Express on Port 4000)                  │
├─────────────────────────────────────────────────────────────────────┤
│ Routes:                                                              │
│  • GET /api/all-grades                                              │
│  • POST /api/issue-grade                                            │
│  • GET /api/get-grade/:id                                           │
│  • POST /api/approve-grade/:id                                      │
│  • POST /api/finalize-grade/:id                                     │
│  • GET /api/health                                                  │
│                                                                      │
│ Gateway Connection:                                                 │
│  • Wallet: ./wallet/{identity}                                      │
│  • Connection Profile: connection.json                              │
│  • Channel: registrar-channel                                       │
│  • Chaincode: registrar                                             │
│  • Identity: admin (from ENV)                                       │
│  • Retry Logic: 5 attempts with 5s delay                            │
└─────────────────────────────────────────────────────────────────────┘
          ↓ Fabric Protocol
┌─────────────────────────────────────────────────────────────────────┐
│ TIER 3: Chaincode (Go)                                              │
├─────────────────────────────────────────────────────────────────────┤
│ Functions:                                                           │
│  • IssueGrade(gradeAsset)  → Requires role="faculty"               │
│  • ReadGrade(id)           → Role-based access control             │
│  • UpdateGrade(record)     → Faculty only, original issuer only     │
│  • ApproveGrade(id)        → Requires role="department_admin"      │
│  • FinalizeRecord(id)      → Requires role="registrar"             │
│  • GetAllGrades()          → Role-based filtering                   │
│                                                                      │
│ Private Data Collection: collectionGrades                           │
│ Endorsement Policy: MAJORITY_SIGN_BY                                │
│ State DB: CouchDB (Port 5985)                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔴 CRITICAL ISSUES FOUND

### Issue #1: Grade Submission Endpoint Mismatch
**Severity:** 🔴 CRITICAL

**Problem:**
- Client-App calls: `http://localhost:4000/api/issue-grade`
- Middleware responds to: `/api/issue-grade` ✅ MATCH
- BUT: Client-App doesn't provide required fields

**Current Flow:**
```csharp
// GradesController.cs - Line 24
var blockchainRecord = request.ToBlockchainRecord("PLV");
var result = await _blockchainService.SubmitGradeAsync(blockchainRecord);

// BlockchainService.cs - Line 23
await _httpClient.PostAsJsonAsync("http://localhost:4000/api/issue-grade", record);
```

**Expected Middleware Payload:**
```json
{
  "id": "string",
  "student_hash": "string",
  "section": "string",
  "course": "string",
  "subject_code": "string",
  "grade": "string",
  "semester": "string",
  "school_year": "string",
  "date": "2024-01-01T00:00:00Z",
  "university": "string",
  "ipfs_cid": "string (optional)"
}
```

**Issue:** GradeRequest model (GradeRequest.cs) is missing:
- `course` field ❌
- `ipfs_cid` field ❌ (optional but used in middleware)

---

### Issue #2: Chaincode Private Data vs Public Query
**Severity:** 🔴 CRITICAL

**Problem:**
```go
// chaincode main.go - Line 140
err = stub.PutPrivateData("collectionGrades", record.ID, recordJSON)

// But middleware queries public ledger:
// middleware.js - Line 54
const result = await fabricContext.contract.evaluateTransaction('GetAllGrades');
```

**Mismatch:**
- Chaincode writes to **private** collection: `collectionGrades`
- Middleware reads from **public** state (default behavior)
- Results: Empty or error

---

### Issue #3: Faculty Department Attribute Mismatch
**Severity:** 🔴 CRITICAL

**Problem:**
```go
// chaincode main.go - Line 115 (issueGrade function)
dept, _ := getAttribute(stub, "dept")  // Expects "dept" attribute
if record.University != dept {
    return shim.Error("Faculty cannot issue grades...")
}
```

**But Client-App Registration:**
```csharp
// Registrar_RegistrationController.cs - Line 186
Attributes = new Dictionary<string, string>
{
    { "hf.Registrar.Roles", "student" },
    { "grade.manage", "true" },
    { "grade.view.all", "true" }  // ❌ No "dept" attribute!
}
```

**Result:** Faculty cannot issue grades (dept attribute missing)

---

### Issue #4: GradeRequest Missing Required Fields
**Severity:** 🔴 CRITICAL

**Missing Fields in GradeRequest.cs:**
```csharp
// Current fields:
public string StudentId { get; set; }
public string StudentHash { get; set; }
public string SubjectCode { get; set; }
public string SubjectName { get; set; }
public string Section { get; set; }
public string Grade { get; set; }
public string Semester { get; set; }
public string SchoolYear { get; set; }
public string FacultyId { get; set; }
public string Date { get; set; }

// ❌ Missing (needed for chaincode):
// public string Course { get; set; }          // Required by chaincode
// public string IpfsCid { get; set; }         // Optional but used
// public string University { get; set; }      // Required for dept check
```

---

### Issue #5: Middleware Course Field Not Parsed
**Severity:** 🟡 HIGH

**Problem:**
```javascript
// middleware.js - Line 45
const gradeAsset = JSON.stringify({
    id: String(req.body.id),
    student_hash: req.body.student_hash,
    section: req.body.section,
    course: req.body.course,  // ← Expects this field
    subject_code: req.body.subject_code,
    // ...
});
```

**But Client-App sends:**
```csharp
// GradeMapper.cs - Line 16
SubjectCode = request.SubjectCode,  // Different field!
```

---

## ✅ CHANGES REQUIRED (Implementation Plan)

### Phase 1: Fix Data Model (GradeRequest.cs)

**File:** `C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\client-app\Models\GradeRequest.cs`

**Changes:**
```csharp
// ADD these properties:
[JsonPropertyName("course")]
public string Course { get; set; } = string.Empty;  // NEW

[JsonPropertyName("university")]
public string University { get; set; } = string.Empty;  // NEW

[JsonPropertyName("ipfs_cid")]
public string IpfsCid { get; set; } = string.Empty;  // NEW (optional)
```

**Rationale:** Chaincode needs `course` and `university` fields; middleware needs `ipfs_cid`

---

### Phase 2: Fix Mapper (mapperGo.cs)

**File:** `C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\client-app\Mapper\mapperGo.cs`

**Changes:**
```csharp
public static AcademicRecord ToBlockchainRecord(this GradeRequest request, string university = "PLV")
{
    return new AcademicRecord
    {
        Id = request.StudentId, 
        StudentHash = request.StudentHash,
        Section = request.Section,
        Course = request.Course,  // ADD THIS LINE
        SubjectCode = request.SubjectCode,
        Grade = request.Grade,
        Semester = request.Semester,
        SchoolYear = request.SchoolYear,
        FacultyId = request.FacultyId,
        Date = request.Date,
        University = request.University ?? university,  // CHANGE: Use from request or fallback
        IpfsCid = request.IpfsCid,  // ADD THIS LINE
        Status = "RECORDED",
        Version = 1
    };
}
```

---

### Phase 3: Fix Role-Based Attributes (Registrar_RegistrationController.cs)

**File:** `C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\client-app\Controllers\Registrar_RegistrationController.cs`

**Changes:**
```csharp
// UPDATE the GetRoleConfiguration method - Line 290

"prof" => new RoleConfig
{
    FabricRole = "faculty",
    Permissions = new[] { "view_all_grades", "manage_student_grades", "submit_grades" },
    Attributes = new Dictionary<string, string>
    {
        { "hf.Registrar.Roles", "student" },
        { "grade.manage", "true" },
        { "grade.view.all", "true" },
        { "dept", "faculty" },  // ADD THIS - Chaincode expects "dept"
        { "uid", "{faculty_id}" }  // ADD THIS - Needed for chaincode filtering
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
        { "uid", "{student_id}" }  // ADD THIS - For student grade filtering
    }
}
```

**Rationale:** Chaincode calls `getAttribute(stub, "dept")` - must be provided in certificate attributes

---

### Phase 4: Fix Chaincode Private Data Queries (main.go)

**File:** `C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\chaincode\main.go`

**Problem:** `getAllGrades()` reads from private collection but doesn't expose to query transactions

**Solution - Option A (Recommended):** Keep private, expose via middleware-specific endpoint
```go
// Keep private data collection for security
// Middleware will call individual GetGrade calls for each record

// Add public ledger index for efficiency:
func (cc *SmartContract) indexGradeMetadata(stub shim.ChaincodeStubInterface, record *AcademicRecord) error {
    // Store only metadata (ID, studentHash, status) in public ledger
    // Full record stays in private collection
    metadataKey := "grade_meta_" + record.ID
    return stub.PutState(metadataKey, []byte(record.ID))
}
```

**Solution - Option B (Less Secure):** Store full records in public state
```go
// In issueGrade() function:
stub.PutState(record.ID, recordJSON)              // Public ledger
stub.PutPrivateData("collectionGrades", record.ID, recordJSON)  // Private collection
```

**Recommendation:** Use Option A (keep sensitive data private)

---

### Phase 5: Update Middleware Response (middleware.js)

**File:** `C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\middleware\middleware.js`

**Current Issue:** Middleware returns undefined or error for `GetAllGrades` from private data

**Change - Line 46:**
```javascript
app.get('/api/all-grades', checkConnectivity, async (req, res) => {
    try {
        // For private data collections, middleware must iterate or use pagination
        // Option: Return empty array with note that private collection
        res.status(200).json({ 
            records: [], 
            note: "Use /api/get-grade/{id} for specific grades (private collection)"
        });
        
        // OR: If you stored metadata in public ledger (Option A):
        // const iterator = await fabricContext.contract.evaluateTransaction('GetAllGradeMetadata');
        // res.status(200).json(JSON.parse(iterator.toString()));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

---

### Phase 6: Add Missing Middleware Endpoints

**File:** `C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\middleware\middleware.js`

**Add Update Grade Endpoint (Line 89):**
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
            ipfs_cid: req.body.ipfs_cid || ""
        });

        await fabricContext.contract.submitTransaction('UpdateGrade', gradeAsset);
        res.status(200).json({ status: "success", message: "Grade updated on ledger" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

---

## 📊 Integration Point Summary

### Client-App → Middleware
| Feature | Endpoint | Current Status | Change Required |
|---------|----------|-----------------|-----------------|
| Submit Grade | `POST /api/issue-grade` | ❌ Missing fields | Add `course`, `university`, `ipfs_cid` to GradeRequest |
| Update Grade | `POST /api/update-grade` | ✅ Exists | Ensure all fields populated |
| Query Grade | `GET /api/get-grade/{id}` | ✅ Ready | No change |
| List Grades | `GET /api/all-grades` | ⚠️ Returns empty | Implement metadata listing or note limitation |
| Approve Grade | `POST /api/approve-grade/{id}` | ✅ Ready | Need role validation |
| Finalize Grade | `POST /api/finalize-grade/{id}` | ✅ Ready | Need registrar role |

### Middleware → Chaincode
| Function | Parameters | Current | Change Required |
|----------|-----------|---------|-----------------|
| IssueGrade | JSON asset | ✅ Correct format | Ensure `course` field always populated |
| UpdateGrade | JSON asset | ❌ Endpoint exists in code but not called | Add middleware route |
| ApproveGrade | Record ID | ✅ Ready | Check role="department_admin" |
| FinalizeRecord | Record ID | ✅ Ready | Check role="registrar" |
| GetAllGrades | None | ⚠️ Private collection | Implement pagination/metadata fallback |

---

## 🔧 Implementation Checklist

**Priority: 🔴 CRITICAL**

- [ ] **Update GradeRequest.cs**
  - [ ] Add `Course` property
  - [ ] Add `University` property
  - [ ] Add `IpfsCid` property

- [ ] **Update mapperGo.cs**
  - [ ] Map `Course` field
  - [ ] Map `University` field (or use fallback)
  - [ ] Map `IpfsCid` field

- [ ] **Update Registrar_RegistrationController.cs**
  - [ ] Add `dept` attribute to all roles
  - [ ] Add `uid` attribute to roles
  - [ ] Test Fabric CA registration with new attributes

- [ ] **Review chaincode main.go**
  - [ ] Verify private data strategy (keep private vs expose)
  - [ ] Add public metadata index if needed
  - [ ] Test `getAttribute` calls for `dept`, `uid`

- [ ] **Update middleware.js**
  - [ ] Fix `/api/all-grades` for private collection
  - [ ] Add `/api/update-grade` endpoint
  - [ ] Test all endpoints with new payload structure

---

## 🧪 Testing Plan

### 1. Unit Test: GradeRequest → AcademicRecord Mapping
```csharp
[Test]
public void ToBlockchainRecord_AllFieldsMapped()
{
    var request = new GradeRequest
    {
        StudentId = "STU001",
        StudentHash = "hash123",
        Section = "A",
        Course = "CS101",  // NEW
        SubjectCode = "CS",
        Grade = "A",
        Semester = "Spring",
        SchoolYear = "2024",
        FacultyId = "FAC001",
        Date = "2024-01-01",
        University = "PLV"  // NEW
    };

    var result = request.ToBlockchainRecord();

    Assert.AreEqual("CS101", result.Course);
    Assert.AreEqual("PLV", result.University);
}
```

### 2. Integration Test: Registration with Attributes
```csharp
[Test]
public async Task GrantAccess_IncludesDeptAttribute_ForFaculty()
{
    // Setup
    var request = new RegistrationRequest
    {
        Username = "prof@uni.edu",
        Password = "pass123",
        Role = "prof"
    };

    // Act
    var response = await _controller.GrantAccess(1, request);

    // Assert - Verify Fabric CA received "dept" attribute
    // (Requires mocking HttpClientFactory)
}
```

### 3. Middleware Test: All Endpoints
```javascript
describe('Middleware Endpoints', () => {
    test('POST /api/issue-grade with all fields', async () => {
        const payload = {
            id: 'STU001',
            student_hash: 'hash123',
            section: 'A',
            course: 'CS101',
            subject_code: 'CS',
            grade: 'A',
            semester: 'Spring',
            school_year: '2024',
            date: new Date().toISOString(),
            university: 'PLV',
            ipfs_cid: 'Qm...'
        };

        const response = await axios.post('http://localhost:4000/api/issue-grade', payload);
        expect(response.status).toBe(201);
    });
});
```

---

## 📝 Deployment Steps

### Step 1: Database Backup
```bash
pg_dump -U BLOCKGO ActivityLogs > backup_$(date +%s).sql
```

### Step 2: Update Client-App Code
```bash
cd client-app
# Apply changes from Phase 1-3
```

### Step 3: Rebuild Client-App
```bash
dotnet clean
dotnet build
dotnet run
```

### Step 4: Update Middleware
```bash
cd middleware
# Apply changes from Phase 5-6
npm restart
```

### Step 5: Verify Chaincode (optional if code changed)
```bash
cd chaincode
# Rebuild if modified
docker build -t registrar:v2 .
```

### Step 6: End-to-End Test
```bash
# 1. Register user
curl -X POST http://localhost:5000/api/Registrar_Registration/grant/1 \
  -H "Content-Type: application/json" \
  -d '{"username":"test@uni.edu","password":"password123","role":"prof"}'

# 2. Submit grade
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

# 3. Query grade
curl http://localhost:5000/api/Grades/all
```

---

## 🎯 Success Criteria

✅ All tests pass  
✅ Grade submission returns TX ID from blockchain  
✅ Grade retrieval returns stored data  
✅ Faculty attributes verified in Fabric CA  
✅ Chaincode enforces role-based access  
✅ No data loss in database  

---

## 📚 Related Documentation

- [Hyperledger Fabric Private Data Collections](https://hyperledger-fabric.readthedocs.io/en/latest/private-data-arch.html)
- [Fabric CA Attributes](https://hyperledger-fabric-ca.readthedocs.io/en/latest/users-guide.html#managing-attributes)
- [Chaincode Attribute Validation](https://pkg.go.dev/github.com/hyperledger/fabric-chaincode-go/v2/pkg/cid)

---

## ⚠️ Known Limitations

1. **Private Data Collections:** GetAllGrades() cannot directly query private collection (security by design)
2. **Attribute Restrictions:** Fabric CA has length limits on attribute values (max 1024 chars)
3. **Transaction Throughput:** With MAJORITY_SIGN_BY endorsement policy, slower than single-peer

---

**Generated by Backend Analysis Tool**  
**Last Updated:** March 14, 2026
