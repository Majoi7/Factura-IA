import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Lock,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  AnomalySeverity,
  DocumentLineItem,
  DocumentRecord,
  DocumentStatus,
  ExtractedField,
} from '../shared/schemas';
import { ApiError, api, formatFcfa } from '../services/api';
import {
  ConfidenceIndicator,
  DocumentStatusBadge,
  SeverityBadge,
} from './StatusLabel';

interface VerificationViewProps {
  document: DocumentRecord;
  drafts: DocumentRecord[];
  onSelectDraft: (doc: DocumentRecord) => void;
  onUpdated: (doc: DocumentRecord) => void;
  onOpenValidation: (doc: DocumentRecord) => void;
  onOpenDetail: (doc: DocumentRecord) => void;
  onBack: () => void;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

export function VerificationView({
  document: doc,
  drafts,
  onSelectDraft,
  onUpdated,
  onOpenValidation,
  onOpenDetail,
  onBack,
  onNotify,
}: VerificationViewProps) {
  const isEditable = doc.status === DocumentStatus.BROUILLON;

  const [fields, setFields] = useState<ExtractedField[]>(doc.fields);
  const [lines, setLines] = useState<DocumentLineItem[]>(doc.lines);
  const [clientAddress, setClientAddress] = useState(doc.clientAddress);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Réinitialiser l'état local quand le document actif change
  useEffect(() => {
    setFields(doc.fields);
    setLines(doc.lines);
    setClientAddress(doc.clientAddress);
    setDirty(false);
    setErrorMsg(null);
  }, [doc.id, doc.updatedAt]);

  const blockingAnomalies = useMemo(
    () => doc.anomalies.filter((a) => a.severity === AnomalySeverity.BLOQUANT && !a.resolved),
    [doc.anomalies]
  );

  // Zones distinctes demandées : Champs manquants, Champs à confirmer, Champs vérifiés
  const missingFields = useMemo(
    () => fields.filter((f) => !f.value.trim()),
    [fields]
  );
  const toConfirmFields = useMemo(
    () => fields.filter((f) => f.value.trim() && !f.verified),
    [fields]
  );
  const verifiedFields = useMemo(
    () => fields.filter((f) => f.value.trim() && f.verified),
    [fields]
  );

  // Aperçu local des totaux pendant l'édition (recalculé côté serveur à l'enregistrement)
  const previewTotals = useMemo(() => {
    let sub = 0;
    let disc = 0;
    for (const l of lines) {
      const g = Math.round((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));
      const d = Math.round((g * Math.min(100, Math.max(0, Number(l.discountPercent) || 0))) / 100);
      sub += g;
      disc += d;
    }
    const net = sub - disc;
    const vat = Math.round((net * (doc.totals.vatRate || 18)) / 100);
    return { subtotalHt: sub, totalDiscount: disc, netHt: net, vatAmount: vat, totalTtc: net + vat };
  }, [lines, doc.totals.vatRate]);

  const updateFieldValue = (key: string, nextValue: string) => {
    setDirty(true);
    setFields((prev) =>
      prev.map((f) =>
        f.key === key
          ? {
              ...f,
              value: nextValue,
              verified: nextValue.trim() ? true : false,
            }
          : f
      )
    );
  };

  const toggleFieldVerified = (key: string) => {
    setDirty(true);
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, verified: !f.verified } : f))
    );
  };

  const updateLine = (id: string, patch: Partial<DocumentLineItem>) => {
    setDirty(true);
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    setDirty(true);
    setLines((prev) => [
      ...prev,
      {
        id: `ln-new-${Date.now()}`,
        description: '',
        quantity: 1,
        unit: 'unité',
        unitPrice: 0,
        discountPercent: 0,
        vatRate: doc.totals.vatRate || 18,
        sourceText: 'Ajout manuel',
        confidence: 100,
        verified: true,
      },
    ]);
  };

  const removeLine = (id: string) => {
    setDirty(true);
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSave = async (): Promise<DocumentRecord | null> => {
    setErrorMsg(null);
    setSaving(true);
    try {
      const byKey = new Map(fields.map((f) => [f.key, f.value]));
      const updated = await api.updateDraft(doc.id, {
        clientName: byKey.get('clientName') ?? doc.clientName,
        clientIfu: byKey.get('clientIfu') ?? doc.clientIfu,
        clientEmail: byKey.get('clientEmail') ?? doc.clientEmail,
        clientPhone: byKey.get('clientPhone') ?? doc.clientPhone,
        clientAddress,
        commercialReference: byKey.get('commercialReference') ?? doc.commercialReference,
        issueDate: byKey.get('issueDate') ?? doc.issueDate,
        dueDate: byKey.get('dueDate') ?? doc.dueDate,
        paymentTerms: byKey.get('paymentTerms') ?? doc.paymentTerms,
        fields,
        lines,
      });
      setDirty(false);
      onUpdated(updated);
      onNotify('Corrections enregistrées et contrôles métier recalculés.', 'success');
      return updated;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Impossible d’enregistrer les corrections.';
      setErrorMsg(msg);
      onNotify(msg, 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleProceedToValidate = async () => {
    let latestDoc = doc;
    if (dirty && isEditable) {
      const saved = await handleSave();
      if (!saved) return;
      latestDoc = saved;
    }
    onOpenValidation(latestDoc);
  };

  const renderFieldRow = (field: ExtractedField) => (
    <div
      key={field.key}
      className="p-3.5 rounded-md border border-gray-200 bg-white space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label
            htmlFor={`field-${field.key}`}
            className="text-xs font-semibold text-gray-900"
          >
            {field.label}
            {field.required && <span className="text-rose-600 ml-0.5">*</span>}
          </label>
          <span className="text-gray-300" aria-hidden="true">·</span>
          <span className="text-[11px] text-gray-500">
            Confiance{field.isSimulated ? ' (simulée)' : ''} :{' '}
            <ConfidenceIndicator confidence={field.confidence} />
          </span>
        </div>

        <button
          type="button"
          disabled={!isEditable || !field.value.trim()}
          onClick={() => toggleFieldVerified(field.key)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors cursor-pointer disabled:opacity-50 ${
            field.verified
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          <Check className="w-3.5 h-3.5" />
          {field.verified ? 'Vérifié' : 'Confirmer'}
        </button>
      </div>

      <input
        id={`field-${field.key}`}
        type={field.key.includes('Date') ? 'date' : 'text'}
        disabled={!isEditable}
        value={field.value}
        onChange={(e) => updateFieldValue(field.key, e.target.value)}
        placeholder={
          field.key === 'clientIfu'
            ? 'Champ absent — saisir un IFU fictif à 13 chiffres (ex. 3202600123456)'
            : 'Champ non renseigné — saisir manuellement'
        }
        className={`w-full rounded border px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 disabled:bg-gray-50 ${
          !field.value.trim() && field.required
            ? 'border-rose-300 bg-rose-50/30'
            : 'border-gray-300'
        }`}
      />

      <p className="text-[11px] text-gray-500">
        Source extraite : <span className="font-mono text-gray-700">{field.sourceText || 'Non disponible'}</span>
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Barre supérieure de vérification */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Retour
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-xs font-mono-num font-semibold text-gray-900">
              {doc.invoiceNumber || doc.draftCode}
            </span>
            <DocumentStatusBadge status={doc.status} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Vérification des données extraites
          </h1>
          <p className="text-xs text-gray-600">
            Scores de confiance simulés en Mode Démo (proviendront de <code className="font-mono">src/extraction.py</code> en Mode Intégration). Aucune donnée manquante n’est inventée.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {drafts.length > 1 && (
            <select
              aria-label="Changer de brouillon à vérifier"
              value={doc.id}
              onChange={(e) => {
                const target = drafts.find((d) => d.id === e.target.value);
                if (target) onSelectDraft(target);
              }}
              className="text-xs bg-white border border-gray-300 rounded-md px-2.5 py-2 text-gray-700 focus:outline-none focus:border-emerald-700"
            >
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.draftCode} — {d.clientName || 'Client à compléter'}
                </option>
              ))}
            </select>
          )}

          <a
            href={api.getPdfUrl(doc.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            PDF brouillon
          </a>

          {isEditable && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-800 bg-white border border-gray-300 hover:bg-gray-50 rounded-md whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Enregistrement...' : dirty ? 'Enregistrer les corrections *' : 'Enregistrer'}
              </button>

              <button
                type="button"
                onClick={handleProceedToValidate}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-md whitespace-nowrap cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                Valider la facture
              </button>
            </>
          )}

          {!isEditable && (
            <button
              type="button"
              onClick={() => onOpenDetail(doc)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-md whitespace-nowrap cursor-pointer"
            >
              Voir la fiche document
            </button>
          )}
        </div>
      </div>

      {!isEditable && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3 text-xs text-emerald-950">
          <Lock className="w-4 h-4 shrink-0 text-emerald-800" />
          <span>
            Ce document a le statut <strong>{doc.status}</strong> ({doc.invoiceNumber}) et est strictement immuable. Toute correction nécessite la création d’un avoir lié depuis sa fiche détaillée.
          </span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-900"
        >
          {errorMsg}
        </div>
      )}

      {/* Disposition split Yooz / Pennylane : Source à gauche (5 col) + Données vérifiables à droite (7 col) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Colonne gauche : Document source + Récapitulatif montants */}
        <div className="xl:col-span-5 space-y-6 xl:sticky xl:top-6">
          <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-emerald-800 shrink-0" />
                <h2 className="text-xs font-semibold text-gray-900 truncate">
                  Document source : {doc.source?.fileName || 'Saisie directe'}
                </h2>
              </div>
              <span className="text-[11px] font-mono-num text-gray-500 whitespace-nowrap">
                {doc.source?.sourceType || 'TEXTE'}
              </span>
            </div>

            <div className="p-4 space-y-3">
              {doc.source?.sourceType === 'IMAGE' && doc.source.previewDataUrl && (
                <img
                  src={doc.source.previewDataUrl}
                  alt={doc.source.fileName}
                  className="w-full max-h-72 object-contain rounded border border-gray-200 bg-gray-50"
                />
              )}
              {doc.source?.sourceType === 'PDF' && doc.source.previewDataUrl && (
                <iframe
                  src={doc.source.previewDataUrl}
                  title={doc.source.fileName}
                  className="w-full h-72 rounded border border-gray-200"
                />
              )}
              <div className="bg-gray-50 border border-gray-200 rounded p-3.5 max-h-80 overflow-y-auto">
                <p className="text-[11px] font-semibold text-gray-500 mb-2">
                  Texte source extrait / brut
                </p>
                <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                  {doc.source?.rawText || 'Aucun texte source disponible pour ce document.'}
                </pre>
              </div>
            </div>
          </section>

          {/* Récapitulatif financier */}
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Totaux calculés (FCFA)</h2>
              <span className="text-[11px] text-gray-500">
                {doc.totals.isSimulated ? 'Calcul simulé (Démo)' : 'Moteur déterministe'}
              </span>
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-gray-600">Sous-total brut HT</dt>
                <dd className="font-mono-num text-gray-900">{formatFcfa(previewTotals.subtotalHt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Total remises</dt>
                <dd className="font-mono-num text-gray-900">
                  {formatFcfa(-previewTotals.totalDiscount)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Total net HT</dt>
                <dd className="font-mono-num font-medium text-gray-900">
                  {formatFcfa(previewTotals.netHt)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">TVA configurée ({doc.totals.vatRate} %)</dt>
                <dd className="font-mono-num text-gray-900">{formatFcfa(previewTotals.vatAmount)}</dd>
              </div>
              <div className="pt-2.5 border-t border-gray-200 flex justify-between items-baseline">
                <dt className="text-sm font-semibold text-gray-900">Total TTC</dt>
                <dd className="text-lg font-semibold font-mono-num text-emerald-900">
                  {formatFcfa(previewTotals.totalTtc)}
                </dd>
              </div>
            </dl>
            {dirty && (
              <p className="text-[11px] text-amber-800">
                Modifications locales non encore enregistrées — cliquez sur « Enregistrer les corrections » pour recalculer les contrôles métier.
              </p>
            )}
          </section>
        </div>

        {/* Colonne droite : Zones de vérification + Lignes d'articles */}
        <div className="xl:col-span-7 space-y-6">
          {/* Zone 1 : Anomalies signalées par le moteur métier */}
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={`w-4 h-4 ${
                    blockingAnomalies.length > 0 ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                />
                <h2 className="text-sm font-semibold text-gray-900">
                  Anomalies signalées par le moteur métier ({doc.anomalies.length})
                </h2>
              </div>
              <span className="text-[11px] text-gray-500">
                {blockingAnomalies.length > 0
                  ? `${blockingAnomalies.length} blocage(s) actif(s)`
                  : 'Aucun blocage actif'}
              </span>
            </div>

            {doc.anomalies.length === 0 ? (
              <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
                Toutes les règles de contrôle sont satisfaites. Ce brouillon est éligible à la validation humaine.
              </div>
            ) : (
              <ul className="space-y-2">
                {doc.anomalies.map((anom) => (
                  <li
                    key={anom.id}
                    className={`p-3 rounded-md border text-xs ${
                      anom.severity === AnomalySeverity.BLOQUANT
                        ? 'bg-rose-50/70 border-rose-200'
                        : anom.severity === AnomalySeverity.AVERTISSEMENT
                          ? 'bg-amber-50/70 border-amber-200'
                          : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-900">{anom.title}</span>
                      <SeverityBadge severity={anom.severity} />
                    </div>
                    <p className="mt-1 text-gray-700">{anom.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Zone 2 : Champs manquants */}
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Champs manquants ({missingFields.length})
              </h2>
              <span className="text-xs text-gray-500">Jamais inventés automatiquement</span>
            </div>
            {missingFields.length === 0 ? (
              <p className="text-xs text-gray-500">Aucun champ manquant.</p>
            ) : (
              <div className="space-y-3">{missingFields.map(renderFieldRow)}</div>
            )}
          </section>

          {/* Zone 3 : Champs à confirmer */}
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Champs à confirmer ({toConfirmFields.length})
              </h2>
              <span className="text-xs text-gray-500">Vérifiez la valeur puis confirmez</span>
            </div>
            {toConfirmFields.length === 0 ? (
              <p className="text-xs text-gray-500">Tous les champs renseignés ont été confirmés.</p>
            ) : (
              <div className="space-y-3">{toConfirmFields.map(renderFieldRow)}</div>
            )}
          </section>

          {/* Zone 4 : Champs vérifiés */}
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Champs vérifiés ({verifiedFields.length})
              </h2>
              <span className="text-xs text-gray-500">Modifiables tant que le statut reste BROUILLON</span>
            </div>
            {verifiedFields.length === 0 ? (
              <p className="text-xs text-gray-500">Aucun champ marqué comme vérifié pour l’instant.</p>
            ) : (
              <div className="space-y-3">{verifiedFields.map(renderFieldRow)}</div>
            )}

            <div className="pt-2">
              <label
                htmlFor="client-address-field"
                className="block text-xs font-semibold text-gray-900 mb-1"
              >
                Adresse du client
              </label>
              <input
                id="client-address-field"
                type="text"
                disabled={!isEditable}
                value={clientAddress}
                onChange={(e) => {
                  setDirty(true);
                  setClientAddress(e.target.value);
                }}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 disabled:bg-gray-50"
              />
            </div>
          </section>

          {/* Lignes d'articles */}
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Lignes d’articles ({lines.length})
                </h2>
                <p className="text-xs text-gray-500">
                  Quantités, prix unitaires HT en FCFA et remises (%)
                </p>
              </div>
              {isEditable && (
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter une ligne
                </button>
              )}
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => {
                const lineNet =
                  Math.round(line.quantity * line.unitPrice) -
                  Math.round(
                    (Math.round(line.quantity * line.unitPrice) * (line.discountPercent || 0)) /
                      100
                  );
                return (
                  <div
                    key={line.id}
                    className="p-3.5 rounded-md border border-gray-200 bg-gray-50/40 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-700">
                        Ligne {index + 1}
                        {line.confidence !== undefined && line.confidence !== null && (
                          <span className="ml-2 font-normal text-gray-500">
                            · Confiance <ConfidenceIndicator confidence={line.confidence} />
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono-num font-semibold text-gray-900">
                          Net HT : {formatFcfa(lineNet)}
                        </span>
                        {isEditable && lines.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Supprimer la ligne ${index + 1}`}
                            onClick={() => removeLine(line.id)}
                            className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">
                          Désignation
                        </label>
                        <input
                          type="text"
                          disabled={!isEditable}
                          value={line.description}
                          onChange={(e) => updateLine(line.id, { description: e.target.value })}
                          className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">
                          Quantité
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          disabled={!isEditable}
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line.id, { quantity: Number(e.target.value) || 0 })
                          }
                          className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-mono-num text-gray-900"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">
                          Prix unitaire (FCFA)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          disabled={!isEditable}
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(line.id, { unitPrice: Number(e.target.value) || 0 })
                          }
                          className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-mono-num text-gray-900"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">
                          Remise (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          disabled={!isEditable}
                          value={line.discountPercent}
                          onChange={(e) =>
                            updateLine(line.id, {
                              discountPercent: Number(e.target.value) || 0,
                            })
                          }
                          className={`w-full rounded border bg-white px-2.5 py-1.5 text-xs font-mono-num text-gray-900 ${
                            line.discountPercent > 30
                              ? 'border-rose-400 bg-rose-50/40'
                              : 'border-gray-300'
                          }`}
                        />
                      </div>
                    </div>

                    {line.sourceText && (
                      <p className="text-[11px] text-gray-500">
                        Source : <span className="font-mono text-gray-600">{line.sourceText}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
