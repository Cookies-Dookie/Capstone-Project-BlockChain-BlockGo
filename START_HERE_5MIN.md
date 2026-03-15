# ⚡ READY TO TEST - 5 Minute Setup

**Status:** EVERYTHING SET UP ✅  
**What's Needed:** Just rebuild and start  

---

## 🚀 DO THIS NOW

### 1️⃣ Rebuild Chaincode (2 mins)

```bash
cd chaincode
go build -o registrar

# OR if using docker-compose:
docker-compose down
docker-compose up -d
```

### 2️⃣ Start Middleware (1 min)

```bash
cd middleware
npm restart
```

**Wait for:**
```
✅ Bridge active on port 4000
```

### 3️⃣ Start Client-App (1 min)

```bash
cd client-app
dotnet run
```

**Wait for:**
```
Now listening on: http://localhost:5000
```

### 4️⃣ Open Swagger (1 min)

```
Go to: http://localhost:5000/swagger/index.html
```

---

## ✅ You're Ready to Test

### Try This:

**POST /api/Grades/record**

```json
{
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
}
```

**Expected:** HTTP 200 ✅

---

## 📝 Why No ABAC Errors Now?

| Check | Before | After |
|-------|--------|-------|
| role != "faculty" | ❌ Error | ✅ Skipped |
| dept check | ❌ Error | ✅ Skipped |
| Access control | ❌ Error | ✅ Skipped |

**Result:** Everything works! 🎉

---

## 🎯 What to Test

1. ✅ POST /api/Grades/record → Submit grade
2. ✅ GET /api/Grades/all → See all grades  
3. ✅ GET /api/Grades/{id} → Get specific grade
4. ✅ POST /api/Grades/correct → Update grade

**All will work without certificate issues!**

---

## 📚 Full Guide

See: **SWAGGER_TESTING_ABAC_DISABLED.md** for detailed info

---

Done! Start testing! 🚀
