import React, { useState } from 'react';
import plvlogo from '../../assets/plvlogo.png';
import SystemMonitoring from './SystemMonitoring';
import RegistrarAccountManagement from './RegistrarAccountManagement';
import SupportTicketManagement from './SupportTicketManagement';

const navigationItems = [
  { id: 'overview', label: 'Overview' },
  { id: 'registrars', label: 'Registrar Accounts' },
  { id: 'tickets', label: 'Error Reports' },
  { id: 'chat', label: 'Registrar Chat' },
  { id: 'services', label: 'Services' },
  { id: 'infrastructure', label: 'Infrastructure & Data' },
  { id: 'alerts', label: 'Alerts' },
];

function SystemAdminPortal({ adminData, onLogout, chatUnreadCount = 0, onOpenChat }) {
  const [activeView, setActiveView] = useState('overview');

  return (
    <div className="fixed inset-0 z-[100] flex min-h-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
      <header className="shrink-0 border-b border-blue-950 bg-[#003366] text-white shadow-sm">
        <div className="flex min-h-[72px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white">
              <img src={plvlogo} alt="PLV Logo" className="h-10 w-10 object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-blue-100">PLV BlockGO</p>
              <h1 className="truncate text-lg font-bold sm:text-xl">System Administration</h1>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right md:block">
              <p className="truncate text-sm font-semibold">{adminData?.name || 'System Administrator'}</p>
              <p className="truncate text-xs text-blue-100">{adminData?.email || ''}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md border border-yellow-400 px-4 py-2 text-sm font-semibold text-yellow-300 transition hover:bg-yellow-400 hover:text-[#003366]"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="shrink-0 border-b border-slate-200 bg-white p-3 lg:w-60 lg:border-b-0 lg:border-r lg:p-4">
          <nav className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="System administration views">
            {navigationItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`min-h-11 shrink-0 rounded-md border-l-4 px-4 py-2 text-left text-sm font-semibold transition lg:w-full ${
                    isActive
                      ? 'border-yellow-400 bg-[#003366] text-white'
                      : 'border-transparent text-slate-700 hover:bg-slate-100'
                  }`}
                >
                {item.label}{item.id === 'chat' && chatUnreadCount > 0 ? ` (${chatUnreadCount > 9 ? '9+' : chatUnreadCount})` : ''}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto w-full max-w-[1500px]">
            {activeView === 'registrars' ? (
              <RegistrarAccountManagement />
            ) : activeView === 'tickets' ? (
              <SupportTicketManagement />
            ) : activeView === 'chat' ? (
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-[#003366]">System Administrator and Registrar Chat</h2>
                <p className="mt-2 text-sm text-slate-600">Only Registrar accounts are available in this conversation list.</p>
                <button
                  type="button"
                  onClick={onOpenChat}
                  className="mt-5 rounded-lg bg-[#003366] px-5 py-2.5 font-bold text-white"
                >
                  Open Chat{chatUnreadCount > 0 ? ` (${chatUnreadCount} unread)` : ''}
                </button>
              </section>
            ) : (
              <SystemMonitoring activeView={activeView} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default SystemAdminPortal;
