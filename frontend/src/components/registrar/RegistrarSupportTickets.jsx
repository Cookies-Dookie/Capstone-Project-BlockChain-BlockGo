import React, { useCallback, useEffect, useState } from 'react';
import { createSupportTicket, fetchSupportSpecialists, fetchSupportTickets } from '../../services/api';
import SupportAssignmentSelect, { assignmentPayload } from '../shared/SupportAssignmentSelect';

const initialForm = { description: '', assignment: '' };

const RegistrarSupportTickets = () => {
  const [tickets, setTickets] = useState([]);
  const [specialists, setSpecialists] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketResponse, specialistResponse] = await Promise.all([fetchSupportTickets(), fetchSupportSpecialists()]);
      setTickets(Array.isArray(ticketResponse?.data) ? ticketResponse.data : []);
      setSpecialists(Array.isArray(specialistResponse?.data) ? specialistResponse.data : []);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    const assignment = assignmentPayload(form.assignment);
    if (!assignment) {
      setNotice({ type: 'error', message: 'Select the support specialist who should receive this ticket.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await createSupportTicket({ description: form.description, ...assignment });
      setForm(initialForm);
      setNotice({ type: 'success', message: 'Error report sent to the selected support destination.' });
      await load();
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {notice ? <div className={`rounded-lg p-3 text-sm ${notice.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{notice.message}</div> : null}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-[#003366]">Report a System Error</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">Select the appropriate technical specialist and describe the issue. Do not include passwords, tokens, or private keys.</p>
        <form onSubmit={submit} className="space-y-3">
          <SupportAssignmentSelect value={form.assignment} onChange={(assignment) => setForm({ ...form, assignment })} specialists={specialists} className="w-full rounded-lg border border-slate-300 px-3 py-2" ariaLabel="Support destination" />
          <textarea required minLength="10" maxLength="5000" rows="5" placeholder="Describe the error and the steps that caused it." value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          <button disabled={saving} className="rounded-lg bg-[#003366] px-5 py-2.5 font-bold text-white disabled:opacity-50">{saving ? 'Submitting…' : 'Submit Ticket'}</button>
        </form>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex justify-between"><h2 className="text-xl font-bold text-[#003366]">My Tickets</h2><button onClick={load} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold">Refresh</button></div>
        {loading ? <p className="py-6 text-center text-slate-500">Loading tickets…</p> : <div className="space-y-3">
          {tickets.map((ticket) => <article key={ticket.ticketId} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold text-slate-800">#{ticket.ticketId} · {ticket.title}</h3><span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800">{ticket.status}</span></div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{ticket.description}</p>
            <p className="mt-2 text-xs text-slate-500">{ticket.severity} · {new Date(ticket.createdAt).toLocaleString()}</p>
            {ticket.assignedSpecialistLabel ? <p className="mt-2 text-xs font-semibold text-indigo-700">Assigned to: {ticket.assignedSpecialistLabel}</p> : null}
            {ticket.adminResponse ? <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><strong>System Administrator:</strong> {ticket.adminResponse}</div> : null}
          </article>)}
          {tickets.length === 0 ? <p className="py-6 text-center text-slate-500">No support tickets submitted.</p> : null}
        </div>}
      </section>
    </div>
  );
};

export default RegistrarSupportTickets;
