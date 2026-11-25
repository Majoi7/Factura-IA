import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Edit3,
  FileMinus2,
  FileText,
  Link2,
  Lock,
  Send,
  ShieldCheck,
} from 'lucide-react';
import {
  AnomalySeverity,
  AuditEvent,
  DocumentRecord,
  DocumentStatus,
} from '../shared/schemas';
import { api, formatDateFr, formatDateTimeFr, formatFcfa } from '../services/api';
import { DocumentStatusBadge, SeverityBadge } from './StatusLabel';

interface DocumentDetailViewProps {
  document: DocumentRecord;
  history: AuditEvent[];
  onBack: () => void;
  onOpenVerify: (doc: DocumentRecord) => void;
  onOpenValidation: (doc: DocumentRecord) => void;
  onOpenEmission: (doc: DocumentRecord) => void;
  onOpenCreditNote: (doc: DocumentRecord) => void;
  onOpenDocumentById: (id: string) => void;
}

export function DocumentDetailView({
  document: doc,
  history,
  onBack,
  onOpenVerify,
  onOpenValidation,
  onOpenEmission,
  onOpenCreditNote,
  onOpenDocumentById,
}: DocumentDetailViewProps) {
  const isDraft = doc.status === DocumentStatus.BROUILLON;
  const isValidated = doc.status === DocumentStatus.VALIDEE;
  const isIssued = doc.status === DocumentStatus.EMISE;
  const isCreditNote = doc.status === DocumentStatus.AVOIR;

  const blockers = doc.anomalies.filter(
    (a) => a.severity === AnomalySeverity.BLOQUANT && !a.resolved
  );
  const sign = isCreditNote ? -1 : 1;

  return (
    <div className="space-y-6">
      {/* En-tête et actions contextuelles selon statut */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Liste des documents
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-xs font-mono-num text-gray-600">{doc.draftCode}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 font-mono-num">
              {doc.invoiceNumber || `${doc.draftCode} (Brouillon)`}
            </h1>
            <DocumentStatusBadge status={doc.status} />
          </div>

          <p className="text-xs text-gray-600">
            Client : <span className="font-medium text-gray-900">{doc.clientName || '(Non renseigné)'}</span>
            {' · '}Réf. : {doc.commercialReference || '—'}
            {' · '}Créé le {formatDateTimeFr(doc.createdAt)}
          </p>
        </div>

        {/* Barre d'actions stricte selon le cycle de vie */}
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={api.getPdfUrl(doc.id)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            {isDraft ? 'Télécharger PDF brouillon' : 'Télécharger PDF'}
          </a>

          {isDraft && (
            <>
              <button
                type="button"
                onClick={() => onOpenVerify(doc)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-800 bg-white border border-gray-300 hover:bg-gray-50 rounded-md whitespace-nowrap cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Modifier / Vérifier les champs
              </button>
              <button
                type="button"
                onClick={() => onOpenValidation(doc)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-md whitespace-nowrap cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                Valider la facture
              </button>
            </>
          )}

          {isValidated && (
            <>
              <button
                type="button"
                onClick={() => onOpenCreditNote(doc)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-800 bg-white border border-rose-200 hover:bg-rose-50 rounded-md whitespace-nowrap cursor-pointer"
              >
                <FileMinus2 className="w-3.5 h-3.5" />
                Créer un avoir lié
              </button>
              <button
                type="button"
                onClick={() => onOpenEmission(doc)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-md whitespace-nowrap cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Simuler l’émission
              </button>
            </>
          )}

          {isIssued && (
            <>
              <button
                type="button"
                onClick={() => onOpenEmission(doc)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md whitespace-nowrap cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Nouvelle simulation d’envoi
              </button>
              <button
                type="button"
                onClick={() => onOpenCreditNote(doc)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-rose-700 hover:bg-rose-800 rounded-md whitespace-nowrap cursor-pointer"
              >
                <FileMinus2 className="w-3.5 h-3.5" />
                Créer un avoir lié
              </button>
            </>
          )}

          {isCreditNote && doc.originalDocumentId && (
            <button
              type="button"
              onClick={() => onOpenDocumentById(doc.originalDocumentId!)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-md whitespace-nowrap cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5" />
              Voir la facture d’origine ({doc.originalInvoiceNumber})
            </button>
          )}
        </div>
      </div>

      {/* Bandeau d'immutabilité post-validation */}
      {!isDraft && (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-700">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-emerald-800 shrink-0" />
            <span>
              <strong>Document immuable</strong> — validé le {formatDateTimeFr(doc.validatedAt)} par{' '}
              {doc.validatedBy}. Aucune modification directe n’est autorisée.
            </span>
          </div>
          {doc.linkedCreditNoteIds && doc.linkedCreditNoteIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-rose-700 font-medium">
                {doc.linkedCreditNoteIds.length} avoir(s) lié(s) :
              </span>
              {doc.linkedCreditNoteIds.map((avId, idx) => (
                <button
                  key={avId}
                  type="button"
                  onClick={() => onOpenDocumentById(avId)}
                  className="text-emerald-800 hover:underline font-medium cursor-pointer"
                >
                  Ouvrir l’avoir #{idx + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Encadré motif de l'avoir */}
      {isCreditNote && (
        <div className="bg-rose-50/70 border border-rose-200 rounded-lg p-4 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-rose-900">
              Avoir rattaché à la facture immuable {doc.originalInvoiceNumber}
            </h2>
            {doc.originalDocumentId && (
              <button
                type="button"
                onClick={() => onOpenDocumentById(doc.originalDocumentId!)}
                className="text-xs font-medium text-rose-800 hover:underline cursor-pointer"
              >
                Consulter {doc.originalInvoiceNumber}
              </button>
            )}
          </div>
          <p className="text-sm text-rose-950">{doc.creditNoteReason}</p>
        </div>
      )}

      {/* Grille principale : Infos + Lignes + Totaux (8 col) / Anomalies + Émissions + Audit (4 col) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-6">
          {/* Identité client & Informations document source */}
          <section className="bg-white border border-gray-200 rounded-lg p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-gray-500">Identité du client (fictif)</h2>
              <p className="text-base font-semibold text-gray-900">
                {doc.clientName || '(Non renseigné)'}
              </p>
              <dl className="space-y-1 text-xs text-gray-600">
                <div>
                  <span className="text-gray-500">IFU : </span>
                  <span className="font-mono-num text-gray-900">
                    {doc.clientIfu || '(Non renseigné)'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Adresse : </span>
                  <span className="text-gray-800">{doc.clientAddress || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Courriel : </span>
                  <span className="text-gray-800">{doc.clientEmail || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Téléphone / WhatsApp : </span>
                  <span className="font-mono-num text-gray-800">{doc.clientPhone || '—'}</span>
                </div>
              </dl>
            </div>

            <div className="space-y-2 md:border-l md:border-gray-100 md:pl-6">
              <h2 className="text-xs font-semibold text-gray-500">Références & dates</h2>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Numéro définitif</dt>
                  <dd className="font-mono-num font-semibold text-gray-900">
                    {doc.invoiceNumber || 'Attribué après validation'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Réf. commerciale</dt>
                  <dd className="font-mono-num text-gray-900">{doc.commercialReference || '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Date du document</dt>
                  <dd className="font-mono-num text-gray-900">{formatDateFr(doc.issueDate)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Échéance</dt>
                  <dd className="font-mono-num text-gray-900">{formatDateFr(doc.dueDate)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Conditions</dt>
                  <dd className="text-gray-900 text-right">{doc.paymentTerms || '—'}</dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Tableau des lignes d'articles */}
          <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Lignes d’articles ({doc.lines.length})
              </h2>
              <span className="text-xs text-gray-500">Devise : FCFA (XOF)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                    <th className="py-2.5 px-4">Désignation</th>
                    <th className="py-2.5 px-4 text-right">Qté</th>
                    <th className="py-2.5 px-4 text-right">P.U. HT</th>
                    <th className="py-2.5 px-4 text-right">Remise</th>
                    <th className="py-2.5 px-4 text-right">Net HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {doc.lines.map((line) => {
                    const gross = Math.round(line.quantity * line.unitPrice);
                    const disc = Math.round((gross * (line.discountPercent || 0)) / 100);
                    const net = (gross - disc) * sign;
                    return (
                      <tr key={line.id}>
                        <td className="py-3 px-4 font-medium text-gray-900">{line.description}</td>
                        <td className="py-3 px-4 text-right font-mono-num text-gray-700 whitespace-nowrap">
                          {line.quantity} {line.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num text-gray-700 whitespace-nowrap">
                          {formatFcfa(line.unitPrice)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num text-gray-700 whitespace-nowrap">
                          {line.discountPercent || 0} %
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num font-semibold text-gray-900 whitespace-nowrap">
                          {formatFcfa(net)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bloc Totaux */}
            <div className="p-5 bg-gray-50/70 border-t border-gray-200 flex flex-col items-end">
              <dl className="w-full max-w-sm space-y-1.5 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-600">Sous-total brut HT</dt>
                  <dd className="font-mono-num text-gray-900 whitespace-nowrap">
                    {formatFcfa(doc.totals.subtotalHt * sign)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-600">Remises</dt>
                  <dd className="font-mono-num text-gray-900 whitespace-nowrap">
                    {formatFcfa(-doc.totals.totalDiscount * sign)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-600">Net HT</dt>
                  <dd className="font-mono-num font-medium text-gray-900 whitespace-nowrap">
                    {formatFcfa(doc.totals.netHt * sign)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-600">TVA ({doc.totals.vatRate} %)</dt>
                  <dd className="font-mono-num text-gray-900 whitespace-nowrap">
                    {formatFcfa(doc.totals.vatAmount * sign)}
                  </dd>
                </div>
                <div className="pt-2 border-t border-gray-200 flex justify-between items-baseline gap-4">
                  <dt className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                    {isCreditNote ? 'Net à créditer TTC' : 'Net à payer TTC'}
                  </dt>
                  <dd className="text-base font-semibold font-mono-num text-emerald-900 whitespace-nowrap">
                    {formatFcfa(doc.totals.totalTtc * sign)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] text-gray-500">
                {doc.totals.isSimulated
                  ? 'Totaux calculés par le simulateur MODE DÉMO (en attente de src/engine.py).'
                  : 'Totaux fournis par le moteur de calcul déterministe.'}
              </p>
            </div>
          </section>

          {/* Pièce jointe / Source */}
          {doc.source && (
            <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-800" />
                  <h2 className="text-sm font-semibold text-gray-900">
                    Pièce jointe source : {doc.source.fileName}
                  </h2>
                </div>
                <span className="text-xs font-mono-num text-gray-500">
                  {doc.source.sourceType} · {(doc.source.sizeBytes / 1024).toFixed(1)} Ko
                </span>
              </div>
              {doc.source.sourceType === 'IMAGE' && doc.source.previewDataUrl && (
                <img
                  src={doc.source.previewDataUrl}
                  alt={doc.source.fileName}
                  className="max-h-64 rounded border border-gray-200 object-contain"
                />
              )}
              <pre className="p-3.5 rounded bg-gray-50 border border-gray-200 text-xs text-gray-800 font-mono whitespace-pre-wrap max-h-56 overflow-y-auto">
                {doc.source.rawText}
              </pre>
            </section>
          )}
        </div>

        {/* Colonne droite : Anomalies, Émissions simulées & Historique */}
        <div className="xl:col-span-4 space-y-6">
          {/* Anomalies */}
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Contrôles métier ({doc.anomalies.length})
            </h2>
            {doc.anomalies.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-3">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Aucune anomalie signalée.
              </div>
            ) : (
              <ul className="space-y-2">
                {doc.anomalies.map((a) => (
                  <li key={a.id} className="p-3 rounded border border-gray-200 bg-gray-50/60 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-900">{a.title}</span>
                      <SeverityBadge severity={a.severity} />
                    </div>
                    <p className="mt-1 text-gray-600">{a.message}</p>
                  </li>
                ))}
              </ul>
            )}
            {blockers.length > 0 && isDraft && (
              <p className="text-xs text-rose-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Corrigez les anomalies bloquantes avant la validation.
              </p>
            )}
          </section>

          {/* Émissions simulées */}
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Émissions simulées ({doc.emissions.length})
            </h2>
            {doc.emissions.length === 0 ? (
              <p className="text-xs text-gray-500">
                {isDraft
                  ? 'Disponible uniquement après validation humaine.'
                  : 'Aucune simulation d’envoi enregistrée pour ce document.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {doc.emissions.map((em) => (
                  <li key={em.id} className="p-3 rounded border border-teal-200 bg-teal-50/40 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-teal-950">{em.channel}</span>
                      <span className="font-mono-num text-[11px] text-teal-800">{em.status}</span>
                    </div>
                    <p className="text-gray-800">Destinataire : {em.recipient}</p>
                    <p className="text-gray-600">{em.resultNote}</p>
                    <p className="text-[11px] font-mono-num text-gray-500">
                      {formatDateTimeFr(em.simulatedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Historique d'audit du document */}
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Historique du document ({history.length})
            </h2>
            {history.length === 0 ? (
              <p className="text-xs text-gray-500">Aucun événement enregistré.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {history.map((ev) => (
                  <li key={ev.id} className="py-2.5 first:pt-0 last:pb-0 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-800">{ev.actionType}</span>
                      <span className="font-mono-num text-[11px] text-gray-500">
                        {formatDateTimeFr(ev.timestamp)}
                      </span>
                    </div>
                    <p className="mt-1 text-gray-700">{ev.details}</p>
                    {(ev.oldValue || ev.newValue) && (
                      <p className="mt-1 text-[11px] font-mono text-gray-500">
                        {ev.oldValue ? `${ev.oldValue} → ` : ''}
                        {ev.newValue}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
