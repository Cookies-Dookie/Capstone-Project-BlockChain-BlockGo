import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  assignStudent,
  fetchApprovedStudents,
  fetchCurriculums,
  registrarBulkEnrollStudents,
  registrarBulkUpdateStudents,
} from '../../services/api';
import { buildCsvContent, downloadCsvFile } from '../../utils/studentSectioningHelpers';
import { downloadTemplateButtonClass } from '../shared/downloadButtonStyles';

const currentSchoolYear = () => {
  const now = new Date();
  const start = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
};

const initialSemester = () => (new Date().getMonth() >= 5 ? 'FIRST' : 'SECOND');

const StudentEnrollmentManagement = ({ programs = [] }) => {
  const [form, setForm] = useState({
    department: programs[0] || '',
    schoolYear: currentSchoolYear(),
    semester: initialSemester(),
    yearLevel: '1',
    section: '1-1',
    curriculumId: '',
  });
  const [file, setFile] = useState(null);
  const [students, setStudents] = useState([]);
  const [curricula, setCurricula] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [studentsResponse, curriculumResponse] = await Promise.all([
        fetchApprovedStudents(),
        fetchCurriculums('PUBLISHED'),
      ]);
      setStudents(studentsResponse?.students || studentsResponse?.data || []);
      setCurricula(curriculumResponse?.data || []);
    } catch (error) {
      setResult({ status: 'Error', message: error.message || 'Enrollment data could not be loaded.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const matchingCurricula = useMemo(
    () => curricula.filter((curriculum) =>
      [curriculum.programName, curriculum.programCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase() === String(form.department).toLowerCase())
    ),
    [curricula, form.department]
  );

  useEffect(() => {
    if (matchingCurricula.some((item) => String(item.curriculumId) === String(form.curriculumId))) return;
    setForm((current) => ({
      ...current,
      curriculumId: matchingCurricula[0]?.curriculumId ? String(matchingCurricula[0].curriculumId) : '',
    }));
  }, [matchingCurricula, form.curriculumId]);

  const updateField = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'yearLevel') next.section = `${value}-1`;
      return next;
    });
  };

  const validateContext = () => {
    if (!form.department) return 'Select an academic program.';
    if (!/^\d{4}-\d{4}$/.test(form.schoolYear)) return 'School year must use YYYY-YYYY.';
    const [start, end] = form.schoolYear.split('-').map(Number);
    if (end !== start + 1) return 'School year must contain consecutive years.';
    if (!/^[1-4]$/.test(form.yearLevel)) return 'Year level must be from 1 to 4.';
    if (!new RegExp(`^${form.yearLevel}-\\d+$`).test(form.section)) return `Section must use ${form.yearLevel}-number.`;
    return '';
  };

  const enrollmentPayload = () => ({
    curriculumId: form.curriculumId || undefined,
    schoolYear: form.schoolYear,
    semester: form.semester,
    yearLevel: form.yearLevel,
    section: form.section,
  });

  const upload = async (mode) => {
    const validationError = validateContext();
    if (validationError) return setResult({ status: 'Error', message: validationError });
    if (!file) return setResult({ status: 'Error', message: 'Choose a CSV or XLSX file first.' });
    if (file.size > 10 * 1024 * 1024) return setResult({ status: 'Error', message: 'Enrollment files cannot exceed 10 MB.' });

    setSaving(true); setResult(null);
    try {
      const response = mode === 'update'
        ? await registrarBulkUpdateStudents(file, form.department, enrollmentPayload())
        : await registrarBulkEnrollStudents(file, form.department, enrollmentPayload());
      setResult(response);
      await load();
    } catch (error) {
      setResult({ status: 'Error', message: error.message || 'Enrollment upload failed.' });
    } finally {
      setSaving(false);
    }
  };

  const enrollSelectedStudent = async () => {
    const validationError = validateContext();
    if (validationError) return setResult({ status: 'Error', message: validationError });
    if (!selectedStudentId) return setResult({ status: 'Error', message: 'Select a student account.' });
    setSaving(true); setResult(null);
    try {
      const response = await assignStudent(Number(selectedStudentId), {
        Department: form.department,
        Section: form.section,
        YearLevel: form.yearLevel,
        SchoolYear: form.schoolYear,
        Semester: form.semester,
        CurriculumId: form.curriculumId ? Number(form.curriculumId) : null,
      });
      setResult(response);
      await load();
    } catch (error) {
      setResult({ status: 'Error', message: error.message || 'Student enrollment failed.' });
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = () => {
    const curriculum = matchingCurricula.find((item) => String(item.curriculumId) === String(form.curriculumId));
    downloadCsvFile(buildCsvContent([
      ['student_id', 'first_name', 'last_name', 'middle_name', 'sex', 'email', 'number', 'address', 'birthday', 'department', 'year_level', 'section', 'school_year', 'semester', 'curriculum_version'],
      ['26-0001', 'Juan', 'Dela Cruz', 'Andres', 'Male', '26-0001@plv.edu.ph', '09123456789', 'Valenzuela City', '05/15/2005', form.department, form.yearLevel, form.section, form.schoolYear, form.semester, curriculum?.curriculumVersion || ''],
    ]), `student-enrollment-${form.schoolYear}.csv`);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-xl font-bold text-[#003366]">Official Student Enrollment</h3>
        <p className="mt-1 text-sm text-slate-500">Create or update student accounts, assign their academic period and section, and reference one published curriculum version.</p>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-semibold text-slate-700">Academic Program
            <select value={form.department} onChange={(event) => updateField('department', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
              {programs.map((program) => <option key={program} value={program}>{program}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">School Year
            <input value={form.schoolYear} onChange={(event) => updateField('schoolYear', event.target.value)} placeholder="2026-2027" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-semibold text-slate-700">Semester
            <select value={form.semester} onChange={(event) => updateField('semester', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
              <option value="FIRST">First Semester</option><option value="SECOND">Second Semester</option><option value="MIDYEAR">Midyear</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">Year Level
            <select value={form.yearLevel} onChange={(event) => updateField('yearLevel', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
              {[1, 2, 3, 4].map((year) => <option key={year} value={year}>{year}{year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th'} Year</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">Section
            <input value={form.section} onChange={(event) => updateField('section', event.target.value)} placeholder={`${form.yearLevel}-1`} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-semibold text-slate-700">Curriculum Version
            <select value={form.curriculumId} onChange={(event) => updateField('curriculumId', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
              <option value="">Latest published version (automatic)</option>
              {matchingCurricula.map((curriculum) => <option key={curriculum.curriculumId} value={curriculum.curriculumId}>{curriculum.curriculumVersion} · {curriculum.curriculumName}</option>)}
            </select>
          </label>
        </div>

        {matchingCurricula.length === 0 ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No published curriculum exists for this program yet. Enrollment can continue, but the Registrar must assign a published version later.</p> : null}
      </section>

      {result ? <section className={`rounded-xl border p-4 text-sm ${result.status === 'Error' || result.failed > 0 ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}><p className="font-bold">{result.status || 'Result'}</p><p>{result.message}</p>{typeof result.successful !== 'undefined' ? <p className="mt-1">Successful: {result.successful} · Failed: {result.failed || 0}</p> : null}{result.errors?.length ? <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5">{result.errors.slice(0, 20).map((item, index) => <li key={`${item.row || index}-${item.identifier || ''}`}>Row {item.row || '?'} ({item.identifier || 'Unknown'}): {item.reason}</li>)}</ul> : null}</section> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="font-bold text-[#003366]">Administrative Upload</h4>
          <p className="mt-1 text-sm text-slate-500">New accounts require student ID, name, and real birthday. Existing accounts may be re-enrolled with student ID only.</p>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Enrollment File
            <input type="file" accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm font-normal" />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={downloadTemplate} className={downloadTemplateButtonClass}>Download Template</button>
            <button type="button" disabled={saving} onClick={() => upload('enroll')} className="rounded-xl bg-[#003366] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Upload & Enroll'}</button>
            <button type="button" disabled={saving} onClick={() => upload('update')} className="rounded-xl border border-[#003366] px-5 py-3 text-sm font-bold text-[#003366] disabled:opacity-50">Update Existing</button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="font-bold text-[#003366]">Manual Enrollment</h4>
          <p className="mt-1 text-sm text-slate-500">Assign the selected period, section, and curriculum to an existing student account.</p>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Student Account
            <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
              <option value="">Select student</option>
              {students.map((student) => <option key={student.id} value={student.id}>{student.studentno || student.email} · {student.fullname}</option>)}
            </select>
          </label>
          <button type="button" disabled={saving || loading} onClick={enrollSelectedStudent} className="mt-4 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Save Student Enrollment</button>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h4 className="font-bold text-[#003366]">Current Student Enrollments</h4><button type="button" onClick={load} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold">Refresh</button></div>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="bg-[#003366] text-white"><th className="px-4 py-3">Student</th><th className="px-4 py-3">Program / Section</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Curriculum</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{students.map((student) => <tr key={student.id} className="border-b"><td className="px-4 py-3"><span className="block font-semibold">{student.fullname}</span><span className="text-xs text-slate-500">{student.studentno}</span></td><td className="px-4 py-3">{student.department || 'Unassigned'}<span className="block text-xs text-slate-500">Year {student.yearLevel || '—'} · {student.section || 'No section'}</span></td><td className="px-4 py-3">{student.schoolYear || '—'}<span className="block text-xs text-slate-500">{student.semester || '—'}</span></td><td className="px-4 py-3">{student.curriculumVersion || 'Not assigned'}</td><td className="px-4 py-3">{student.enrollmentStatus || student.assignmentStatus || 'Unassigned'}</td></tr>)}{!loading && students.length === 0 ? <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No active student accounts found.</td></tr> : null}</tbody></table></div>
      </section>
    </div>
  );
};

export default StudentEnrollmentManagement;
