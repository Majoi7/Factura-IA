import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileMinus2,
  FilePlus2,
  FileText,
  Send,
  Upload,
} from 'lucide-react';
import {
  AnomalySeverity,
  DashboardMetrics,
  DocumentRecord,
  DocumentStatus,
} from '../shared/schemas';
import { formatDateFr, formatDateTimeFr, formatFcfa } from '../services/api';
import { DocumentStatusBadge } from './StatusLabel';

interface DashboardViewProps {
  metrics: DashboardMetrics | null;
  loading: boolean;
  onNavigate: (view: 'import' | 'documents' | 'audit' | 'verify') => void;
  onOpenDocument: (doc: DocumentRecord) => void;
  onOpenVerify: (doc: DocumentRecord) => void;
}

export function DashboardView({
  metrics,
  loading,
  onNavigate,
  onOpenDocument,
  onOpenVerify,
}: DashboardViewProps) {
  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-white border border-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-gray-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  const data = metrics ?? {
    draftCount: 0,
    validatedCount: 0,
    issuedCount: 0,
    creditNoteCount: 0,
    pendingVerificationCount: 0,
    blockingAnomalyCount: 0,
    totalValidatedAndIssuedTtc: 0,
    recentDocuments: [],
    recentAudit: [],
  };

  const kpis = [
    {
      label: 'Factures en brouillon',
      value: data.draftCount,
      sub: 'Sans numéro définitif',
      icon: FileText,
      accent: 'text-amber-700',
    },
    {
      label: 'Factures validées',
      value: data.validatedCount,
      sub: 'Immuables, prêtes à émettre',
      icon: CheckCircle2,
      accent: 'text-emerald-700',
    },
    {
      label: 'Factures émises (simulées)',
      value: data.issuedCount,
      sub: 'Envoyées via canal simulé',
      icon: Send,
      accent: 'text-teal-700',
    },
    {
      label: 'Avoirs liés',
      value: data.creditNoteCount,
      sub: 'Corrections post-validation',
      icon: FileMinus2,
      accent: 'text-rose-700',
    },
    {
      label: 'En attente de vérification',
      value: data.pendingVerificationCount,
      sub: 'Champs à confirmer ou compléter',
      icon: Clock,
      accent: 'text-slate-700',
    },
    {
      label: 'Anomalies bloquantes',
      value: data.blockingAnomalyCount,
      sub: 'Empêchent la validation humaine',
      icon: AlertTriangle,
      accent: data.blockingAnomalyCount > 0 ? 'text-rose-700' : 'text-emerald-700',
    },
  ];

  const firstDraftToVerify = data.recentDocuments.find(
    (d) => d.status === DocumentStatus.BROUILLON
  );

  return (
    <div className="space-y-8">
      {/* En-tête de vue et actions rapides */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Tableau de bord de facturation
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Suivi du cycle documentaire, contrôles de conformité et validation humaine. Chiffre d’affaires validé et émis :{' '}
            <span className="font-semibold text-gray-900 font-mono-num">
              {formatFcfa(data.totalValidatedAndIssuedTtc)}
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('import')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FilePlus2 className="w-4 h-4" />
            Nouvelle facture
          </button>
          <button
            type="button"
            onClick={() => onNavigate('import')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            Importer un document
          </button>
          <button
            type="button"
            onClick={() => onNavigate('documents')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileCheck2 className="w-4 h-4" />
            Consulter les factures
          </button>
        </div>
      </div>

      {/* Grille des 6 indicateurs KPI (provenant de SQLite) */}
      <section aria-label="Indicateurs clés">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.label}
                className="bg-white border border-gray-200 rounded-lg p-5 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500">{kpi.label}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 font-mono-num">
                    {kpi.value}
                  </p>
                  <p className="mt-1.5 text-xs text-gray-500">{kpi.sub}</p>
                </div>
                <div className={`p-2 rounded-md bg-gray-50 border border-gray-100 ${kpi.accent}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Appel à action prioritaire si un brouillon comporte des blocages */}
      {firstDraftToVerify && data.blockingAnomalyCount > 0 && (
        <div className="bg-white border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Vérification prioritaire requise sur {firstDraftToVerify.draftCode} — {firstDraftToVerify.clientName}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              {firstDraftToVerify.anomalies.filter((a) => a.severity === AnomalySeverity.BLOQUANT && !a.resolved).length}{' '}
              anomalie(s) bloquante(s) détectée(s). Corrigez les champs avant de procéder à la validation humaine.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenVerify(firstDraftToVerify)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ouvrir la vérification
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Deux colonnes : Derniers documents (7/12) + Dernières activités d'audit (5/12) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-7 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Derniers documents</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Brouillons, factures validées, émissions simulées et avoirs récents
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('documents')}
              className="text-xs font-medium text-emerald-800 hover:text-emerald-950 whitespace-nowrap cursor-pointer"
            >
              Tout voir
            </button>
          </div>

          {data.recentDocuments.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-600">Aucun document enregistré pour le moment.</p>
              <button
                type="button"
                onClick={() => onNavigate('import')}
                className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-emerald-800 rounded-md hover:bg-emerald-900 cursor-pointer"
              >
                Importer un premier document
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/70 text-xs font-medium text-gray-500">
                    <th className="py-2.5 px-4">Référence</th>
                    <th className="py-2.5 px-4">Client</th>
                    <th className="py-2.5 px-4 text-right">Montant TTC</th>
                    <th className="py-2.5 px-4">Statut</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {data.recentDocuments.map((doc) => {
                    const blockers = doc.anomalies.filter(
                      (a) => a.severity === AnomalySeverity.BLOQUANT && !a.resolved
                    ).length;
                    const displayAmount =
                      doc.status === DocumentStatus.AVOIR
                        ? -doc.totals.totalTtc
                        : doc.totals.totalTtc;
                    return (
                      <tr key={doc.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900 font-mono-num">
                            {doc.invoiceNumber || doc.draftCode}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatDateFr(doc.issueDate)}
                            {blockers > 0 ? ` · ${blockers} blocage(s)` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900 truncate max-w-[190px]">
                            {doc.clientName || '(Client à compléter)'}
                          </div>
                          <div className="text-xs text-gray-500 truncate max-w-[190px]">
                            {doc.commercialReference || 'Sans réf. commerciale'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num font-medium text-gray-900 whitespace-nowrap">
                          {formatFcfa(displayAmount)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <DocumentStatusBadge status={doc.status} />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              doc.status === DocumentStatus.BROUILLON
                                ? onOpenVerify(doc)
                                : onOpenDocument(doc)
                            }
                            className="text-xs font-medium text-emerald-800 hover:text-emerald-950 cursor-pointer"
                          >
                            {doc.status === DocumentStatus.BROUILLON ? 'Vérifier' : 'Consulter'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="xl:col-span-5 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Dernières activités</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Journal d’audit persistant et non modifiable
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('audit')}
              className="text-xs font-medium text-emerald-800 hover:text-emerald-950 whitespace-nowrap cursor-pointer"
            >
              Journal complet
            </button>
          </div>

          <ul className="divide-y divide-gray-100">
            {data.recentAudit.map((ev) => (
              <li key={ev.id} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="font-semibold text-gray-800">{ev.actionType}</span>
                  <span className="font-mono-num whitespace-nowrap">
                    {formatDateTimeFr(ev.timestamp)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-700 leading-relaxed">{ev.details}</p>
                <div className="mt-1 text-[11px] text-gray-500">
                  {ev.documentLabel} · {ev.user}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
