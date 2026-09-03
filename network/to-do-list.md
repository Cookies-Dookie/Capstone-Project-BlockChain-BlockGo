## to do:
    Student can see their blockchain transactions (only visible to them | this include integration of display in frontend.) 
    Including the hash value per transaction
    Add the function wherein students can see their past grades whenever it is midyear or finals from 1st to 4th    The subject code and professor should be also linked in the blockchain together with the current blockchain settings (currently blockchain stores grade only)
    - registrar should be the one who creates account of student, faculty and chairperson. 
    (there is an existing function in the system which is creation of student account, just add faculty and chairperson)
    - remove registration/sign up in the login page ui
    - Add a manual register acc of faculty and dept head (dept head is distinct per course / dept, refer on the existing list of course and department) on the side of registrar so we can now freely remove the register acc on the side of login page. But make the reset password still works, assuming the account is registered by the registrar
    - add registrar account creation in system admin frontend this also include the function in the backend and in blockchain.
        - Give system admin the ability to modify registrar account access (changing the email and password) but retain the ability of the registrar to create accounts for students, dept head and faculty. Add also the function of chat to system admin but between only system admin and registrar
    - add a put curriculum checklist in a per year of a course dept like if the 1st year have new curriculum checklist for them the chairperson or dept admin will put
            example 
            CHAIRPERSON / DEPARTMENT ADMIN
              │
              ▼
      Select Academic Program
          Example: BSIT
              │
              ▼
     Curriculum Checklist
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
  1st Year  2nd Year  3rd Year  4th Year
     │
     ├── 1st Semester
     │     ├── Subject
     │     ├── Subject
     │     └── Subject
     │
     └── 2nd Semester
           ├── Subject
           ├── Subject
           └── Subject
              │
              ▼
       Publish Checklist
              │
       ┌──────┴──────┐
       ▼             ▼
    STUDENT        FACULTY
       │             │
View curriculum   View curriculum
assigned to them  related to their
                  assigned program/
                  students/sections

The important idea is that the Chairperson creates and manages the checklist, while Faculty and Students only consume/view the appropriate checklist assigned to them.
## take note the chairperson need the approval of registrar for new curriculum checklist
# Faculty should normally be read-only for this feature.
For example, the Chairperson could create:
Program: BS Information Technology

1st Year
 ├── First Semester
 │   ├── IT 101
 │   ├── IT 102
 │   ├── GE 101
 │   └── PE 1
 │
 └── Second Semester
     ├── IT 103
     ├── IT 104
     ├── GE 102
     └── PE 2

2nd Year
 ├── First Semester
 └── Second Semester

3rd Year
 ├── First Semester
 └── Second Semester

4th Year
 ├── First Semester
 └── Second Semester
1. Create Curriculum Checklist data structure

    Curriculum ID
    Program/Course, e.g. BSIT
    Curriculum name
    School/curriculum year if needed
    Status: DRAFT, PUBLISHED, ARCHIVED
    Created by Department Admin/Chairperson
    Created date
    Updated date
2. Support the four year levels

    1st Year
    2nd Year
    3rd Year
    4th Year
3. Support semesters under each year level

    First Semester
    Second Semester
    Optional Summer/Midyear 
4. Create curriculum subject records

    Subject code
    Subject title
    Units
    Lecture units/hours if required
    Laboratory units/hours if required
    Prerequisite
    Year level
    Semester
    Program
    Subject type/category if needed
5. Create Registrar Curriculum Management Page

    View all curriculum checklists
    Create new curriculum checklist
    Select academic program/course
    Enter curriculum name/version, e.g. BSIT Curriculum 2026
    Configure 1st Year
    Configure 2nd Year
    Configure 3rd Year
    Configure 4th Year
    Add subjects under First Semester
    Add subjects under Second Semester
    Edit subject information
    Remove subjects
    Set prerequisite subjects
    Calculate total units
    Save curriculum as Draft
    Publish curriculum
    Archive previous curriculum
    View curriculum history/version
    example:
REGISTRAR
    │
    ▼
Create / Manage Curriculum
    │
    ▼
Select Program
Example: BSIT
    │
    ▼
Curriculum Version
Example: BSIT-2026
    │
    ├── 1st Year
    │   ├── 1st Semester
    │   └── 2nd Semester
    │
    ├── 2nd Year
    ├── 3rd Year
    └── 4th Year
           │
           ▼
        PUBLISH
           │
     ┌─────┼────────┐
     ▼     ▼        ▼
Department Faculty Student
  Admin
   View    View     View
   And for the student, recommended to view assigning a curriculum version
   example:
    Student: Juan Dela Cruz
    Program: BSIT
    Curriculum: BSIT-2026
6. Add Curriculum Builder UI

    Program selector at the top
    Tabs/sections for:
    1st Year
    2nd Year
    3rd Year
    4th Year
    Inside each year:
    First Semester
    Second Semester
    + Add Subject button
    Show total units per semester
    Show total units per year    
7. Add publishing rules

    Draft curriculum is visible only to Chairperson/Department Admin
    Published curriculum becomes available to Faculty and Students
    Prevent incomplete curriculum from being published if required
    Ask for confirmation before publishing
    Keep previously published versions instead of deleting them    
8. Connect curriculum to students

    Determine student's program
    Determine student's assigned curriculum
    Determine student's year level
    Student automatically sees the correct curriculum
    Student cannot edit curriculum    
9. Create Student Curriculum Checklist page

    Display program
    Display curriculum
    Display all four year levels
    Show subjects by semester
    Highlight student's current year
    Read-only access    
10. Connect curriculum to Faculty

    Determine faculty's assigned program/sections
    Allow faculty to view the relevant curriculum
    Faculty access is read-only
    Optionally highlight subjects currently handled by the faculty    

11. Create Faculty Curriculum Checklist page
    Program selector if faculty belongs to multiple programs
    Year-level selector
    Semester selector
    Subject list
    Read-only
13. Add permissions
    Chairperson / Department Admin → Create, Edit, Publish, Archive
    Faculty → View only
    Student → View only
    Prevent Faculty/Students from calling curriculum modification APIs    
14. Add validation

    No duplicate subject code in the same semester unless intentionally allowed
    Year must be 1–4
    Semester must be valid
    Units must be valid
    Program must exist
    Only authorized Department Admin/Chairperson can modify
    Prevent accidental deletion of a published curriculum    
15. Add audit logging (this will automatically execute)

    Curriculum created
    Subject added
    Subject edited
    Subject removed
    Curriculum published
    Curriculum archived
    Record who performed each action
## take note 
    - don't directly assign a separate copy of the curriculum to every student. Instead, assign a student to a curriculum ID/version:
    Student
   │
   ├── program_id = BSIT
   └── curriculum_id = BSIT-2026
                         │
                         ▼
                 Curriculum Checklist
                    ├── 1st Year
                    ├── 2nd Year
                    ├── 3rd Year
                    └── 4th Year    




#####
## PLAN 1
#####
You are working on the PLV BLOCKGO Grade Records Management System.

IMPORTANT:
DO NOT immediately modify code.

Before making any changes:
1. Scan the entire relevant codebase first.
2. Understand the existing architecture and current implementation.
3. Identify all existing frontend, backend, database, Hyperledger Fabric, authentication, RBAC, account management, curriculum, chat, audit logging, and grade-related functionality.
4. Reuse and extend existing functions whenever possible.
5. Do not create duplicate APIs, duplicate database models, duplicate components, or duplicate sources of truth.
6. Do not remove working functionality unless the requirement specifically says to remove it.
7. Maintain the existing UI design/style and project structure.
8. Analyze dependencies and possible effects before editing files.
9. Make changes incrementally.
10. After every major phase, run tests/build checks before proceeding.

==================================================
MAIN TASKS
==================================================

TASK 1 — STUDENT BLOCKCHAIN TRANSACTION HISTORY

Add a feature where students can see blockchain transactions associated ONLY with their own account.

This must include frontend integration.

Student should be able to see:
- Transaction ID
- Transaction hash
- Transaction type
- Student ID
- Subject code
- Subject title
- Professor/faculty
- Semester
- School year
- Term
- Grade
- Status
- Timestamp

Privacy requirement:
A student MUST NOT be able to retrieve another student's blockchain transactions.

Do not rely only on frontend hiding.

The backend must use the authenticated student's identity from the JWT/session.

Example:

Student A → Student A transactions = ALLOWED
Student A → Student B transactions = DENIED

Add a Student Portal section/page such as:

Blockchain Transactions

Suggested columns:
- Date
- Transaction Type
- Subject Code
- Professor
- Term
- Grade
- Transaction Hash
- Status

Hash may be shortened visually:

a83f41...b78d92

But student must have:
- View Full Hash
- Copy Hash

Do not expose private blockchain records of other users.


==================================================
TASK 2 — EXTEND BLOCKCHAIN GRADE DATA
==================================================

The current blockchain implementation mainly stores the grade.

Extend the existing chaincode/ledger record instead of replacing it.

Grade blockchain records should also contain:
    - but before that check the main.go first.
- student_id
- subject_code
- subject_title
- faculty_id
- professor_name
- program
- section
- year_level
- semester
- school_year
- term
- grade
- status
- submitted_by
- timestamp

Keep existing fields and maintain backward compatibility where necessary.

Do not break existing grade transactions.

Expected relationship:

Student
+
Subject
+
Professor
+
Academic Period
+
Grade
+
Blockchain Transaction ID / Hash


==================================================
TASK 3 — STUDENT HISTORICAL GRADES
==================================================

Students should be able to view their past grades from 1st Year through 4th Year.

Support:
- First Semester
- Second Semester
- Midterm/Midyear depending on the terminology already used by the current system
- Finals

IMPORTANT:
First inspect the existing system terminology.

If the project currently uses "midterm", do not introduce a conflicting "midyear" value unless the existing data model already supports it.

Suggested UI:

MY GRADES

1st Year
 ├── First Semester
 │    ├── Midterm
 │    └── Finals
 └── Second Semester
      ├── Midterm
      └── Finals

2nd Year
 ├── First Semester
 └── Second Semester

3rd Year
 ├── First Semester
 └── Second Semester

4th Year
 ├── First Semester
 └── Second Semester

Each grade should display:
- Subject Code
- Subject Name
- Professor
- Units
- Term
- Grade
- Status
- School Year
- Semester
- Blockchain Transaction ID / Hash

Historical records must be read-only.


==================================================
TASK 4 — REGISTRAR ACCOUNT CREATION
==================================================

Public/self-registration should no longer be used.

The Registrar will create accounts for:
- Students
- Faculty
- Chairperson / Department Head

There is ALREADY an existing Student account creation function.

DO NOT recreate the Student account creation system.

First find the existing Student creation flow and extend the same architecture to support:
- Faculty
- Chairperson / Department Head

Reuse:
- Validation
- Password handling
- Database logic
- Existing account services
- Existing role system
- Existing audit logging if applicable


==================================================
TASK 5 — REMOVE SIGN UP / REGISTRATION FROM LOGIN
==================================================

Remove public registration/sign-up controls from the Login UI.

Remove:
- Register
- Sign Up
- Create Account
or equivalent buttons/links.

The Login page should retain:

- Email/Username
- Password
- Login
- Forgot Password

IMPORTANT:
Do NOT break Forgot Password / Reset Password.

Accounts created by Registrar must still be able to use the existing password-reset process.


==================================================
TASK 6 — REGISTRAR CREATES FACULTY ACCOUNTS
==================================================

Add Faculty account creation to the Registrar frontend/backend.

Possible fields:

- Faculty ID
- First Name
- Middle Name
- Last Name
- Email
- Department
- Program/Course assignment
- Status
- Temporary password / activation state if existing system uses it

Reuse current user/account architecture.

Never store plaintext passwords in:
- Database
- Logs
- Blockchain
- Audit logs


==================================================
TASK 7 — REGISTRAR CREATES CHAIRPERSON / DEPT HEAD
==================================================

Add manual Chairperson / Department Head creation to the Registrar.

The Department Head must be assigned to an existing department/course.

DO NOT create another hardcoded program/department list if one already exists.

Find and reuse the existing list of:
- Courses
- Programs
- Departments

Department Heads are distinct per department/course.

Example:

Name: Maria Santos
Department: Information Technology
Program: BSIT
Role: CHAIRPERSON

Authorization example:

BSIT Chairperson → manage BSIT resources = ALLOWED

BSIT Chairperson → modify unrelated BSBA department resources = DENIED

unless explicitly assigned to both.


==================================================
TASK 8 — SYSTEM ADMIN CREATES REGISTRAR ACCOUNTS
==================================================

Add Registrar account creation and management to the System Admin frontend and backend.

System Admin should be able to:

- Create Registrar
- View Registrar accounts
- Activate Registrar
- Deactivate Registrar
- Change Registrar email
- Reset/change Registrar password
- Modify Registrar account access

IMPORTANT:
Editing Registrar credentials must NOT remove the Registrar role or their existing permissions.

Registrar must continue being able to create:
- Student
- Faculty
- Chairperson / Department Head


==================================================
TASK 9 — REGISTRAR ACCOUNT BLOCKCHAIN AUDIT
==================================================

Registrar account lifecycle events should also be auditable in blockchain if consistent with the existing project architecture.

DO NOT store:
- Password
- Password hash
- Temporary password
- Password-reset token
- JWT
- Authentication secret

on blockchain.

Blockchain may record events such as:

REGISTRAR_ACCOUNT_CREATED

with:
- registrar_id
- role
- status
- performed_by
- timestamp

And:

REGISTRAR_ACCOUNT_UPDATED

with:
- registrar_id
- changed_fields
- performed_by
- timestamp

Sensitive authentication information stays in the secure authentication/database layer.


==================================================
TASK 10 — SYSTEM ADMIN ↔ REGISTRAR CHAT
==================================================

Extend the EXISTING chat functionality.

Do not build an unrelated second chat system.

Add System Admin chat access specifically for:

SYSTEM ADMIN ↔ REGISTRAR

System Admin should be able to:
- Select Registrar
- View conversation
- Send messages
- Receive messages
- See timestamps
- See read/unread state if existing chat supports it

Registrar should see the corresponding System Admin conversation.

Enforce authorization so unrelated users cannot access these conversations.


==================================================
TASK 11 — CURRICULUM CHECKLIST
==================================================

Implement a curriculum checklist system.

IMPORTANT RESPONSIBILITY MODEL:

CHAIRPERSON / DEPARTMENT ADMIN:
- Creates curriculum proposal
- Edits draft
- Adds subjects
- Removes subjects
- Configures year levels
- Configures semesters
- Submits curriculum to Registrar for approval
- Receives Registrar comments
- Revises returned curriculum

REGISTRAR:
- Reviews curriculum
- Approves curriculum
- Returns/rejects curriculum with reason
- Publishes approved curriculum
- Archives old curriculum
- Views curriculum history/version

FACULTY:
- View only

STUDENT:
- View only


==================================================
CURRICULUM APPROVAL FLOW
==================================================

Required workflow:

CHAIRPERSON / DEPARTMENT ADMIN
             |
             v
       CREATE CURRICULUM
             |
             v
           DRAFT
             |
             v
     SUBMIT FOR APPROVAL
             |
             v
         REGISTRAR
             |
       +-----+-----+
       |           |
       v           v
    RETURN       APPROVE
       |           |
       v           v
  CHAIRPERSON     PUBLISH
    REVISES         |
                    v
          +---------+---------+
          |         |         |
          v         v         v
       STUDENT    FACULTY   CHAIRPERSON
        VIEW       VIEW       VIEW


Registrar approval is MANDATORY before publication.

Do not allow Chairperson to directly publish their own curriculum.


==================================================
TASK 12 — CURRICULUM DATA MODEL
==================================================

Create or extend a Curriculum model containing approximately:

- curriculum_id
- curriculum_code
- curriculum_name
- program_id
- program_code
- curriculum_version
- school_year
- status
- created_by
- created_at
- updated_at
- submitted_at
- reviewed_by
- reviewed_at
- published_at
- registrar_comment

Recommended statuses:

DRAFT
PENDING_APPROVAL
RETURNED
APPROVED
PUBLISHED
ARCHIVED

Valid normal transition:

DRAFT
  ↓
PENDING_APPROVAL
  ↓
APPROVED
  ↓
PUBLISHED

Return flow:

PENDING_APPROVAL
  ↓
RETURNED
  ↓
DRAFT


==================================================
TASK 13 — FOUR YEAR LEVELS
==================================================

Curriculum must support:

1st Year
2nd Year
3rd Year
4th Year

Prefer storing internally as:

1
2
3
4

and format labels on the frontend.


==================================================
TASK 14 — SEMESTERS
==================================================

Each year supports:

- First Semester
- Second Semester
- Optional Summer/Midyear

Reuse existing enums/constants if available.

Avoid free-form semester names.


==================================================
TASK 15 — CURRICULUM SUBJECT MODEL
==================================================

Each subject should contain:

- subject_id
- subject_code
- subject_title
- units
- lecture_hours if applicable
- laboratory_hours if applicable
- prerequisite
- year_level
- semester
- program_id
- curriculum_id
- subject_type/category if applicable

Example:

BSIT Curriculum 2026

1st Year
 ├── First Semester
 │   ├── IT 101
 │   ├── IT 102
 │   ├── GE 101
 │   └── PE 1
 │
 └── Second Semester
     ├── IT 103
     ├── IT 104
     ├── GE 102
     └── PE 2

2nd Year
 ├── First Semester
 └── Second Semester

3rd Year
 ├── First Semester
 └── Second Semester

4th Year
 ├── First Semester
 └── Second Semester


==================================================
TASK 16 — CHAIRPERSON CURRICULUM BUILDER UI
==================================================

Create Curriculum Builder functionality on the Chairperson / Department Admin portal.

Top-level fields:

- Program
- Curriculum Name
- Curriculum Version
- Status

Suggested UI:

[ 1st Year ] [ 2nd Year ] [ 3rd Year ] [ 4th Year ]

Inside each year:

FIRST SEMESTER

Subject Code
Subject Name
Units
Prerequisite
Actions

[ + Add Subject ]

Semester Total Units: XX


SECOND SEMESTER

Subject Code
Subject Name
Units
Prerequisite
Actions

[ + Add Subject ]

Semester Total Units: XX

Display:
- Semester total units
- Year total units
- Overall curriculum units

Draft actions:

- Save Draft
- Edit
- Add Subject
- Remove Subject
- Submit to Registrar

Once submitted, prevent uncontrolled edits until:
- Registrar returns it
or
- an explicit withdrawal workflow exists.


==================================================
TASK 17 — REGISTRAR CURRICULUM MANAGEMENT
==================================================

Create a Registrar Curriculum Management page.

Sections may include:

- All Curricula
- Pending Approval
- Published
- Archived

Pending curriculum should show:

- Program
- Curriculum Version
- Department
- Created By
- Submission Date
- Number of Subjects
- Total Units

Actions:

- View
- Approve
- Return for Revision

Return must require a reason.

Example:

Reason:
IT 302 prerequisite needs correction.

Approval flow:

Approve Curriculum
        ↓
Confirmation
        ↓
APPROVED
        ↓
Registrar publishes
        ↓
PUBLISHED

Registrar should also be able to:
- Archive old published curriculum
- View version history


==================================================
TASK 18 — CURRICULUM PUBLISHING VALIDATION
==================================================

A curriculum must NOT be published unless:

- Program exists
- Curriculum version exists
- Required subject information is complete
- Year levels are valid
- Semesters are valid
- Units are valid
- No unintended duplicate subject assignments
- Chairperson submitted it
- Registrar approved it

Ask for confirmation before publication.

Do not permanently delete old curricula.

Use ARCHIVED status instead.


==================================================
TASK 19 — STUDENT CURRICULUM ASSIGNMENT
==================================================

IMPORTANT:

DO NOT create a separate curriculum copy for every student.

Students should reference a curriculum ID/version.

Example:

Student
   |
   ├── program_id = BSIT
   |
   └── curriculum_id = BSIT-2026
                         |
                         v
                Curriculum Checklist
                    ├── 1st Year
                    ├── 2nd Year
                    ├── 3rd Year
                    └── 4th Year

Example:

Student: Juan Dela Cruz
Program: BSIT
Curriculum: BSIT-2026
Current Year Level: 2

Hundreds of students may reference the same curriculum definition.


==================================================
TASK 20 — STUDENT CURRICULUM PAGE
==================================================

Student access is read-only.

Display:

Program
Curriculum Name
Curriculum Version
Current Year

Allow viewing:

1st Year
2nd Year
3rd Year
4th Year

Organize subjects by semester.

Highlight the student's current year.

Students must NOT receive:
- Add
- Edit
- Remove
- Publish
- Archive
- Submit
controls.


==================================================
TASK 21 — FACULTY CURRICULUM PAGE
==================================================

Determine curriculum visibility using the Faculty's assigned program/sections.

Example:

Faculty:
Prof. Maria Santos

Assignments:
BSIT 2-1
BSIT 2-2

Faculty should see the relevant BSIT curriculum.

If Faculty belongs to multiple programs, provide a Program selector.

Faculty access remains READ-ONLY.

Optionally highlight subjects currently assigned to that Faculty.


==================================================
TASK 22 — CURRICULUM RBAC
==================================================

Enforce permissions on BOTH frontend and backend.

CHAIRPERSON:
- View = YES
- Create Draft = YES
- Edit Draft = YES
- Submit = YES
- Approve = NO
- Publish = NO
- Archive = NO

REGISTRAR:
- View = YES
- Review = YES
- Approve = YES
- Return = YES
- Publish = YES
- Archive = YES

FACULTY:
- View = YES
- Modify = NO

STUDENT:
- View = YES
- Modify = NO

Do not rely on hidden buttons.

Unauthorized direct API requests must also be rejected.


==================================================
TASK 23 — DEPARTMENT OWNERSHIP
==================================================

Chairperson may only create/manage curriculum for their assigned department/program.

Example:

BSIT Chairperson
→ Create BSIT curriculum = ALLOWED

BSIT Chairperson
→ Create BSBA curriculum = DENIED

Validate this server-side.


==================================================
TASK 24 — CURRICULUM VALIDATION
==================================================

Validate:

- Year level must be 1–4
- Semester must be valid
- Program must exist
- Curriculum version required
- Subject code required
- Subject title required
- Units valid
- Prerequisites valid
- No unintended duplicate subjects
- Valid department ownership
- Valid workflow status transition
- Only authorized user may modify


==================================================
TASK 25 — AUTOMATIC AUDIT LOGGING
==================================================

Curriculum actions must automatically create audit records.

Record events such as:

CURRICULUM_CREATED
CURRICULUM_UPDATED
SUBJECT_ADDED
SUBJECT_UPDATED
SUBJECT_REMOVED
CURRICULUM_SUBMITTED
CURRICULUM_RETURNED
CURRICULUM_APPROVED
CURRICULUM_PUBLISHED
CURRICULUM_ARCHIVED

Audit record should contain:

- actor_id
- actor_role
- action
- curriculum_id
- affected_record
- timestamp
- description when applicable

Reuse the existing audit logging system.


==================================================
TASK 26 — API DESIGN
==================================================

FIRST search for existing equivalent APIs.

Do not blindly create duplicate endpoints.

If none exist, conceptually support:

POST   /api/curriculums
GET    /api/curriculums
GET    /api/curriculums/:id
PUT    /api/curriculums/:id

POST   /api/curriculums/:id/subjects
PUT    /api/curriculums/:id/subjects/:subjectId
DELETE /api/curriculums/:id/subjects/:subjectId

POST   /api/curriculums/:id/submit
POST   /api/curriculums/:id/approve
POST   /api/curriculums/:id/return
POST   /api/curriculums/:id/publish
POST   /api/curriculums/:id/archive

Student:

GET /api/student/curriculum

Faculty:

GET /api/faculty/curriculums

Registrar:

GET /api/registrar/curriculums/pending

Use the project's existing naming conventions whenever possible.


==================================================
BLOCKCHAIN SECURITY RULES
==================================================

Good blockchain candidates:
- Grade submission
- Grade approval
- Grade revision
- Grade history
- Transaction verification
- Curriculum approval/publication event if appropriate
- Registrar account lifecycle audit if appropriate

DO NOT STORE ON BLOCKCHAIN:

- Plaintext passwords
- Password hashes
- JWT
- Reset tokens
- API keys
- Private encryption keys
- Session tokens
- Secrets


==================================================
PRESERVE EXISTING FUNCTIONALITY
==================================================

The following must continue working:

- Existing Student account creation
- Student login
- Faculty login
- Chairperson login
- Registrar login
- System Admin login
- Forgot Password
- Reset Password
- Grade encoding
- Chairperson grade approval
- Chairperson grade return
- Registrar workflow
- Student grade viewing
- Blockchain processing
- Audit logging
- Existing chat
- Existing Hyperledger Fabric network functionality

Do not solve one feature by breaking another.


==================================================
IMPLEMENTATION ORDER
==================================================

PHASE 1
SCAN AND ANALYZE THE CODEBASE

Identify:
- frontend files
- backend files
- routes
- controllers
- services
- DB schemas/models
- Hyperledger Fabric chaincode
- authentication
- RBAC/OBAC
- existing user creation
- password reset
- chat
- audit logs
- grade records
- program/department lists


PHASE 2
ACCOUNT MANAGEMENT

Implement:
System Admin → Registrar

Registrar →
- Student
- Faculty
- Chairperson


PHASE 3
LOGIN / AUTHENTICATION

Remove public registration.

Verify:
Forgot Password
Reset Password


PHASE 4
BLOCKCHAIN GRADE RECORD ENHANCEMENT

Add:
- subject information
- professor information
- academic period metadata

Maintain backward compatibility.


PHASE 5
STUDENT BLOCKCHAIN TRANSACTIONS


PHASE 6
STUDENT HISTORICAL GRADES


PHASE 7
SYSTEM ADMIN ↔ REGISTRAR CHAT


PHASE 8
CURRICULUM DATA MODEL


PHASE 9
CHAIRPERSON CURRICULUM BUILDER


PHASE 10
REGISTRAR APPROVAL AND PUBLICATION


PHASE 11
STUDENT CURRICULUM VIEW


PHASE 12
FACULTY CURRICULUM VIEW


PHASE 13
RBAC/OBAC + VALIDATION + AUDIT


PHASE 14
FULL INTEGRATION AND REGRESSION TESTING


==================================================
REQUIRED TESTS
==================================================

ACCOUNT TEST:

System Admin creates Registrar
→ Registrar logs in
→ Registrar resets password
→ System Admin updates Registrar email
→ Registrar logs in using new email
→ Registrar permissions remain intact


REGISTRAR → STUDENT TEST:

Registrar creates Student
→ Student logs in
→ Student password reset works


REGISTRAR → FACULTY TEST:

Registrar creates Faculty
→ Faculty logs in
→ Faculty password reset works


REGISTRAR → CHAIRPERSON TEST:

Registrar creates Chairperson
→ Correct department is assigned
→ Chairperson logs in
→ Other department access is denied


BLOCKCHAIN GRADE TEST:

Faculty submits grade
→ Student ID recorded
→ Subject code recorded
→ Professor recorded
→ Academic period recorded
→ Grade recorded
→ Fabric transaction generated
→ Student sees own transaction
→ Hash/transaction ID visible


PRIVACY TEST:

Student A → own transactions = SUCCESS

Student A → Student B transactions = DENIED


HISTORICAL GRADE TEST:

Student has records from Year 1–4
→ Can navigate all years
→ Can view semesters
→ Can view term
→ Professor visible
→ Subject code visible
→ Blockchain transaction visible


CURRICULUM TEST:

Chairperson creates BSIT-2026
        ↓
Adds subjects
        ↓
Saves DRAFT
        ↓
Student cannot see it
Faculty cannot see it
        ↓
Chairperson submits
        ↓
PENDING_APPROVAL
        ↓
Registrar reviews
        ↓
Registrar returns with reason
        ↓
Chairperson receives note
        ↓
Chairperson revises
        ↓
Resubmits
        ↓
Registrar approves
        ↓
Registrar publishes
        ↓
Student sees curriculum
Faculty sees curriculum


PERMISSION TEST:

Student edit curriculum → DENIED
Faculty edit curriculum → DENIED
Chairperson approve own curriculum → DENIED
Chairperson publish curriculum → DENIED
Registrar approve curriculum → ALLOWED
Registrar publish curriculum → ALLOWED


==================================================
FINAL CODEX INSTRUCTION
==================================================

DO NOT START CODING IMMEDIATELY.

Your FIRST RESPONSE must contain:

1. CODEBASE ANALYSIS
   - Existing relevant frontend files
   - Existing backend files
   - Existing database models/tables
   - Existing Hyperledger Fabric chaincode
   - Existing APIs
   - Existing authentication/RBAC
   - Existing account creation
   - Existing password reset
   - Existing chat
   - Existing audit system
   - Existing curriculum-related code if any

2. REUSE PLAN
   Clearly identify what existing functionality can be reused.

3. FILE CHANGE PLAN
   For every file you intend to:
   - modify
   - create
   - remove

   explain WHY.

4. DATA MODEL CHANGES

5. API CHANGES

6. BLOCKCHAIN / CHAINCODE CHANGES

7. FRONTEND CHANGES

8. SECURITY / RBAC CHANGES

9. TEST PLAN

Only AFTER completing this analysis should you begin modifying code.

When modifying:
- Work incrementally.
- Do not make unrelated refactors.
- Do not replace working code unnecessarily.
- Do not create duplicate logic.
- Use the backend/database as operational source of truth.
- Use Hyperledger Fabric for immutable records where required.
- Preserve backward compatibility where reasonable.
- Run tests/build checks after every major phase.
- If a test fails, analyze and fix the cause before continuing.
- At the end, report exactly which files changed and what was implemented.                    

## Additional
Student:
Registration of User Accounts 1
Display of Student Academic Profile
Triggering of Failure Notification
Enabling of Dynamic Flagging
Chat to Registrar (Additional)


Faculty:
Uploading of Multiple Grade Records 7
Addition of Individual Student Grades 8
Computation via Automated Grade Calculation 9
Filtering of Sections 6
Tracking of Encoding Progress 12
Display of Encoding Status Banners
Display of Faculty Profile
Display of Section Metadata
Exporting of Grade Summary 11
Management of Student Standing (Academic Status) 10


Chairperson:
Assignment of Academic Sections to Faculty 4
Oversight (All Faculty Progress)via Monitoring
Oversight of (Grade Encoded from faculty)Departmental Grades 13
Filtering of Student Status(Dropped, Flagged) (Additional)14
Receiving of Student List from Registrar(Additional) 3
Management of Grade Revision Workflow (Returning to faculty) 15
Attachment of Revision Notes
Submission via Final Validation 16


Registrar:
Enforcement of Access Control
Revocation of User Access
Viewing of Activity Logs
Retrieval of Immutable Audit Trail
Uploading via Administrative Submission (Uploading of Student List per Department) 2
Management of Encoding Period Control 5
Finalization and Distribution of Grades 17
Generation via Reporting and Documentation
Monitoring of Overview of Grade Encoding Process (Additional)
Reset of Encoding Season (Additional)

- ADMIN ACCOUNT (Including Access Tools)
- REPORTING TICKETING SYSTEM FOR REPORTING ERRORS TO ADMIN FROM REGISTRAR
- CHAT FUNCTION FOR ADMIN BUT LIMITED ONLY CHAT BETWEEN ADMIN AND REGISTRAR ONLY
- INTRUSION DETECTION TOOL FOR DETECTING UNWANTED ACCESS

## Middleware microservices architecture

- Keep `middleware-api` as the only public compatibility gateway so existing
  frontend and C# `/api/*` callers do not change.
- Run authentication/password reset, Fabric identity enrollment/revocation,
  ledger transactions, grade-file upload/mapping, and system settings as
  independently deployable services.
- Give every service its own health/readiness endpoint, metrics, resource
  limits, scaling policy where appropriate, and ClusterIP Service.
- Do not expose internal service endpoints through Ingress. Service-to-service
  calls must use the internal API key, and user calls must retain live
  JWT/account/RBAC validation.
- Preserve registrar-managed student enrollment as the operational source of
  truth. Account enrollment may create/ensure the student's Fabric identity,
  but must not create a second student or curriculum-assignment record.
- Preserve all existing public middleware paths and chaincode transaction names
  while assigning each path to exactly one service owner.