import React, { useCallback, useEffect, useState } from 'react';
import { fetchSupportTickets, updateSupportTicket } from '../../services/api';

const SupportTicketManagement = () => {
  const [tickets, setTickets] = useState([]);
  const [edits, setEdits] = useState({});
  const [notice, setNotice] = useState(null);
  const load = useCallback(async () => { try { const response = await fetchSupportTickets(); setTickets(Array.isArray(response?.data) ? response.data : []); } catch (error) { setNotice({ type: 'error', message: error.message }); } }, []);
  useEffect(() => { load(); }, [load]);
  const save = async (ticket) => {
    const edit = edits[ticket.ticketId] || { status: ticket.status, adminResponse: ticket.adminResponse || '' };
    try { await updateSupportTicket(ticket.ticketId, edit); setNotice({ type: 'success', message: `Ticket #${ticket.ticketId} updated.` }); await load(); }
    catch (error) { setNotice({ type: 'error', message: error.message }); }
  };
  return <div className="space-y-4"><div><h2 className="text-xl font-bold text-[#003366]">Registrar Error Reports</h2><p className="text-sm text-slate-500">Review, respond to, and resolve tickets submitted by Registrar accounts.</p></div>{notice ? <div className={`rounded-lg p-3 text-sm ${notice.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{notice.message}</div> : null}{tickets.map((ticket) => { const edit = edits[ticket.ticketId] || { status: ticket.status, adminResponse: ticket.adminResponse || '' }; return <article key={ticket.ticketId} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-bold text-slate-800">#{ticket.ticketId} · {ticket.title}</h3><p className="text-xs text-slate-500">{ticket.registrarName} · {ticket.registrarEmail} · {ticket.severity}</p></div><span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800">{ticket.status}</span></div><p className="my-3 whitespace-pre-wrap text-sm text-slate-700">{ticket.description}</p><div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)_auto]"><select value={edit.status} onChange={(event) => setEdits({ ...edits, [ticket.ticketId]: { ...edit, status: event.target.value } })} className="rounded-lg border border-slate-300 px-3 py-2"><option value="OPEN">Open</option><option value="IN_PROGRESS">In Progress</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select><textarea rows="2" placeholder="Administrator response" value={edit.adminResponse} onChange={(event) => setEdits({ ...edits, [ticket.ticketId]: { ...edit, adminResponse: event.target.value } })} className="rounded-lg border border-slate-300 px-3 py-2" /><button onClick={() => save(ticket)} className="rounded-lg bg-[#003366] px-4 py-2 font-bold text-white">Save</button></div></article>; })}{tickets.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">No Registrar tickets.</div> : null}</div>;
};

export default SupportTicketManagement;
