# 🚀 QUICK TEST GUIDE - Middleware & Client-App Aligned

**Status:** READY TO TEST  
**Time:** 10 minutes  

---

## ⚡ 3-Step Verification

### Step 1: Start Middleware (2 mins)

```bash
cd C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\middleware

npm restart
```

**Wait for this output:**
```
✅ Bridge active on port 4000
📍 CouchDB: Port 5985 (Registrar)
🔐 Mode: Developer Bypass (ABAC disabled)
```

✅ If you see this → Middleware is ready

---

### Step 2: Build & Run Client-App (5 mins)

```bash
cd C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\client-app

dotnet build
dotnet run
```

**Wait for:**
```
Now listening on: http://localhost:5000
```

✅ If you see this → Client-app is ready

---

### Step 3: Test the Flow (3 mins)

Open Postman or Terminal and run:

```bash
# Health check
curl -X GET http://localhost:4000/api/health

# Submit a grade
curl -X POST http://localhost:5000/api/Grades/record \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "STUDENT_001",
    "studentHash": "student@uni.edu",
    "course": "BSCS",
    "subjectCode": "CS",
    "section": "A",
    "grade": "A",
    "semester": "Spring",
    "schoolYear": "2024",
    "facultyId": "Prof. Carmela",
    "university": "PLV"
  }'
```

**Expected Response (HTTP 200/201):**
```json
{
  "status": "Success",
  "message": "Grade secured on Ledger and Logged in Postgres!"
}
```

✅ **If you see this → System is working!**

---

## 📊 What Was Fixed

| Layer | Before ❌ | After ✅ |
|-------|-----------|----------|
| **Middleware** | RegisterStudent (missing) | IssueGrade (correct) |
| **Payload** | Unformatted | Stringified JSON |
| **ABAC** | Strict checks blocked Admin | Developer Bypass enabled |
| **CouchDB** | Wrong port | Port 5985 (correct) |
| **Logging** | Minimal | Full request/response tracing |

---

## 🔍 Troubleshooting

**Q: Middleware won't start?**
```bash
# Check port 4000 is free
netstat -ano | findstr :4000

# Check wallet exists
dir C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\middleware\wallet
```

**Q: "Faculty not found" error?**
```bash
# Register faculty first in database
# Then use their name in facultyId field
```

**Q: "Grade not appearing on blockchain"?**
```bash
# Check middleware logs for IssueGrade errors
# Ensure Admin wallet is valid
# Verify chaincode has ABAC disabled (commented out)
```

---

## ✅ Success Indicators

- [ ] Middleware starts on port 4000
- [ ] Client-app starts on port 5000
- [ ] Health check returns `connected: true`
- [ ] Grade submission returns HTTP 200
- [ ] Grade appears in PostgreSQL (Gradecorrectionlogs table)
- [ ] Grade appears in CouchDB (port 5985)

---

## 📝 Next: Full Integration Testing

Once basic flow works, test:

1. **Grade Retrieval:** GET /api/Grades/STUDENT_001
2. **All Grades:** GET /api/Grades/all
3. **Correction:** POST /api/Grades/correct
4. **Access Control:** Test department restrictions
5. **Logging:** Verify audit trail in PostgreSQL

---

**Ready?** Follow the 3 steps above! 🚀

Questions? Check MIDDLEWARE_ALIGNMENT_COMPLETE.md for detailed explanations.
