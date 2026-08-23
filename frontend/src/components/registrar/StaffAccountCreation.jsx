import React, { useEffect, useState } from 'react';
import { createStaffAccount, fetchAcademicPrograms } from '../../services/api';

const initialForm = { staffId: '', firstName: '', middleName: '', lastName: '', email: '', role: 'faculty', programCode: '', facultyType: 'Regular', password: '' };

const StaffAccountCreation = () => {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [programs, setPrograms] = useState([]);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    fetchAcademicPrograms()
      .then((response) => {
        const items = Array.isArray(response?.data) ? response.data : [];
        setPrograms(items);
        setForm((current) => ({ ...current, programCode: current.programCode || items[0]?.programCode || '' }));
      })
      .catch((error) => setNotice({ type: 'error', message: error.message }));
  }, []);

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setNotice(null);
    try {
      const response = await createStaffAccount(form);
      setNotice({ type: 'success', message: `${response?.data?.role === 'faculty' ? 'Faculty' : 'Chairperson'} account created for ${response?.data?.email}.` });
      setForm({ ...initialForm, programCode: form.programCode });
    } catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setSaving(false); }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5"><h2 className="text-xl font-bold text-[#003366]">Create Faculty or Chairperson Account</h2><p className="mt-1 text-sm text-slate-500">Accounts are approved immediately and receive a Fabric identity. Passwords are never written to logs or the blockchain.</p></div>
      {notice ? <div className={`mb-4 rounded-lg p-3 text-sm ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{notice.message}</div> : null}
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm font-semibold text-slate-700">Account Role<select value={form.role} onChange={(e) => update('role', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"><option value="faculty">Faculty</option><option value="department_admin">Chairperson / Department Head</option></select></label>
        <label className="text-sm font-semibold text-slate-700">Institutional ID<input required value={form.staffId} onChange={(e) => update('staffId', e.target.value)} placeholder="FAC-2026-001" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
        <label className="text-sm font-semibold text-slate-700">Email<input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
        <label className="text-sm font-semibold text-slate-700">First Name<input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
        <label className="text-sm font-semibold text-slate-700">Middle Name<input value={form.middleName} onChange={(e) => update('middleName', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
        <label className="text-sm font-semibold text-slate-700">Last Name<input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">Academic Program<select required value={form.programCode} onChange={(e) => update('programCode', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"><option value="">Select program</option>{programs.map((program) => <option key={program.programId} value={program.programCode}>{program.programCode} — {program.programName}</option>)}</select></label>
        {form.role === 'faculty' ? <label className="text-sm font-semibold text-slate-700">Faculty Type<select value={form.facultyType} onChange={(e) => update('facultyType', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"><option>Regular</option><option>Part-time</option><option>Full-time</option></select></label> : <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Only one active Chairperson is allowed per academic program.</div>}
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">Temporary Password<input required minLength="8" type="password" autoComplete="new-password" value={form.password} onChange={(e) => update('password', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /><span className="mt-1 block text-xs font-normal text-slate-500">At least 8 characters. The user can use Forgot Password from Login.</span></label>
        <div className="flex items-end"><button type="submit" disabled={saving} className="w-full rounded-lg bg-[#003366] px-4 py-2.5 font-bold text-white hover:bg-[#00264d] disabled:opacity-50">{saving ? 'Creating Account…' : 'Create Account'}</button></div>
      </form>
    </section>
  );
};

export default StaffAccountCreation;
