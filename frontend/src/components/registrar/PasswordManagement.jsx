import React, { useMemo, useState } from 'react';
import { resetManagedAccountPassword } from '../../services/api';
import PasswordResetRequests from './PasswordResetRequests';

const PasswordManagement = ({ students = [], faculties = [], departmentAdmins = [], onRefresh }) => {
  const [roleFilter, setRoleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const accounts = useMemo(() => {
    const byId = new Map();
    const add = (items, role, roleLabel) => items.forEach((account) => {
      if (!account?.id) return;
      byId.set(`${role}:${account.id}`, {
        ...account,
        key: `${role}:${account.id}`,
        role,
        roleLabel,
        name: account.fullname || account.fullName || account.email,
        accountCode: account.studentno || account.accountId || account.email,
      });
    });
    add(students, 'student', 'Student');
    add(faculties.filter((account) => !departmentAdmins.some((admin) => admin.id === account.id)), 'faculty', 'Faculty');
    add(departmentAdmins, 'department_admin', 'Department Administrator');
    return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [students, faculties, departmentAdmins]);

  const visibleAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return accounts.filter((account) =>
      (roleFilter === 'all' || account.role === roleFilter) &&
      (!query || [account.name, account.email, account.accountCode, account.department]
        .some((value) => String(value || '').toLowerCase().includes(query)))
    );
  }, [accounts, roleFilter, search]);

  const selected = accounts.find((account) => account.key === selectedId);

  const resetPassword = async (event) => {
    event.preventDefault();
    setNotice(null);
    if (!selected) return setNotice({ type: 'error', message: 'Select an account first.' });
    if (newPassword.length < 8 || newPassword.length > 128) return setNotice({ type: 'error', message: 'Password must be between 8 and 128 characters.' });
    if (newPassword !== confirmPassword) return setNotice({ type: 'error', message: 'The password confirmation does not match.' });
    if (!window.confirm(`Reset the password for ${selected.name} (${selected.roleLabel})?`)) return;

    setSaving(true);
    try {
      const response = await resetManagedAccountPassword(selected.id, newPassword);
      setNotice({ type: 'success', message: response?.message || `Password reset for ${selected.email}.` });
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'Unable to reset the password.' });
    } finally {
      setSaving(false);
    }
  };

  const noticeClass = notice?.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800';
  return <div className="space-y-6">
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-bold text-[#003366]">Manual Password Reset</h2><p className="mt-1 text-sm text-slate-500">Reset access for students, faculty, and department administrators. Their current password is not required.</p></div>
        <button type="button" onClick={onRefresh} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Refresh Accounts</button>
      </div>
      {notice ? <div className={`mt-4 rounded-lg p-3 text-sm ${noticeClass}`}>{notice.message}</div> : null}
      <form onSubmit={resetPassword} className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Account Type<select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setSelectedId(''); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"><option value="all">All allowed accounts</option><option value="student">Students</option><option value="faculty">Faculty</option><option value="department_admin">Department Administrators</option></select></label>
        <label className="text-sm font-semibold text-slate-700">Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, ID, email, or department" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
        <label className="text-sm font-semibold text-slate-700 lg:col-span-2">Account<select required value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"><option value="">Select an account</option>{visibleAccounts.map((account) => <option key={account.key} value={account.key}>{account.roleLabel} — {account.name} — {account.accountCode}</option>)}</select></label>
        <label className="text-sm font-semibold text-slate-700">New Password<input required minLength="8" maxLength="128" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
        <label className="text-sm font-semibold text-slate-700">Confirm New Password<input required minLength="8" maxLength="128" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />Show password while entering</label>
        <button disabled={saving || !selected} className="rounded-lg bg-[#003366] px-4 py-2.5 font-bold text-white disabled:opacity-50">{saving ? 'Resetting…' : 'Reset Selected Account Password'}</button>
      </form>
    </section>
    <PasswordResetRequests />
  </div>;
};

export default PasswordManagement;
