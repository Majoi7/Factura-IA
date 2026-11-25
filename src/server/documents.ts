/**
 * Moteur de gestion du cycle de vie des documents — Rôle D (Jého).
 *
 * Garanties métier :
 * 1. Statuts stricts : BROUILLON, VALIDÉE, ÉMISE, AVOIR.
 * 2. Numéro unique attribué UNIQUEMENT après validation humaine (jamais à la création du brouillon).
 * 3. Validation interdite si au moins une anomalie BLOQUANT est active.
 * 4. Validation idempotente (double clic ou rejeu retourne exactement le document validé sans doublon).
 * 5. Validations concurrentes sécurisées par transaction SQLite BEGIN IMMEDIATE + contraintes UNIQUE.
 * 6. Immutabilité stricte des documents VALIDÉE, ÉMISE et AVOIR.
 * 7. Corrections post-validation uniquement via création d'un AVOIR lié à la facture d'origine.
 * 8. Journalisation complète et persistante dans audit_events.
 */

import crypto from 'node:crypto';
import {
  AnomalyItem,
  AnomalySeverity,
  AppMode,
  AuditActionType,
  CalculationResult,
  CompanySettings,
  DashboardMetrics,
  DocumentLineItem,
  DocumentRecord,
  DocumentStatus,
  DomainError,
  EmissionChannel,
  EmissionRecord,
  ExtractedField,
  ExtractionInput,
  SourceAttachment,
} from '../shared/schemas';
import {
  AdapterRegistry,
  runCalculationAdapter,
  runControlsAdapter,
  runExtractionAdapter,
} from './adapters';
import { listAuditEvents, recordAuditEvent } from './audit';
import {
  FacturaDatabase,
  getSettings,
  insertDefaultSettings,
  nextSequenceNumber,
  populateSeedData,
} from './db';
import { DEFAULT_COMPANY_SETTINGS } from './demo/seedData';

export interface UpdateDraftPayload {
  clientName?: string;
  clientIfu?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  commercialReference?: string;
  issueDate?: string;
  dueDate?: string;
  paymentTerms?: string;
  fields?: ExtractedField[];
  lines?: DocumentLineItem[];
  performedBy?: string;
}

export interface ValidateDocumentPayload {
  idempotencyKey?: string;
  confirmedByHuman: boolean;
  performedBy?: string;
}

export interface CreateCreditNotePayload {
  reason: string;
  lines?: DocumentLineItem[];
  performedBy?: string;
  createRectifyingDraft?: boolean;
}

function hydrateDocument(
  fdb: FacturaDatabase,
  row: Record<string, unknown>
): DocumentRecord {
  const id = String(row.id);

  const emissionRows = fdb.db
    .prepare('SELECT * FROM emissions WHERE document_id = ? ORDER BY simulated_at DESC')
    .all(id) as Record<string, unknown>[];

  const emissions: EmissionRecord[] = emissionRows.map((e) => ({
    id: String(e.id),
    documentId: String(e.document_id),
    channel: e.channel as EmissionChannel,
    recipient: String(e.recipient),
    status: 'SIMULÉ_ENVOYÉ',
    simulatedAt: String(e.simulated_at),
    messagePreview: String(e.message_preview),
    resultNote: String(e.result_note),
    performedBy: String(e.performed_by),
    isSimulated: true,
  }));

  const creditRows = fdb.db
    .prepare('SELECT id FROM documents WHERE original_document_id = ? ORDER BY created_at DESC')
    .all(id) as { id: string }[];

  return {
    id,
    invoiceNumber: row.invoice_number ? String(row.invoice_number) : null,
    draftCode: String(row.draft_code),
    status: row.status as DocumentStatus,
    clientName: String(row.client_name),
    clientIfu: String(row.client_ifu ?? ''),
    clientEmail: String(row.client_email ?? ''),
    clientPhone: String(row.client_phone ?? ''),
    clientAddress: String(row.client_address ?? ''),
    commercialReference: String(row.commercial_reference ?? ''),
    issueDate: String(row.issue_date ?? ''),
    dueDate: String(row.due_date ?? ''),
    paymentTerms: String(row.payment_terms ?? ''),
    currency: 'XOF',
    fields: JSON.parse(String(row.fields_json || '[]')) as ExtractedField[],
    lines: JSON.parse(String(row.lines_json || '[]')) as DocumentLineItem[],
    anomalies: JSON.parse(String(row.anomalies_json || '[]')) as AnomalyItem[],
    totals: JSON.parse(String(row.totals_json)) as CalculationResult,
    source: row.source_json ? (JSON.parse(String(row.source_json)) as SourceAttachment) : null,
    originalDocumentId: row.original_document_id ? String(row.original_document_id) : null,
    originalInvoiceNumber: row.original_invoice_number ? String(row.original_invoice_number) : null,
    creditNoteReason: row.credit_note_reason ? String(row.credit_note_reason) : null,
    validatedAt: row.validated_at ? String(row.validated_at) : null,
    validatedBy: row.validated_by ? String(row.validated_by) : null,
    validationIdempotencyKey: row.validation_idempotency_key
      ? String(row.validation_idempotency_key)
      : null,
    emissions,
    linkedCreditNoteIds: creditRows.map((c) => c.id),
    rectifiesCreditNoteId: row.rectifies_credit_note_id
      ? String(row.rectifies_credit_note_id)
      : null,
    isDemoData: Number(row.is_demo_data) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function getDocumentById(fdb: FacturaDatabase, id: string): DocumentRecord {
  const row = fdb.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    throw new DomainError('DOCUMENT_NOT_FOUND', `Document introuvable (${id}).`, 404);
  }
  return hydrateDocument(fdb, row);
}

export function listDocuments(
  fdb: FacturaDatabase,
  filters?: { status?: string; search?: string }
): DocumentRecord[] {
  const clauses: string[] = [];
  const params: string[] = [];

  if (filters?.status && filters.status !== 'ALL') {
    clauses.push('status = ?');
    params.push(filters.status);
  }

  if (filters?.search && filters.search.trim()) {
    const q = `%${filters.search.trim().toLowerCase()}%`;
    clauses.push(
      '(LOWER(COALESCE(invoice_number, "")) LIKE ? OR LOWER(draft_code) LIKE ? OR LOWER(client_name) LIKE ? OR LOWER(commercial_reference) LIKE ?)'
    );
    params.push(q, q, q, q);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = fdb.db
    .prepare(`SELECT * FROM documents ${where} ORDER BY created_at DESC, rowid DESC`)
    .all(...params) as Record<string, unknown>[];

  return rows.map((row) => hydrateDocument(fdb, row));
}

export function getDashboardMetrics(fdb: FacturaDatabase): DashboardMetrics {
  const allDocs = listDocuments(fdb);
  let draftCount = 0;
  let validatedCount = 0;
  let issuedCount = 0;
  let creditNoteCount = 0;
  let pendingVerificationCount = 0;
  let blockingAnomalyCount = 0;
  let totalValidatedAndIssuedTtc = 0;

  for (const doc of allDocs) {
    if (doc.status === DocumentStatus.BROUILLON) {
      draftCount += 1;
      const hasUnverified =
        doc.fields.some((f) => !f.verified || !f.value.trim()) ||
        doc.anomalies.some((a) => !a.resolved && a.severity === AnomalySeverity.BLOQUANT);
      if (hasUnverified) {
        pendingVerificationCount += 1;
      }
      blockingAnomalyCount += doc.anomalies.filter(
        (a) => a.severity === AnomalySeverity.BLOQUANT && !a.resolved
      ).length;
    } else if (doc.status === DocumentStatus.VALIDEE) {
      validatedCount += 1;
      totalValidatedAndIssuedTtc += doc.totals.totalTtc;
    } else if (doc.status === DocumentStatus.EMISE) {
      issuedCount += 1;
      totalValidatedAndIssuedTtc += doc.totals.totalTtc;
    } else if (doc.status === DocumentStatus.AVOIR) {
      creditNoteCount += 1;
    }
  }

  const recentAudit = listAuditEvents(fdb.db, { limit: 8 });

  return {
    draftCount,
    validatedCount,
    issuedCount,
    creditNoteCount,
    pendingVerificationCount,
    blockingAnomalyCount,
    totalValidatedAndIssuedTtc,
    recentDocuments: allDocs.slice(0, 6),
    recentAudit,
  };
}

/**
 * Crée un brouillon à partir d'une source importée (PDF, image ou message commercial).
 * N'attribue JAMAIS de numéro définitif de facture à ce stade.
 */
export async function createDraftFromSource(
  fdb: FacturaDatabase,
  input: ExtractionInput,
  performedBy?: string,
  registry?: AdapterRegistry
): Promise<DocumentRecord> {
  const settings = getSettings(fdb.db);
  const actor = performedBy || settings.demoUser;

  const extracted = await runExtractionAdapter(settings.mode, input, registry);
  const anomalies = await runControlsAdapter(
    settings.mode,
    {
      clientName: extracted.clientName,
      clientIfu: extracted.clientIfu,
      commercialReference: extracted.commercialReference,
      issueDate: extracted.issueDate,
      dueDate: extracted.dueDate,
      lines: extracted.lines,
      fields: extracted.fields,
    },
    registry
  );
  const totals = await runCalculationAdapter(
    settings.mode,
    extracted.lines,
    settings.defaultVatRate,
    registry
  );

  const now = new Date().toISOString();
  const id = `doc-${crypto.randomUUID().slice(0, 12)}`;
  const source: SourceAttachment = {
    fileName: input.fileName || 'message-commercial.txt',
    mimeType: input.mimeType || 'text/plain',
    sourceType: input.sourceType,
    sizeBytes: input.sizeBytes || Buffer.byteLength(input.rawText || '', 'utf8'),
    rawText: input.rawText || '',
    previewDataUrl: input.previewDataUrl ?? null,
    uploadedAt: now,
  };

  return fdb.withImmediateTransaction(() => {
    const draftCode = nextSequenceNumber(fdb.db, 'BR', 2026);

    fdb.db
      .prepare(`
        INSERT INTO documents (
          id, invoice_number, draft_code, status, client_name, client_ifu, client_email,
          client_phone, client_address, commercial_reference, issue_date, due_date,
          payment_terms, currency, fields_json, lines_json, anomalies_json, totals_json,
          source_json, original_document_id, original_invoice_number, credit_note_reason,
          validated_at, validated_by, validation_idempotency_key, rectifies_credit_note_id,
          is_demo_data, created_at, updated_at
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'XOF', ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)
      `)
      .run(
        id,
        draftCode,
        DocumentStatus.BROUILLON,
        extracted.clientName,
        extracted.clientIfu,
        extracted.clientEmail,
        extracted.clientPhone,
        extracted.clientAddress,
        extracted.commercialReference,
        extracted.issueDate,
        extracted.dueDate,
        extracted.paymentTerms,
        JSON.stringify(extracted.fields),
        JSON.stringify(extracted.lines),
        JSON.stringify(anomalies),
        JSON.stringify(totals),
        JSON.stringify(source),
        settings.mode === AppMode.DEMO ? 1 : 0,
        now,
        now
      );

    recordAuditEvent(fdb.db, {
      actionType: AuditActionType.SOURCE_IMPORTEE,
      documentId: id,
      documentLabel: draftCode,
      user: actor,
      details: `Source importée (${source.sourceType}) : ${source.fileName}`,
      newValue: source.fileName,
      timestamp: now,
    });

    recordAuditEvent(fdb.db, {
      actionType: AuditActionType.DOCUMENT_CREE,
      documentId: id,
      documentLabel: draftCode,
      user: actor,
      details: `Brouillon ${draftCode} créé (${extracted.isSimulated ? 'extraction simulée MODE DÉMO' : 'extraction externe'}). Aucun numéro de facture attribué.`,
      newValue: `${DocumentStatus.BROUILLON} (${anomalies.filter((a) => a.severity === AnomalySeverity.BLOQUANT).length} blocage(s))`,
      timestamp: now,
    });

    return getDocumentById(fdb, id);
  });
}

/**
 * Met à jour un document BROUILLON (corrections humaines, vérifications, lignes d'articles).
 * Refuse strictement toute modification si le document est VALIDÉE, ÉMISE ou AVOIR (immutabilité).
 */
export async function updateDraftDocument(
  fdb: FacturaDatabase,
  id: string,
  payload: UpdateDraftPayload,
  registry?: AdapterRegistry
): Promise<DocumentRecord> {
  const existing = getDocumentById(fdb, id);
  if (existing.status !== DocumentStatus.BROUILLON) {
    throw new DomainError(
      'DOCUMENT_IMMUTABLE',
      `Ce document (${existing.invoiceNumber || existing.draftCode}) a le statut ${existing.status} et est strictement immuable. Pour le corriger, créez un avoir lié.`,
      409
    );
  }

  const settings = getSettings(fdb.db);
  const actor = payload.performedBy || settings.demoUser;

  // Synchroniser les champs structurés et les propriétés de tête
  const nextClientName = payload.clientName ?? existing.clientName;
  const nextClientIfu = payload.clientIfu ?? existing.clientIfu;
  const nextClientEmail = payload.clientEmail ?? existing.clientEmail;
  const nextClientPhone = payload.clientPhone ?? existing.clientPhone;
  const nextClientAddress = payload.clientAddress ?? existing.clientAddress;
  const nextRef = payload.commercialReference ?? existing.commercialReference;
  const nextIssueDate = payload.issueDate ?? existing.issueDate;
  const nextDueDate = payload.dueDate ?? existing.dueDate;
  const nextPaymentTerms = payload.paymentTerms ?? existing.paymentTerms;
  const nextLines = payload.lines ?? existing.lines;

  const baseFields = payload.fields ?? existing.fields;
  const valueByKey: Record<string, string> = {
    clientName: nextClientName,
    clientIfu: nextClientIfu,
    clientEmail: nextClientEmail,
    clientPhone: nextClientPhone,
    commercialReference: nextRef,
    issueDate: nextIssueDate,
    dueDate: nextDueDate,
    paymentTerms: nextPaymentTerms,
  };

  const nextFields: ExtractedField[] = baseFields.map((f) => {
    if (Object.prototype.hasOwnProperty.call(valueByKey, f.key)) {
      return { ...f, value: valueByKey[f.key] };
    }
    return f;
  });

  // Recalculer contrôles et totaux via la couche d'adaptation
  const nextAnomalies = await runControlsAdapter(
    settings.mode,
    {
      clientName: nextClientName,
      clientIfu: nextClientIfu,
      commercialReference: nextRef,
      issueDate: nextIssueDate,
      dueDate: nextDueDate,
      lines: nextLines,
      fields: nextFields,
    },
    registry
  );

  const nextTotals = await runCalculationAdapter(
    settings.mode,
    nextLines,
    settings.defaultVatRate,
    registry
  );

  const now = new Date().toISOString();

  return fdb.withImmediateTransaction(() => {
    // Re-vérifier l'immutabilité dans la transaction pour éviter toute course critique
    const current = getDocumentById(fdb, id);
    if (current.status !== DocumentStatus.BROUILLON) {
      throw new DomainError(
        'DOCUMENT_IMMUTABLE',
        `Modification refusée : le document est passé au statut ${current.status}.`,
        409
      );
    }

    fdb.db
      .prepare(`
        UPDATE documents SET
          client_name = ?,
          client_ifu = ?,
          client_email = ?,
          client_phone = ?,
          client_address = ?,
          commercial_reference = ?,
          issue_date = ?,
          due_date = ?,
          payment_terms = ?,
          fields_json = ?,
          lines_json = ?,
          anomalies_json = ?,
          totals_json = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        nextClientName,
        nextClientIfu,
        nextClientEmail,
        nextClientPhone,
        nextClientAddress,
        nextRef,
        nextIssueDate,
        nextDueDate,
        nextPaymentTerms,
        JSON.stringify(nextFields),
        JSON.stringify(nextLines),
        JSON.stringify(nextAnomalies),
        JSON.stringify(nextTotals),
        now,
        id
      );

    // Enregistrer les différences dans le journal d'audit (anciennes et nouvelles valeurs)
    const diffPairs: Array<[string, string, string]> = [
      ['Client', current.clientName, nextClientName],
      ['IFU Client', current.clientIfu, nextClientIfu],
      ['Référence commerciale', current.commercialReference, nextRef],
      ['Date du document', current.issueDate, nextIssueDate],
      ['Date d’échéance', current.dueDate, nextDueDate],
      ['Conditions de paiement', current.paymentTerms, nextPaymentTerms],
      ['Courriel client', current.clientEmail, nextClientEmail],
      ['Téléphone client', current.clientPhone, nextClientPhone],
    ];

    let loggedDiff = false;
    for (const [label, oldVal, newVal] of diffPairs) {
      if (oldVal !== newVal) {
        loggedDiff = true;
        recordAuditEvent(fdb.db, {
          actionType: AuditActionType.CHAMP_CORRIGE,
          documentId: id,
          documentLabel: current.draftCode,
          user: actor,
          details: `Correction manuelle du champ « ${label} ».`,
          oldValue: oldVal || '(vide)',
          newValue: newVal || '(vide)',
          timestamp: now,
        });
      }
    }

    if (JSON.stringify(current.lines) !== JSON.stringify(nextLines)) {
      loggedDiff = true;
      recordAuditEvent(fdb.db, {
        actionType: AuditActionType.LIGNE_MODIFIEE,
        documentId: id,
        documentLabel: current.draftCode,
        user: actor,
        details: `Mise à jour des lignes d'articles (${nextLines.length} ligne(s) — TTC recalculé : ${nextTotals.totalTtc.toLocaleString('fr-FR')} FCFA).`,
        oldValue: `${current.totals.totalTtc.toLocaleString('fr-FR')} FCFA TTC`,
        newValue: `${nextTotals.totalTtc.toLocaleString('fr-FR')} FCFA TTC`,
        timestamp: now,
      });
    }

    if (!loggedDiff && JSON.stringify(current.fields) !== JSON.stringify(nextFields)) {
      const verifiedCount = nextFields.filter((f) => f.verified).length;
      recordAuditEvent(fdb.db, {
        actionType: AuditActionType.CHAMP_VERIFIE,
        documentId: id,
        documentLabel: current.draftCode,
        user: actor,
        details: `Mise à jour du statut de vérification des champs (${verifiedCount}/${nextFields.length} vérifié(s)).`,
        oldValue: null,
        newValue: `${verifiedCount}/${nextFields.length} vérifiés`,
        timestamp: now,
      });
    }

    return getDocumentById(fdb, id);
  });
}

/**
 * Validation humaine explicite d'un brouillon :
 * - Vérifie la confirmation humaine.
 * - Refuse si une anomalie BLOQUANT est active.
 * - Idempotente (par clé d'idempotence OU rejeu sur facture déjà validée).
 * - Atomique et sûre face aux validations concurrentes via BEGIN IMMEDIATE + UNIQUE.
 * - Attribue un numéro séquentiel unique FAC-2026-XXXX.
 * - Rend le document immuable et trace l'audit.
 */
export function validateDocument(
  fdb: FacturaDatabase,
  id: string,
  payload: ValidateDocumentPayload
): { document: DocumentRecord; alreadyValidated: boolean } {
  if (!payload.confirmedByHuman) {
    throw new DomainError(
      'HUMAN_CONFIRMATION_REQUIRED',
      'La confirmation humaine explicite est obligatoire avant de valider la facture.',
      400
    );
  }

  const settings = getSettings(fdb.db);
  const actor = payload.performedBy || settings.demoUser;

  return fdb.withImmediateTransaction(() => {
    // 1. Vérifier d'abord la clé d'idempotence si fournie
    if (payload.idempotencyKey) {
      const byKey = fdb.db
        .prepare('SELECT * FROM documents WHERE validation_idempotency_key = ?')
        .get(payload.idempotencyKey) as Record<string, unknown> | undefined;
      if (byKey) {
        return {
          document: hydrateDocument(fdb, byKey),
          alreadyValidated: true,
        };
      }
    }

    const current = getDocumentById(fdb, id);

    // 2. Idempotence en cas de double clic ou rejeu sur document déjà VALIDÉE ou ÉMISE
    if (current.status === DocumentStatus.VALIDEE || current.status === DocumentStatus.EMISE) {
      return {
        document: current,
        alreadyValidated: true,
      };
    }

    if (current.status === DocumentStatus.AVOIR) {
      throw new DomainError(
        'INVALID_STATUS_TRANSITION',
        'Un avoir est déjà validé et immuable.',
        409
      );
    }

    // 3. Vérifier l'absence totale d'anomalie BLOQUANT
    const blockers = current.anomalies.filter(
      (a) => a.severity === AnomalySeverity.BLOQUANT && !a.resolved
    );
    if (blockers.length > 0) {
      throw new DomainError(
        'BLOCKING_ANOMALIES_ACTIVE',
        `Validation impossible : ${blockers.length} anomalie(s) bloquante(s) non résolue(s) (${blockers.map((b) => b.title).join(' ; ')}).`,
        422
      );
    }

    // 4. Attribuer le numéro unique définitif dans la transaction atomique
    const invoiceNumber = nextSequenceNumber(fdb.db, 'FAC', 2026);
    const now = new Date().toISOString();
    const idemKey = payload.idempotencyKey || `val-${id}-${crypto.randomUUID().slice(0, 8)}`;

    fdb.db
      .prepare(`
        UPDATE documents SET
          status = ?,
          invoice_number = ?,
          validated_at = ?,
          validated_by = ?,
          validation_idempotency_key = ?,
          updated_at = ?
        WHERE id = ? AND status = 'BROUILLON'
      `)
      .run(DocumentStatus.VALIDEE, invoiceNumber, now, actor, idemKey, now, id);

    recordAuditEvent(fdb.db, {
      actionType: AuditActionType.DOCUMENT_VALIDE,
      documentId: id,
      documentLabel: invoiceNumber,
      user: actor,
      details: `Validation humaine confirmée pour le brouillon ${current.draftCode}. Document verrouillé en lecture seule.`,
      oldValue: DocumentStatus.BROUILLON,
      newValue: DocumentStatus.VALIDEE,
      timestamp: now,
    });

    recordAuditEvent(fdb.db, {
      actionType: AuditActionType.NUMERO_ATTRIBUE,
      documentId: id,
      documentLabel: invoiceNumber,
      user: actor,
      details: `Attribution du numéro unique séquentiel ${invoiceNumber} après validation humaine.`,
      oldValue: `${current.draftCode} (sans numéro)`,
      newValue: invoiceNumber,
      timestamp: now,
    });

    return {
      document: getDocumentById(fdb, id),
      alreadyValidated: false,
    };
  });
}

/**
 * Crée un AVOIR lié à une facture VALIDÉE ou ÉMISE.
 * La facture originale reste strictement intacte et immuable.
 */
export async function createCreditNote(
  fdb: FacturaDatabase,
  originalDocumentId: string,
  payload: CreateCreditNotePayload,
  registry?: AdapterRegistry
): Promise<{ creditNote: DocumentRecord; rectifyingDraft: DocumentRecord | null }> {
  const original = getDocumentById(fdb, originalDocumentId);

  if (
    original.status !== DocumentStatus.VALIDEE &&
    original.status !== DocumentStatus.EMISE
  ) {
    throw new DomainError(
      'CREDIT_NOTE_REQUIRES_VALIDATED_INVOICE',
      `Un avoir ne peut être créé que sur une facture VALIDÉE ou ÉMISE (statut actuel : ${original.status}).`,
      409
    );
  }

  if (!payload.reason || payload.reason.trim().length < 5) {
    throw new DomainError(
      'CREDIT_NOTE_REASON_REQUIRED',
      'Veuillez renseigner un motif explicite pour l’avoir (au moins 5 caractères).',
      400
    );
  }

  const settings = getSettings(fdb.db);
  const actor = payload.performedBy || settings.demoUser;
  const creditLines =
    payload.lines && payload.lines.length > 0 ? payload.lines : original.lines;

  // Consommer le résultat de calcul via l'adaptateur (ne jamais coder une fiscalité parallèle)
  const totals = await runCalculationAdapter(
    settings.mode,
    creditLines,
    settings.defaultVatRate,
    registry
  );

  const now = new Date().toISOString();
  const creditId = `doc-av-${crypto.randomUUID().slice(0, 10)}`;

  return fdb.withImmediateTransaction(() => {
    const creditNumber = nextSequenceNumber(fdb.db, 'AV', 2026);
    const draftRef = `AV-REF-${creditNumber.slice(-4)}`;

    fdb.db
      .prepare(`
        INSERT INTO documents (
          id, invoice_number, draft_code, status, client_name, client_ifu, client_email,
          client_phone, client_address, commercial_reference, issue_date, due_date,
          payment_terms, currency, fields_json, lines_json, anomalies_json, totals_json,
          source_json, original_document_id, original_invoice_number, credit_note_reason,
          validated_at, validated_by, validation_idempotency_key, rectifies_credit_note_id,
          is_demo_data, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'XOF', '[]', ?, '[]', ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
      `)
      .run(
        creditId,
        creditNumber,
        draftRef,
        DocumentStatus.AVOIR,
        original.clientName,
        original.clientIfu,
        original.clientEmail,
        original.clientPhone,
        original.clientAddress,
        `AVOIR SUR ${original.invoiceNumber}`,
        now.slice(0, 10),
        now.slice(0, 10),
        `Imputation / remboursement sur ${original.invoiceNumber}`,
        JSON.stringify(creditLines),
        JSON.stringify(totals),
        original.id,
        original.invoiceNumber,
        payload.reason.trim(),
        now,
        actor,
        `av-${creditId}`,
        settings.mode === AppMode.DEMO ? 1 : 0,
        now,
        now
      );

    recordAuditEvent(fdb.db, {
      actionType: AuditActionType.AVOIR_CREE,
      documentId: creditId,
      documentLabel: creditNumber,
      user: actor,
      details: `Création de l'avoir ${creditNumber} lié à la facture immuable ${original.invoiceNumber}. Motif : ${payload.reason.trim()}`,
      oldValue: original.invoiceNumber,
      newValue: `${creditNumber} (${totals.totalTtc.toLocaleString('fr-FR')} FCFA TTC)`,
      timestamp: now,
    });

    let rectifyingDraft: DocumentRecord | null = null;
    if (payload.createRectifyingDraft) {
      const rectId = `doc-rect-${crypto.randomUUID().slice(0, 10)}`;
      const rectDraftCode = nextSequenceNumber(fdb.db, 'BR', 2026);
      fdb.db
        .prepare(`
          INSERT INTO documents (
            id, invoice_number, draft_code, status, client_name, client_ifu, client_email,
            client_phone, client_address, commercial_reference, issue_date, due_date,
            payment_terms, currency, fields_json, lines_json, anomalies_json, totals_json,
            source_json, original_document_id, original_invoice_number, credit_note_reason,
            validated_at, validated_by, validation_idempotency_key, rectifies_credit_note_id,
            is_demo_data, created_at, updated_at
          ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'XOF', ?, ?, '[]', ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)
        `)
        .run(
          rectId,
          rectDraftCode,
          DocumentStatus.BROUILLON,
          original.clientName,
          original.clientIfu,
          original.clientEmail,
          original.clientPhone,
          original.clientAddress,
          `RECT-${original.commercialReference}`,
          now.slice(0, 10),
          original.dueDate,
          original.paymentTerms,
          JSON.stringify(original.fields),
          JSON.stringify(original.lines),
          JSON.stringify(original.totals),
          original.source ? JSON.stringify(original.source) : null,
          creditId,
          settings.mode === AppMode.DEMO ? 1 : 0,
          now,
          now
        );

      recordAuditEvent(fdb.db, {
        actionType: AuditActionType.FACTURE_RECTIFICATIVE_CREEE,
        documentId: rectId,
        documentLabel: rectDraftCode,
        user: actor,
        details: `Nouveau brouillon rectificatif ${rectDraftCode} préparé suite à l'avoir ${creditNumber} (sans numéro définitif).`,
        oldValue: creditNumber,
        newValue: rectDraftCode,
        timestamp: now,
      });

      rectifyingDraft = getDocumentById(fdb, rectId);
    }

    return {
      creditNote: getDocumentById(fdb, creditId),
      rectifyingDraft,
    };
  });
}

export function updateAppSettings(
  fdb: FacturaDatabase,
  patch: Partial<Pick<CompanySettings, 'productName' | 'mode' | 'enabledChannels' | 'demoUser'>>
): CompanySettings {
  const current = getSettings(fdb.db);
  const next: CompanySettings = {
    ...current,
    productName: patch.productName?.trim() || current.productName,
    mode: patch.mode ?? current.mode,
    enabledChannels:
      patch.enabledChannels && patch.enabledChannels.length > 0
        ? patch.enabledChannels
        : current.enabledChannels,
    demoUser: patch.demoUser?.trim() || current.demoUser,
  };

  return fdb.withImmediateTransaction(() => {
    insertDefaultSettings(fdb.db, next);

    if (patch.mode && patch.mode !== current.mode) {
      recordAuditEvent(fdb.db, {
        actionType: AuditActionType.MODE_CHANGE,
        documentId: null,
        documentLabel: 'SYSTÈME',
        user: next.demoUser,
        details: `Bascule du mode de fonctionnement : ${current.mode} → ${next.mode}.`,
        oldValue: current.mode,
        newValue: next.mode,
      });
    }

    return next;
  });
}

/**
 * Réinitialise les données de démonstration après confirmation explicite,
 * sans jamais altérer la structure de la base SQLite.
 */
export function resetDemoData(
  fdb: FacturaDatabase,
  confirmationPhrase: string,
  performedBy?: string
): { resetAt: string; documentCount: number } {
  if (confirmationPhrase.trim().toUpperCase() !== 'REINITIALISER') {
    throw new DomainError(
      'RESET_CONFIRMATION_REQUIRED',
      'Confirmation explicite requise : saisissez « REINITIALISER » pour restaurer les données de démonstration.',
      400
    );
  }

  const settings = getSettings(fdb.db);
  const actor = performedBy || settings.demoUser;
  const now = new Date().toISOString();

  return fdb.withImmediateTransaction(() => {
    // Supprimer dans l'ordre respectant les clés étrangères et la contrainte CHECK des avoirs
    fdb.db.exec('DELETE FROM emissions;');
    fdb.db.exec('UPDATE documents SET rectifies_credit_note_id = NULL;');
    fdb.db.exec("DELETE FROM documents WHERE status = 'AVOIR';");
    fdb.db.exec('DELETE FROM documents;');
    fdb.db.exec('DELETE FROM audit_events;');
    fdb.db.exec('DELETE FROM sequences;');

    insertDefaultSettings(fdb.db, {
      ...DEFAULT_COMPANY_SETTINGS,
      productName: settings.productName,
      mode: AppMode.DEMO,
    });
    populateSeedData(fdb.db);

    recordAuditEvent(fdb.db, {
      actionType: AuditActionType.REINITIALISATION_DEMO,
      documentId: null,
      documentLabel: 'BASE DÉMO',
      user: actor,
      details:
        'Réinitialisation complète du jeu de données de démonstration (structure SQLite préservée, retour en MODE DÉMO).',
      oldValue: null,
      newValue: 'Jeu de données initial restauré',
      timestamp: now,
    });

    const row = fdb.db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
    return { resetAt: now, documentCount: row.count };
  });
}
