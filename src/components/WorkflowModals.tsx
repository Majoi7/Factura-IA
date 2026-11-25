import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileMinus2,
  Mail,
  MessageCircle,
  Send,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import {
  AnomalySeverity,
  DocumentLineItem,
  DocumentRecord,
  EmissionChannel,
  EmissionRecord,
} from '../shared/schemas';
import { ApiError, api, formatDateTimeFr, formatFcfa } from '../services/api';
import { SeverityBadge } from './StatusLabel';

/* ===================== F. MODAL VALIDATION HUMAINE ===================== */

interface ValidationModalProps {
  document: DocumentRecord;
  demoUser: string;
  onClose: () => void;
  onValidated: (doc: DocumentRecord, alreadyValidated: boolean) => void;
  onGoToVerify: (doc: DocumentRecord) => void;
}

export function ValidationModal({
  document: doc,
  demoUser,
  onClose,
  onValidated,
  onGoToVerify,
}: ValidationModalProps) {
  // Clé d'idempotence fixe par ouverture de modale : garantit qu'un double-clic ne crée jamais de doublon
  const [idempotencyKey] = useState(
    () => `ui-val-${doc.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );
  const [confirmed, setConfirmed] = useState(false);
  const [validatorName, setValidatorName] = useState(demoUser);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const blockers = useMemo(
    () => doc.anomalies.filter((a) => a.severity === AnomalySeverity.BLOQUANT && !a.resolved),
    [doc.anomalies]
  );
  const unverifiedFields = useMemo(
    () => doc.fields.filter((f) => !f.verified),
    [doc.fields]
  );

  const canSubmit = blockers.length === 0 && confirmed && !submitting;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await api.validateDocument(doc.id, {
        confirmedByHuman: true,
        idempotencyKey,
        performedBy: validatorName.trim() || demoUser,
      });
      onValidated(res.document, res.alreadyValidated);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Échec de la validation humaine.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="validation-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 overflow-y-auto"
    >
      <div className="bg-white border border-gray-200 rounded-lg max-w-xl w-full shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-800" />
            <h2 id="validation-modal-title" className="text-base font-semibold text-gray-900">
              Validation humaine obligatoire
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fermer la fenêtre de validation"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-6 space-y-5">
          {/* Récapitulatif */}
          <div className="p-4 rounded-md bg-gray-50 border border-gray-200 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Brouillon concerné</span>
              <span className="font-mono-num font-semibold text-gray-900">{doc.draftCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Client</span>
              <span className="font-medium text-gray-900">{doc.clientName || '(Absent)'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">IFU Client</span>
              <span className="font-mono-num text-gray-900">{doc.clientIfu || '(Absent)'}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-200">
              <span className="font-semibold text-gray-900">Montant TTC recalculé</span>
              <span className="font-mono-num font-semibold text-emerald-900 text-sm">
                {formatFcfa(doc.totals.totalTtc)}
              </span>
            </div>
          </div>

          {/* Anomalies */}
          {blockers.length > 0 ? (
            <div className="p-4 rounded-md bg-rose-50 border border-rose-200 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                Validation bloquée ({blockers.length} anomalie(s) bloquante(s) active(s))
              </div>
              <ul className="space-y-1.5 text-xs text-rose-900">
                {blockers.map((b) => (
                  <li key={b.id} className="flex items-start justify-between gap-2">
                    <span>• {b.title} : {b.message}</span>
                    <SeverityBadge severity={b.severity} />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoToVerify(doc);
                }}
                className="mt-2 inline-flex items-center px-3 py-1.5 text-xs font-medium text-rose-900 bg-white border border-rose-300 rounded hover:bg-rose-100 cursor-pointer"
              >
                Retourner corriger les anomalies
              </button>
            </div>
          ) : (
            <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              Aucune anomalie bloquante détectée. Un numéro séquentiel unique sera attribué après confirmation.
            </div>
          )}

          {/* Champs restants à vérifier */}
          {unverifiedFields.length > 0 && blockers.length === 0 && (
            <div className="p-3.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <strong>Attention :</strong> {unverifiedFields.length} champ(s) n’ont pas encore été cochés comme vérifiés (
              {unverifiedFields.map((f) => f.label).join(', ')}).
            </div>
          )}

          <div>
            <label
              htmlFor="validator-user"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Validateur (utilisateur de démonstration)
            </label>
            <input
              id="validator-user"
              type="text"
              value={validatorName}
              onChange={(e) => setValidatorName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-900"
            />
          </div>

          <label className="flex items-start gap-2.5 text-xs text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={blockers.length > 0}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-emerald-800 focus:ring-emerald-700"
            />
            <span>
              Je confirme avoir vérifié les données et montants de ce brouillon. Je comprends que la validation attribuera un numéro unique définitif et rendra la facture <strong>strictement immuable</strong>.
            </span>
          </label>

          {errorMsg && (
            <div role="alert" className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-900">
              {errorMsg}
            </div>
          )}

          <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 rounded-md cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              {submitting ? 'Validation en cours...' : 'Confirmer et attribuer le numéro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ===================== G. MODAL SIMULATION D'ÉMISSION ===================== */

interface EmissionModalProps {
  document: DocumentRecord;
  enabledChannels: EmissionChannel[];
  onClose: () => void;
  onEmitted: (doc: DocumentRecord, emission: EmissionRecord) => void;
}

export function EmissionModal({
  document: doc,
  enabledChannels,
  onClose,
  onEmitted,
}: EmissionModalProps) {
  const initialChannel = enabledChannels[0] || EmissionChannel.COURRIEL;
  const [channel, setChannel] = useState<EmissionChannel>(initialChannel);
  const [recipient, setRecipient] = useState(
    initialChannel === EmissionChannel.COURRIEL
      ? doc.clientEmail || 'client.demo@exemple.bj'
      : doc.clientPhone || '+229 01 97 00 00 00'
  );
  const [customNote, setCustomNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ document: DocumentRecord; emission: EmissionRecord } | null>(
    null
  );

  const handleChannelChange = (ch: EmissionChannel) => {
    setChannel(ch);
    setErrorMsg(null);
    if (ch === EmissionChannel.COURRIEL) {
      setRecipient(doc.clientEmail || 'client.demo@exemple.bj');
    } else {
      setRecipient(doc.clientPhone || '+229 01 97 00 00 00');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await api.emitDocument(doc.id, {
        channel,
        recipient,
        customNote,
      });
      setResult(res);
      onEmitted(res.document, res.emission);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Erreur lors de la simulation.');
    } finally {
      setSubmitting(false);
    }
  };

  const channelMeta: Record<EmissionChannel, { label: string; icon: typeof Mail }> = {
    [EmissionChannel.COURRIEL]: { label: 'Courriel', icon: Mail },
    [EmissionChannel.WHATSAPP]: { label: 'WhatsApp', icon: MessageCircle },
    [EmissionChannel.SMS]: { label: 'SMS', icon: Smartphone },
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="emission-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 overflow-y-auto"
    >
      <div className="bg-white border border-gray-200 rounded-lg max-w-lg w-full shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-emerald-800" />
            <h2 id="emission-modal-title" className="text-base font-semibold text-gray-900">
              Simulation d’émission — {doc.invoiceNumber}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fermer la fenêtre d'émission"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {result ? (
          <div className="p-6 space-y-4">
            <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 space-y-2 text-xs text-emerald-950">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                Émission simulée enregistrée ({result.emission.status})
              </div>
              <p>{result.emission.resultNote}</p>
            </div>

            <dl className="space-y-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md p-4">
              <div className="flex justify-between">
                <dt className="text-gray-500">Document</dt>
                <dd className="font-mono-num font-semibold text-gray-900">
                  {result.document.invoiceNumber}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Canal choisi</dt>
                <dd className="font-medium text-gray-900">{result.emission.channel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Destinataire fictif</dt>
                <dd className="font-mono-num text-gray-900">{result.emission.recipient}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Date de simulation</dt>
                <dd className="font-mono-num text-gray-900">
                  {formatDateTimeFr(result.emission.simulatedAt)}
                </dd>
              </div>
            </dl>

            <div className="p-3 rounded bg-gray-50 border border-gray-200 text-xs text-gray-700">
              <p className="font-semibold text-gray-900 mb-1">Aperçu du message simulé :</p>
              <p>{result.emission.messagePreview}</p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-md cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-950">
              <strong>MODE DÉMONSTRATION — ÉMISSION NON RÉELLE :</strong> aucun courriel, message WhatsApp ou SMS réel n’est envoyé. L’opération est tracée localement pour la démonstration.
            </div>

            <div>
              <span className="block text-xs font-medium text-gray-700 mb-2">
                Choisir le canal de simulation
              </span>
              <div className="grid grid-cols-3 gap-2">
                {Object.values(EmissionChannel).map((ch) => {
                  const enabled = enabledChannels.includes(ch);
                  const Icon = channelMeta[ch].icon;
                  const active = channel === ch;
                  return (
                    <button
                      key={ch}
                      type="button"
                      disabled={!enabled}
                      onClick={() => handleChannelChange(ch)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-md border text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 ${
                        active
                          ? 'border-emerald-800 bg-emerald-50 text-emerald-900'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {channelMeta[ch].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label
                htmlFor="emission-recipient"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Destinataire fictif ({channel === EmissionChannel.COURRIEL ? 'adresse courriel' : 'numéro Bénin +229'})
              </label>
              <input
                id="emission-recipient"
                type="text"
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-900 font-mono-num"
              />
            </div>

            <div>
              <label
                htmlFor="emission-note"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Message d’accompagnement simulé (optionnel)
              </label>
              <textarea
                id="emission-note"
                rows={3}
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder={`Bonjour ${doc.clientName}, veuillez trouver ci-joint la facture ${doc.invoiceNumber} (${formatFcfa(doc.totals.totalTtc)} TTC).`}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-900"
              />
            </div>

            {errorMsg && (
              <div role="alert" className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-900">
                {errorMsg}
              </div>
            )}

            <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 rounded-md cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? 'Simulation...' : 'Lancer l’émission simulée'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ===================== H. MODAL CRÉATION D'AVOIR LIÉ ===================== */

interface CreditNoteModalProps {
  document: DocumentRecord;
  onClose: () => void;
  onCreated: (creditNote: DocumentRecord, rectifyingDraft: DocumentRecord | null) => void;
}

export function CreditNoteModal({
  document: doc,
  onClose,
  onCreated,
}: CreditNoteModalProps) {
  const [reason, setReason] = useState('');
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>(
    doc.lines.map((l) => l.id)
  );
  const [createRectifyingDraft, setCreateRectifyingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleLine = (id: string) => {
    setSelectedLineIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectedLines: DocumentLineItem[] = useMemo(
    () => doc.lines.filter((l) => selectedLineIds.includes(l.id)),
    [doc.lines, selectedLineIds]
  );

  const estimatedTtc = useMemo(() => {
    let net = 0;
    for (const l of selectedLines) {
      const g = Math.round(l.quantity * l.unitPrice);
      const d = Math.round((g * (l.discountPercent || 0)) / 100);
      net += g - d;
    }
    return net + Math.round((net * (doc.totals.vatRate || 18)) / 100);
  }, [selectedLines, doc.totals.vatRate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (reason.trim().length < 5) {
      setErrorMsg('Veuillez saisir un motif explicite d’au moins 5 caractères.');
      return;
    }
    if (selectedLines.length === 0) {
      setErrorMsg('Sélectionnez au moins une ligne concernée par l’avoir.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createCreditNote(doc.id, {
        reason: reason.trim(),
        lines: selectedLines,
        createRectifyingDraft,
      });
      onCreated(res.creditNote, res.rectifyingDraft);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Erreur lors de la création de l’avoir.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="credit-note-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 overflow-y-auto"
    >
      <div className="bg-white border border-gray-200 rounded-lg max-w-xl w-full shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileMinus2 className="w-4 h-4 text-rose-700" />
            <h2 id="credit-note-modal-title" className="text-base font-semibold text-gray-900">
              Créer un avoir lié à {doc.invoiceNumber}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fermer la fenêtre d'avoir"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-gray-600 leading-relaxed">
            La facture originale <strong className="font-mono-num text-gray-900">{doc.invoiceNumber}</strong> reste strictement intacte et immuable. Un avoir numéroté sera lié à cette facture dans le registre et le journal d’audit.
          </p>

          <div>
            <label
              htmlFor="credit-note-reason"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Motif de l’avoir *
            </label>
            <textarea
              id="credit-note-reason"
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. Erreur de quantité livrée, geste commercial convenu ou prestation reportée..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-900"
            />
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-gray-700">
              Lignes concernées par l’avoir
            </span>
            <div className="divide-y divide-gray-200 border border-gray-200 rounded-md max-h-48 overflow-y-auto">
              {doc.lines.map((line) => {
                const checked = selectedLineIds.includes(line.id);
                const g = Math.round(line.quantity * line.unitPrice);
                const net = g - Math.round((g * (line.discountPercent || 0)) / 100);
                return (
                  <label
                    key={line.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs hover:bg-gray-50 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLine(line.id)}
                        className="rounded border-gray-300 text-rose-700"
                      />
                      <span className="truncate text-gray-900">
                        {line.description} ({line.quantity} {line.unit})
                      </span>
                    </span>
                    <span className="font-mono-num font-medium text-gray-900 whitespace-nowrap">
                      {formatFcfa(-net)} HT
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-between text-xs pt-1">
              <span className="text-gray-600">Montant estimé de l’avoir TTC</span>
              <span className="font-mono-num font-semibold text-rose-800">
                {formatFcfa(-estimatedTtc)}
              </span>
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-gray-800 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={createRectifyingDraft}
              onChange={(e) => setCreateRectifyingDraft(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-emerald-800"
            />
            <span>
              Créer également un nouveau <strong>brouillon de facture rectificative</strong> (non numéroté) prêt à être corrigé et validé après cet avoir.
            </span>
          </label>

          {errorMsg && (
            <div role="alert" className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-900">
              {errorMsg}
            </div>
          )}

          <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-rose-700 hover:bg-rose-800 disabled:opacity-50 rounded-md cursor-pointer"
            >
              <FileMinus2 className="w-3.5 h-3.5" />
              {submitting ? 'Création...' : 'Émettre l’avoir lié'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
