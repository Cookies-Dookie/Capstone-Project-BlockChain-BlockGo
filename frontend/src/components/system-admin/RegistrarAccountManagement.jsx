import React, { useCallback, useEffect, useState } from 'react';
import { createRegistrarAccount, fetchRegistrarAccounts, updateRegistrarAccount } from '../../services/api';

const emptyForm = { registrarId: '', fullName: '', email: '', password: '' };

const RegistrarAccountManagement = () => {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [edits, setEdits] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await fetchRegistrarAccounts(); setAccounts(Array.isArray(response?.data) ? response.data : []); }
    catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (event) => {
    event.preventDefault(); setSaving(true); setNotice(null);
    try {
      const response = await createRegistrarAccount(form);
      setNotice({ type: response?.data?.warning ? 'warning' : 'success', message: response?.data?.warning || 'Registrar account created successfully.' });
      setForm(emptyForm); await load();
    } catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setSaving(false); }
  };

  const saveChanges = async (account) => {
    const change = edits[account.id] || {};
    if (!change.email && !change.password) return;
    setSaving(true); setNotice(null);
    try {
      const response = await updateRegistrarAccount(account.id, { email: change.email || null, password: change.password || null });
      setNotice({ type: response?.data?.warning ? 'warning' : 'success', message: response?.data?.warning || 'Registrar access updated.' });
      setEdits((current) => ({ ...current, [account.id]: {} })); await load();
    } catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setSaving(false); }
  };

  const toggleActive = async (account) => {
    if (!window.confirm(`${account.isActive ? 'Deactivate' : 'Activate'} ${account.email}?`)) return;
    setSaving(true); setNotice(null);
    try { const response = await updateRegistrarAccount(account.id, { isActive: !account.isActive }); setNotice({ type: response?.data?.warning ? 'warning' : 'success', message: response?.data?.warning || `Registrar ${account.isActive ? 'deactivated' : 'activated'}.` }); await load(); }
    catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setSaving(false); }
  };

  const noticeClass = notice?.type === 'error' ? 'bg-red-50 text-red-700' : notice?.type === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800';
  return <div className="space-y-6">
    {notice ? <div className={`rounded-lg p-3 text-sm ${noticeClass}`}>{notice.message}</div> : null}
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-bold text-[#003366]">Create Registrar Account</h2><p className="mb-5 mt-1 text-sm text-slate-500">The Registrar role is fixed and cannot be removed when credentials change.</p><form onSubmit={create} className="grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">Registrar ID<input required value={form.registrarId} onChange={(e) => setForm({ ...form, registrarId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label><label className="text-sm font-semibold">Full Name<input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label><label className="text-sm font-semibold">Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label><label className="text-sm font-semibold">Temporary Password<input required minLength="8" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label><button disabled={saving} className="rounded-lg bg-[#003366] px-4 py-2.5 font-bold text-white disabled:opacity-50 md:col-span-2">{saving ? 'Saving…' : 'Create Registrar'}</button></form></section>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex justify-between"><div><h2 className="text-xl font-bold text-[#003366]">Registrar Access</h2><p className="text-sm text-slate-500">Change login email/password or activate/deactivate access.</p></div><button onClick={load} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold">Refresh</button></div>{loading ? <p className="py-8 text-center text-slate-500">Loading accounts…</p> : <div className="space-y-3">{accounts.map((account) => { const edit = edits[account.id] || {}; return <div key={account.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-[1fr_1fr_1fr_auto]"><div><p className="font-bold text-slate-800">{account.fullName}</p><p className="text-xs text-slate-500">{account.accountId} · Registrar</p><span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-semibold ${account.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>{account.isActive ? 'Active' : 'Deactivated'}</span></div><label className="text-xs font-semibold text-slate-600">New Email<input type="email" placeholder={account.email} value={edit.email || ''} onChange={(e) => setEdits({ ...edits, [account.id]: { ...edit, email: e.target.value } })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-slate-600">New Password<input type="password" minLength="8" placeholder="Leave unchanged" value={edit.password || ''} onChange={(e) => setEdits({ ...edits, [account.id]: { ...edit, password: e.target.value } })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label><div className="flex gap-2 lg:flex-col"><button disabled={saving} onClick={() => saveChanges(account)} className="rounded-lg bg-[#003366] px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Save</button><button disabled={saving} onClick={() => toggleActive(account)} className={`rounded-lg px-3 py-2 text-sm font-bold ${account.isActive ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>{account.isActive ? 'Deactivate' : 'Activate'}</button></div></div>; })}{accounts.length === 0 ? <p className="py-8 text-center text-slate-500">No Registrar accounts found.</p> : null}</div>}</section>
  </div>;
};

export default RegistrarAccountManagement;
