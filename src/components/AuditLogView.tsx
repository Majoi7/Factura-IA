import { useMemo, useState } from 'react';
import { Lock, Search } from 'lucide-react';
import { AuditActionType, AuditEvent } from '../shared/schemas';
import { formatDateTimeFr } from '../services/api';

interface AuditLogViewProps {
  events: AuditEvent[];
  loading: boolean;
  onOpenDocumentById: (id: string) => void;
}

export function AuditLogView({
  events,
  loading,
  onOpenDocumentById,
}: AuditLogViewProps) {
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (actionFilter !== 'ALL' && e.actionType !== actionFilter) return false;
      if (!q) return true;
      return (
        e.id.toLowerCase().includes(q) ||
        e.documentLabel.toLowerCase().includes(q) ||
        e.details.toLowerCase().includes(q) ||
        e.user.toLowerCase().includes(q) ||
        e.actionType.toLowerCase().includes(q)
      );
    });
  }, [events, actionFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Journal d’audit
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Historique persistant et chronologique de toutes les opérations : import, corrections, validation, numérotation, émission simulée, avoirs et réinitialisations.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-md whitespace-nowrap shrink-0">
          <Lock className="w-3.5 h-3.5 text-emerald-800" />
          Lecture seule (non modifiable)
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="audit-action-filter" className="text-xs font-medium text-gray-600">
            Type d’action :
          </label>
          <select
            id="audit-action-filter"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="text-xs bg-white border border-gray-300 rounded-md px-2.5 py-2 text-gray-800 focus:outline-none focus:border-emerald-700"
          >
            <option value="ALL">Toutes les actions ({events.length})</option>
            {Object.values(AuditActionType).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer par document, utilisateur ou détail..."
            aria-label="Filtrer le journal d'audit"
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
          />
        </div>
      </div>

      {/* Table d'audit */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading && events.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">Chargement du journal d’audit...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            Aucun événement ne correspond aux critères sélectionnés.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80 text-xs font-medium text-gray-500">
                  <th className="py-3 px-4">Date & heure</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Document</th>
                  <th className="py-3 px-4">Utilisateur</th>
                  <th className="py-3 px-4">Détails & valeurs modifiées</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filtered.map((ev) => (
                  <tr key={ev.id} className="hover:bg-gray-50/60">
                    <td className="py-3 px-4 whitespace-nowrap font-mono-num text-gray-600 align-top">
                      <div>{formatDateTimeFr(ev.timestamp)}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{ev.id}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-semibold text-gray-900 align-top">
                      {ev.actionType}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap align-top">
                      {ev.documentId ? (
                        <button
                          type="button"
                          onClick={() => onOpenDocumentById(ev.documentId!)}
                          className="font-mono-num font-medium text-emerald-800 hover:underline cursor-pointer"
                        >
                          {ev.documentLabel}
                        </button>
                      ) : (
                        <span className="font-mono-num text-gray-600">{ev.documentLabel}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-700 align-top whitespace-nowrap">
                      {ev.user}
                    </td>
                    <td className="py-3 px-4 text-gray-700 align-top">
                      <p className="leading-relaxed">{ev.details}</p>
                      {(ev.oldValue || ev.newValue) && (
                        <div className="mt-1.5 font-mono text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded px-2.5 py-1 inline-block">
                          {ev.oldValue && (
                            <span className="text-rose-700 line-through mr-2">{ev.oldValue}</span>
                          )}
                          {ev.oldValue && ev.newValue && <span className="mr-2">→</span>}
                          {ev.newValue && <span className="text-emerald-800 font-medium">{ev.newValue}</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
