import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { addCurriculumSubject, createCurriculum, fetchAcademicPrograms, fetchCurriculums, removeCurriculumSubject, submitCurriculum, updateCurriculum, updateCurriculumSubject } from '../../services/api';

const emptyCurriculum = { programCode: '', curriculumCode: '', curriculumName: '', curriculumVersion: '', schoolYear: '' };
const emptySubject = { subjectCode: '', subjectTitle: '', units: 3, lectureHours: 3, laboratoryHours: 0, prerequisite: '', yearLevel: 1, semester: 'FIRST', subjectType: '' };
const yearLabels = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' };
const semesterLabels = { FIRST: 'First Semester', SECOND: 'Second Semester', MIDYEAR: 'Summer / Midyear' };

const CurriculumBuilder = ({ department = '' }) => {
  const [programs, setPrograms] = useState([]);
  const [curricula, setCurricula] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [curriculumForm, setCurriculumForm] = useState(emptyCurriculum);
  const [subjectForm, setSubjectForm] = useState(emptySubject);
  const [editingSubjectId, setEditingSubjectId] = useState(null);
  const [activeYear, setActiveYear] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [programResponse, curriculumResponse] = await Promise.all([fetchAcademicPrograms(), fetchCurriculums()]);
      const availablePrograms = Array.isArray(programResponse?.data) ? programResponse.data : [];
      const availableCurricula = Array.isArray(curriculumResponse?.data) ? curriculumResponse.data : [];
      const normalizedDepartment = department.trim().toLowerCase();
      const ownedPrograms = normalizedDepartment
        ? availablePrograms.filter((program) => program.programName.toLowerCase() === normalizedDepartment || program.programCode.toLowerCase() === normalizedDepartment)
        : availablePrograms;
      setPrograms(ownedPrograms); setCurricula(availableCurricula);
      setSelectedId((current) => current || String(availableCurricula[0]?.curriculumId || ''));
      setCurriculumForm((current) => ({ ...current, programCode: current.programCode || ownedPrograms[0]?.programCode || '' }));
    } catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setLoading(false); }
  }, [department]);
  useEffect(() => { load(); }, [load]);

  const selected = curricula.find((curriculum) => String(curriculum.curriculumId) === String(selectedId));
  const editable = selected && ['DRAFT', 'RETURNED'].includes(selected.status);
  const subjects = selected?.subjects || [];

  const create = async (event) => {
    event.preventDefault(); setSaving(true); setNotice(null);
    try { const response = await createCurriculum(curriculumForm); setNotice({ type: 'success', message: 'Curriculum draft created.' }); setCurriculumForm((current) => ({ ...emptyCurriculum, programCode: current.programCode })); await load(); setSelectedId(String(response?.data?.curriculumId || '')); }
    catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setSaving(false); }
  };

  const saveMetadata = async () => {
    if (!selected) return;
    setSaving(true); setNotice(null);
    try { await updateCurriculum(selected.curriculumId, { curriculumCode: selected.curriculumCode, curriculumName: selected.curriculumName, curriculumVersion: selected.curriculumVersion, schoolYear: selected.schoolYear }); setNotice({ type: 'success', message: 'Draft metadata saved.' }); await load(); }
    catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setSaving(false); }
  };

  const saveSubject = async (event) => {
    event.preventDefault(); if (!selected) return;
    setSaving(true); setNotice(null);
    try {
      if (editingSubjectId) await updateCurriculumSubject(selected.curriculumId, editingSubjectId, subjectForm);
      else await addCurriculumSubject(selected.curriculumId, subjectForm);
      setNotice({ type: 'success', message: editingSubjectId ? 'Subject updated.' : 'Subject added.' }); setSubjectForm({ ...emptySubject, yearLevel: activeYear }); setEditingSubjectId(null); await load();
    } catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setSaving(false); }
  };

  const editSubject = (subject) => { setActiveYear(Number(subject.yearLevel)); setEditingSubjectId(subject.subjectId); setSubjectForm({ subjectCode: subject.subjectCode, subjectTitle: subject.subjectTitle, units: subject.units, lectureHours: subject.lectureHours, laboratoryHours: subject.laboratoryHours, prerequisite: subject.prerequisite || '', yearLevel: subject.yearLevel, semester: subject.semester, subjectType: subject.subjectType || '' }); };
  const removeSubject = async (subject) => { if (!window.confirm(`Remove ${subject.subjectCode} from this draft?`)) return; try { await removeCurriculumSubject(selected.curriculumId, subject.subjectId); setNotice({ type: 'success', message: 'Subject removed.' }); await load(); } catch (error) { setNotice({ type: 'error', message: error.message }); } };
  const submit = async () => { if (selected?.status !== 'DRAFT') { setNotice({ type: 'error', message: 'Revise and save the returned curriculum before resubmitting it.' }); return; } if (!window.confirm('Submit this curriculum to the Registrar? Editing will be locked until it is returned.')) return; setSaving(true); try { await submitCurriculum(selected.curriculumId); setNotice({ type: 'success', message: 'Curriculum submitted for Registrar approval.' }); await load(); } catch (error) { setNotice({ type: 'error', message: error.message }); } finally { setSaving(false); } };
  const updateSelected = (field, value) => setCurricula((current) => current.map((curriculum) => curriculum.curriculumId === selected.curriculumId ? { ...curriculum, [field]: value } : curriculum));
  const prerequisiteOptions = useMemo(() => subjects.filter((subject) => subject.subjectId !== editingSubjectId), [subjects, editingSubjectId]);
  const activeYearTotal = subjects.filter((subject) => Number(subject.yearLevel) === activeYear).reduce((sum, subject) => sum + Number(subject.units), 0);

  return <div className="space-y-6">
    {notice ? <div className={`rounded-lg p-3 text-sm ${notice.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{notice.message}</div> : null}
    {selected ? <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm font-bold text-[#003366]">{yearLabels[activeYear]} Total Units: {activeYearTotal}</div> : null}
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-bold text-[#003366]">Create Curriculum Proposal</h2><p className="mb-4 mt-1 text-sm text-slate-500">Your assigned program is validated by the server. Registrar approval is mandatory before publication.</p><form onSubmit={create} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><select required value={curriculumForm.programCode} onChange={(e) => setCurriculumForm({ ...curriculumForm, programCode: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2"><option value="">Select program</option>{programs.map((program) => <option key={program.programId} value={program.programCode}>{program.programCode} — {program.programName}</option>)}</select><input required placeholder="Curriculum code" value={curriculumForm.curriculumCode} onChange={(e) => setCurriculumForm({ ...curriculumForm, curriculumCode: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><input required placeholder="Curriculum name" value={curriculumForm.curriculumName} onChange={(e) => setCurriculumForm({ ...curriculumForm, curriculumName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><input required placeholder="Version, e.g. BSIT-2026" value={curriculumForm.curriculumVersion} onChange={(e) => setCurriculumForm({ ...curriculumForm, curriculumVersion: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><div className="flex gap-2"><input placeholder="School year" value={curriculumForm.schoolYear} onChange={(e) => setCurriculumForm({ ...curriculumForm, schoolYear: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2" /><button disabled={saving} className="rounded-lg bg-[#003366] px-4 py-2 font-bold text-white">Create</button></div></form></section>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">{loading ? <p className="py-8 text-center text-slate-500">Loading curriculum proposals…</p> : curricula.length === 0 ? <p className="py-8 text-center text-slate-500">No curriculum proposal exists for your program yet.</p> : <><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2">{curricula.map((curriculum) => <option key={curriculum.curriculumId} value={curriculum.curriculumId}>{curriculum.curriculumVersion} — {curriculum.status}</option>)}</select><span className={`rounded-full px-3 py-1 text-xs font-bold ${editable ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'}`}>{selected?.status}</span></div>{selected?.registrarComment ? <div className="mb-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4"><p className="font-bold text-amber-900">Registrar Comment</p><p className="text-sm text-amber-800">{selected.registrarComment}</p></div> : null}<div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input disabled={!editable} value={selected?.curriculumCode || ''} onChange={(e) => updateSelected('curriculumCode', e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /><input disabled={!editable} value={selected?.curriculumName || ''} onChange={(e) => updateSelected('curriculumName', e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /><input disabled={!editable} value={selected?.curriculumVersion || ''} onChange={(e) => updateSelected('curriculumVersion', e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /><div className="flex gap-2"><input disabled={!editable} value={selected?.schoolYear || ''} onChange={(e) => updateSelected('schoolYear', e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" />{editable ? <button type="button" onClick={saveMetadata} className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-bold text-white">Save</button> : null}</div></div><div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{[1, 2, 3, 4].map((year) => <button key={year} onClick={() => { setActiveYear(year); setSubjectForm((current) => ({ ...current, yearLevel: year })); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${activeYear === year ? 'bg-[#003366] text-white' : 'bg-slate-100 text-slate-700'}`}>{yearLabels[year]}</button>)}</div>
      {['FIRST', 'SECOND', 'MIDYEAR'].map((semester) => { const rows = subjects.filter((subject) => Number(subject.yearLevel) === activeYear && subject.semester === semester); const total = rows.reduce((sum, subject) => sum + Number(subject.units), 0); return <div key={semester} className="mb-6"><div className="mb-2 flex justify-between"><h3 className="font-bold">{semesterLabels[semester]}</h3><span className="text-sm font-semibold text-slate-600">Semester Units: {total}</span></div><div className="overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Units</th><th className="px-3 py-2">Prerequisite</th>{editable ? <th className="px-3 py-2">Actions</th> : null}</tr></thead><tbody>{rows.map((subject) => <tr key={subject.subjectId} className="border-t border-slate-100"><td className="px-3 py-2 font-bold text-[#003366]">{subject.subjectCode}</td><td className="px-3 py-2">{subject.subjectTitle}</td><td className="px-3 py-2">{subject.units}</td><td className="px-3 py-2">{subject.prerequisite || 'None'}</td>{editable ? <td className="px-3 py-2"><button onClick={() => editSubject(subject)} className="mr-3 text-xs font-bold text-blue-700">Edit</button><button onClick={() => removeSubject(subject)} className="text-xs font-bold text-red-600">Remove</button></td> : null}</tr>)}{rows.length === 0 ? <tr><td colSpan="5" className="p-5 text-center text-slate-400">No subjects configured.</td></tr> : null}</tbody></table></div></div>; })}
      {editable ? <form onSubmit={saveSubject} className="grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-5"><input required placeholder="Subject code" value={subjectForm.subjectCode} onChange={(e) => setSubjectForm({ ...subjectForm, subjectCode: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><input required placeholder="Subject title" value={subjectForm.subjectTitle} onChange={(e) => setSubjectForm({ ...subjectForm, subjectTitle: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><input required type="number" min="0.01" step="0.01" value={subjectForm.units} onChange={(e) => setSubjectForm({ ...subjectForm, units: Number(e.target.value) })} className="rounded-lg border border-slate-300 px-3 py-2" /><select value={subjectForm.semester} onChange={(e) => setSubjectForm({ ...subjectForm, semester: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2">{Object.entries(semesterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={subjectForm.prerequisite} onChange={(e) => setSubjectForm({ ...subjectForm, prerequisite: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2"><option value="">No prerequisite</option>{prerequisiteOptions.map((subject) => <option key={subject.subjectId} value={subject.subjectCode}>{subject.subjectCode}</option>)}</select><input type="number" min="0" step="0.5" placeholder="Lecture hours" value={subjectForm.lectureHours} onChange={(e) => setSubjectForm({ ...subjectForm, lectureHours: Number(e.target.value) })} className="rounded-lg border border-slate-300 px-3 py-2" /><input type="number" min="0" step="0.5" placeholder="Laboratory hours" value={subjectForm.laboratoryHours} onChange={(e) => setSubjectForm({ ...subjectForm, laboratoryHours: Number(e.target.value) })} className="rounded-lg border border-slate-300 px-3 py-2" /><input placeholder="Category" value={subjectForm.subjectType} onChange={(e) => setSubjectForm({ ...subjectForm, subjectType: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><button disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white">{editingSubjectId ? 'Update Subject' : '+ Add Subject'}</button>{editingSubjectId ? <button type="button" onClick={() => { setEditingSubjectId(null); setSubjectForm({ ...emptySubject, yearLevel: activeYear }); }} className="rounded-lg border border-slate-300 px-4 py-2 font-bold">Cancel Edit</button> : null}</form> : null}<div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><span className="font-bold text-[#003366]">Overall Units: {selected?.totalUnits ?? subjects.reduce((sum, subject) => sum + Number(subject.units), 0)}</span>{editable ? <button onClick={submit} disabled={saving} className="rounded-lg bg-emerald-700 px-5 py-2.5 font-bold text-white">Submit to Registrar</button> : <p className="text-sm text-slate-500">This version is read-only while under review or after approval.</p>}</div></>}</section>
  </div>;
};

export default CurriculumBuilder;
