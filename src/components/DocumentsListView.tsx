import { useMemo, useState } from 'react';
import { Download, Eye, FilePlus2, Search, SlidersHorizontal } from 'lucide-react';
import {
  AnomalySeverity,
  DocumentRecord,
  DocumentStatus,
} from '../shared/schemas';
import { api, formatDateFr, formatDateTimeFr, formatFcfa } from '../services/api';
import { DocumentStatusBadge } from './StatusLabel';

interface DocumentsListViewProps {
  documents: DocumentRecord[];
  loading: boolean;
  onOpenDetail: (doc: DocumentRecord) => void;
  onOpenVerify: (doc: DocumentRecord) => void;
  onNewInvoice: () => void;
}

const FILTER_TABS: Array<{ id: 'ALL' | DocumentStatus; label: string }> = [
  { id: 'ALL', label: 'Tous' },
  { id: DocumentStatus.BROUILLON, label: 'Brouillons' },
  { id: DocumentStatus.VALIDEE, label: 'Validées' },
  { id: DocumentStatus.EMISE, label: 'Émises' },
  { id: DocumentStatus.AVOIR, label: 'Avoirs' },
];

export function DocumentsListView({
  documents,
  loading,
  onOpenDetail,
  onOpenVerify,
  onNewInvoice,
}: DocumentsListViewProps) {
  const [statusFilter, setStatusFilter] = useState<'ALL' | DocumentStatus>('ALL');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (d.invoiceNumber || '').toLowerCase().includes(q) ||
        d.draftCode.toLowerCase().includes(q) ||
        d.clientName.toLowerCase().includes(q) ||
        d.commercialReference.toLowerCase().includes(q)
      );
    });
  }, [documents, statusFilter, search]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {
      ALL: documents.length,
      [DocumentStatus.BROUILLON]: 0,
      [DocumentStatus.VALIDEE]: 0,
      [DocumentStatus.EMISE]: 0,
      [DocumentStatus.AVOIR]: 0,
    };
    for (const d of documents) {
      map[d.status] = (map[d.status] || 0) + 1;
    }
    return map;
  }, [documents]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Documents et factures
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Consultez le cycle de vie complet : brouillons non numérotés, factures validées immuables, émissions simulées et avoirs liés.
          </p>
        </div>
        <button
          type="button"
          onClick={onNewInvoice}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
        >
          <FilePlus2 className="w-4 h-4" />
          Nouvelle facture
        </button>
      </div>

      {/* Barre de filtres et recherche */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-gray-100 rounded-md">
          {FILTER_TABS.map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}{' '}
                <span className="font-mono-num text-gray-400 ml-1">{counts[tab.id] ?? 0}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par numéro, client ou référence..."
            aria-label="Rechercher par numéro, client ou référence"
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
          />
        </div>
      </div>

      {/* Tableau professionnel */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading && documents.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">Chargement des documents...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <SlidersHorizontal className="w-6 h-6 text-gray-400 mx-auto" />
            <p className="text-sm font-medium text-gray-900">Aucun document ne correspond aux filtres.</p>
            <p className="text-xs text-gray-500">
              Modifiez votre recherche ou importez un nouveau document commercial.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80 text-xs font-medium text-gray-500">
                  <th className="py-3 px-4">Numéro / Brouillon</th>
                  <th className="py-3 px-4">Client & Référence</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Montant TTC</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4">Créé le</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filtered.map((doc) => {
                  const blockers = doc.anomalies.filter(
                    (a) => a.severity === AnomalySeverity.BLOQUANT && !a.resolved
                  ).length;
                  const amount =
                    doc.status === DocumentStatus.AVOIR
                      ? -doc.totals.totalTtc
                      : doc.totals.totalTtc;
                  return (
                    <tr key={doc.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono-num font-semibold text-gray-900">
                          {doc.invoiceNumber || (
                            <span className="text-gray-600">{doc.draftCode}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {doc.invoiceNumber
                            ? doc.originalInvoiceNumber
                              ? `Lié à ${doc.originalInvoiceNumber}`
                              : `Issu de ${doc.draftCode}`
                            : 'Non numéroté'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-gray-900">
                          {doc.clientName || '(Client non renseigné)'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {doc.commercialReference || 'Sans référence'}
                          {blockers > 0 && (
                            <span className="text-rose-700 font-medium">
                              {' '}· {blockers} anomalie(s) bloquante(s)
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap font-mono-num text-xs text-gray-700">
                        {formatDateFr(doc.issueDate)}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono-num font-semibold text-gray-900">
                        {formatFcfa(amount)}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <DocumentStatusBadge status={doc.status} />
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap font-mono-num text-xs text-gray-500">
                        {formatDateTimeFr(doc.createdAt)}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {doc.status === DocumentStatus.BROUILLON && (
                            <button
                              type="button"
                              onClick={() => onOpenVerify(doc)}
                              className="px-2.5 py-1 text-xs font-medium text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded cursor-pointer"
                            >
                              Vérifier
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenDetail(doc)}
                            aria-label={`Ouvrir le détail de ${doc.invoiceNumber || doc.draftCode}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Détail
                          </button>
                          <a
                            href={api.getPdfUrl(doc.id)}
                            aria-label={`Télécharger le PDF de ${doc.invoiceNumber || doc.draftCode}`}
                            className="inline-flex items-center p-1.5 text-gray-600 hover:text-gray-900 border border-gray-200 rounded bg-white hover:bg-gray-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
