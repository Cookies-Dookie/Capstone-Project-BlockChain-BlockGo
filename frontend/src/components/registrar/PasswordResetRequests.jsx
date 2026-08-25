import React, { useCallback, useEffect, useState } from 'react';
import { fetchPasswordResetRequests } from '../../services/api';

const PasswordResetRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchPasswordResetRequests();
      setRequests(Array.isArray(response?.data) ? response.data : []);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load password reset requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return <div className="space-y-5">
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#003366]">Password Reset Requests</h2>
          <p className="mt-1 text-sm text-slate-500">Help approved users who did not receive their email OTP. Requests are retained for 24 hours.</p>
        </div>
        <button type="button" onClick={load} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Refresh</button>
      </div>
    </section>
    {error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
    {loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">Loading reset requests…</div> : requests.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">No password reset requests in the last 24 hours.</div> : <div className="space-y-3">{requests.map((request) => <article key={request.requestId} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-800">{request.email}</h3><p className="mt-1 text-xs text-slate-500">Requested {new Date(request.createdAt).toLocaleString()}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${request.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : request.status === 'USED' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>{request.status}</span></div><div className="mt-4 flex flex-wrap items-center gap-3"><span className="rounded-lg bg-blue-50 px-4 py-2 font-mono text-lg font-bold tracking-[0.3em] text-[#003366]">{request.otp}</span><span className="text-xs text-slate-500">Expires {new Date(request.expiresAt).toLocaleString()}</span></div></article>)}</div>}
  </div>;
};

export default PasswordResetRequests;
