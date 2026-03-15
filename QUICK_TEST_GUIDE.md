# Quick Test Guide - Fabric CA Authentication Fix

## Build & Run

```powershell
cd client-app

# Clean and build
dotnet clean
dotnet build

# Set environment
$env:ASPNETCORE_ENVIRONMENT="Development"

# Run application
dotnet run
```

Expected output:
```
[HH:mm:ss INF] Application starting up...
[HH:mm:ss INF] Application configured successfully
[HH:mm:ss INF] Now listening on: http://localhost:5000
```

---

## Test 1: Student Registration (Should work now)

```bash
curl -X POST 'http://localhost:5000/api/Registrar_Registration/grant/1' \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "student_test@capstone.com",
    "password": "StudentPass123!@",
    "role": "student"
  }'
```

### Expected Success Response (200):
```json
{
  "status": "Success",
  "message": "Account student_test@capstone.com secured on Blockchain",
  "role": "student",
  "permissions": ["view_own_grades", "download_transcript"]
}
```

### Check Logs for:
```
[INF] Processing registration request for user: student_test@capstone.com
[INF] Assigned role: student with permissions: view_own_grades, download_transcript
[INF] ✓ Auth token generated successfully
[INF] Calling Fabric CA at https://localhost:7054
[INF] Fabric CA Response Status: OK
[INF] ✓ Fabric CA registration successful for user: student_test@capstone.com
[INF] ✓ Database record updated
```

---

## Test 2: Faculty Registration

```bash
curl -X POST 'http://localhost:5000/api/Registrar_Registration/grant/1' \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "prof_test@capstone.com",
    "password": "ProfPass123!@",
    "role": "prof"
  }'
```

### Expected Success Response (200):
```json
{
  "status": "Success",
  "message": "Account prof_test@capstone.com secured on Blockchain",
  "role": "faculty",
  "permissions": ["view_all_grades", "manage_student_grades", "submit_grades"]
}
```

---

## Test 3: Registrar Registration

```bash
curl -X POST 'http://localhost:5000/api/Registrar_Registration/grant/1' \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "registrar_test@capstone.com",
    "password": "RegistrarPass123!@",
    "role": "registrar"
  }'
```

### Expected Success Response (200):
```json
{
  "status": "Success",
  "message": "Account registrar_test@capstone.com secured on Blockchain",
  "role": "registrar",
  "permissions": ["full_admin", "manage_users", "manage_grades", "generate_reports"]
}
```

---

## Troubleshooting

### If you still get 401 "Authentication failure":

1. **Check admin keys exist:**
   ```powershell
   Test-Path "C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\network\fabric-ca\registrar\admin-user-key.pem"
   Test-Path "C:\Users\Carmela\Documents\GitHub\Capstone-Project-\For_Testing_Only_Capstone\network\fabric-ca\registrar\admin-user-cert.pem"
   ```

2. **Check Fabric CA is running:**
   ```bash
   docker ps | grep ca.registrar
   ```

3. **Check logs for specific error:**
   ```
   Look for: [ERR] Failed to generate auth token
   Look for: [ERR] Fabric CA returned Unauthorized
   ```

4. **Verify appsettings.Development.json:**
   - Ensure `AdminKeyPath` is present
   - Verify file paths are correct
   - Check for typos in configuration

### If you get "Private key not found":
- Development config is not being used
- Verify `$env:ASPNETCORE_ENVIRONMENT="Development"` is set
- Restart the application

---

## Database Prerequisites

Make sure Request ID 1 exists in database:

```sql
SELECT * FROM userrequests WHERE requestid = 1;
```

If not found, insert a test record:

```sql
INSERT INTO userrequests (requestid, email, fullname, role, department, createdat, requeststatus)
VALUES (1, 'test@capstone.com', 'Test User', 'student', 'IT', NOW(), 'PENDING');
```

---

## Log Levels

Current logs show:
- `[INF]` - Information (normal flow)
- `[WRN]` - Warnings (TLS disabled in dev)
- `[ERR]` - Errors (auth failures)

Enable debug logs by modifying `appsettings.json`:
```json
"LogLevel": {
  "Default": "Debug",
  "Microsoft.AspNetCore": "Information"
}
```

---

## Success Indicators

✅ Successful registration shows:
```
[INF] ✓ Auth token generated successfully
[INF] ✓ Fabric CA registration successful for user
[INF] ✓ Database record updated
[INF] HTTP POST /api/Registrar_Registration/grant/1 responded 200
```

❌ Failed registration shows:
```
[ERR] ❌ Fabric CA returned 401: {"errors":[{"code":20,"message":"Authentication failure"}]}
[ERR] HTTP POST /api/Registrar_Registration/grant/1 responded 401
```

---

## Next: Test Revocation

Once grant access is working, test revocation:
```bash
curl -X DELETE 'http://localhost:5000/api/Registrar_Registration/revoke/1' \
  -H 'Content-Type: application/json'
```

---

## Files Changed

1. `client-app/appsettings.Development.json` - Added AdminKeyPath
2. `client-app/Services/FabricCaAuthService.cs` - Fixed token generation
3. `client-app/Controllers/Registrar_RegistrationController.cs` - Added logging & fixed headers
