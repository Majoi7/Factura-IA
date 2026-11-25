import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  AppMode,
  CompanySettings,
  EmissionChannel,
} from '../shared/schemas';
import { buildSeedDataset, DEFAULT_COMPANY_SETTINGS } from './demo/seedData';

export interface FacturaDatabase {
  db: DatabaseSync;
  dbPath: string;
  close(): void;
  withImmediateTransaction<T>(fn: () => T): T;
}

export function openFacturaDatabase(
  dbPath: string = process.env.FACTURA_DB_PATH || path.resolve(process.cwd(), 'data/factura_demo.db')
): FacturaDatabase {
  const dir = path.dirname(dbPath);
  if (dbPath !== ':memory:' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  initializeSchema(db);
  seedIfEmpty(db);

  return {
    db,
    dbPath,
    close() {
      db.close();
    },
    withImmediateTransaction<T>(fn: () => T): T {
      db.exec('BEGIN IMMEDIATE;');
      try {
        const result = fn();
        db.exec('COMMIT;');
        return result;
      } catch (err) {
        try {
          db.exec('ROLLBACK;');
        } catch {
          // Ignore rollback error if transaction already aborted
        }
        throw err;
      }
    },
  };
}

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      product_name TEXT NOT NULL,
      company_name TEXT NOT NULL,
      legal_form TEXT NOT NULL,
      ifu TEXT NOT NULL,
      rccm TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      country TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'XOF',
      currency_label TEXT NOT NULL DEFAULT 'FCFA (XOF)',
      default_vat_rate REAL NOT NULL DEFAULT 18,
      demo_user TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'DEMO',
      enabled_channels_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sequences (
      seq_key TEXT PRIMARY KEY,
      last_value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE,
      draft_code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('BROUILLON', 'VALIDÉE', 'ÉMISE', 'AVOIR')),
      client_name TEXT NOT NULL,
      client_ifu TEXT NOT NULL DEFAULT '',
      client_email TEXT NOT NULL DEFAULT '',
      client_phone TEXT NOT NULL DEFAULT '',
      client_address TEXT NOT NULL DEFAULT '',
      commercial_reference TEXT NOT NULL DEFAULT '',
      issue_date TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL DEFAULT '',
      payment_terms TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'XOF',
      fields_json TEXT NOT NULL DEFAULT '[]',
      lines_json TEXT NOT NULL DEFAULT '[]',
      anomalies_json TEXT NOT NULL DEFAULT '[]',
      totals_json TEXT NOT NULL,
      source_json TEXT,
      original_document_id TEXT REFERENCES documents(id),
      original_invoice_number TEXT,
      credit_note_reason TEXT,
      validated_at TEXT,
      validated_by TEXT,
      validation_idempotency_key TEXT UNIQUE,
      rectifies_credit_note_id TEXT REFERENCES documents(id),
      is_demo_data INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (status = 'BROUILLON' AND invoice_number IS NULL) OR
        (status != 'BROUILLON' AND invoice_number IS NOT NULL)
      ),
      CHECK (
        status != 'AVOIR' OR original_document_id IS NOT NULL
      )
    );

    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
    CREATE INDEX IF NOT EXISTS idx_documents_original ON documents(original_document_id);

    CREATE TABLE IF NOT EXISTS emissions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      channel TEXT NOT NULL CHECK (channel IN ('COURRIEL', 'WHATSAPP', 'SMS')),
      recipient TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SIMULÉ_ENVOYÉ',
      simulated_at TEXT NOT NULL,
      message_preview TEXT NOT NULL,
      result_note TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      is_simulated INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_emissions_document ON emissions(document_id);

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      document_id TEXT,
      document_label TEXT NOT NULL,
      user_name TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      details TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_document ON audit_events(document_id);
  `);
}

function seedIfEmpty(db: DatabaseSync): void {
  const settingsRow = db.prepare('SELECT id FROM app_settings WHERE id = 1').get();
  if (!settingsRow) {
    insertDefaultSettings(db, DEFAULT_COMPANY_SETTINGS);
  }

  const docCountRow = db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
  const auditCountRow = db.prepare('SELECT COUNT(*) as count FROM audit_events').get() as { count: number };
  if (docCountRow.count === 0 && auditCountRow.count === 0) {
    populateSeedData(db);
  }
}

export function insertDefaultSettings(db: DatabaseSync, s: CompanySettings): void {
  db.prepare(`
    INSERT OR REPLACE INTO app_settings (
      id, product_name, company_name, legal_form, ifu, rccm, address, city, country,
      email, phone, currency, currency_label, default_vat_rate, demo_user, mode, enabled_channels_json
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    s.productName,
    s.companyName,
    s.legalForm,
    s.ifu,
    s.rccm,
    s.address,
    s.city,
    s.country,
    s.email,
    s.phone,
    s.currency,
    s.currencyLabel,
    s.defaultVatRate,
    s.demoUser,
    s.mode,
    JSON.stringify(s.enabledChannels)
  );
}

export function populateSeedData(db: DatabaseSync): void {
  const seed = buildSeedDataset();

  const insertSeq = db.prepare('INSERT OR REPLACE INTO sequences (seq_key, last_value) VALUES (?, ?)');
  insertSeq.run(`FAC-${seed.sequences.invoiceYear}`, seed.sequences.invoiceLast);
  insertSeq.run(`AV-${seed.sequences.invoiceYear}`, seed.sequences.creditLast);
  insertSeq.run(`BR-${seed.sequences.invoiceYear}`, seed.sequences.draftLast);

  const insertDoc = db.prepare(`
    INSERT INTO documents (
      id, invoice_number, draft_code, status, client_name, client_ifu, client_email,
      client_phone, client_address, commercial_reference, issue_date, due_date,
      payment_terms, currency, fields_json, lines_json, anomalies_json, totals_json,
      source_json, original_document_id, original_invoice_number, credit_note_reason,
      validated_at, validated_by, validation_idempotency_key, rectifies_credit_note_id,
      is_demo_data, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Insert non-credit-notes first so foreign key original_document_id always resolves
  const ordered = [
    ...seed.documents.filter((d) => !d.originalDocumentId),
    ...seed.documents.filter((d) => d.originalDocumentId),
  ];

  for (const d of ordered) {
    insertDoc.run(
      d.id,
      d.invoiceNumber,
      d.draftCode,
      d.status,
      d.clientName,
      d.clientIfu,
      d.clientEmail,
      d.clientPhone,
      d.clientAddress,
      d.commercialReference,
      d.issueDate,
      d.dueDate,
      d.paymentTerms,
      d.currency,
      JSON.stringify(d.fields),
      JSON.stringify(d.lines),
      JSON.stringify(d.anomalies),
      JSON.stringify(d.totals),
      d.source ? JSON.stringify(d.source) : null,
      d.originalDocumentId,
      d.originalInvoiceNumber,
      d.creditNoteReason,
      d.validatedAt,
      d.validatedBy,
      d.validationIdempotencyKey,
      d.rectifiesCreditNoteId ?? null,
      d.isDemoData ? 1 : 0,
      d.createdAt,
      d.updatedAt
    );
  }

  const insertEmission = db.prepare(`
    INSERT INTO emissions (
      id, document_id, channel, recipient, status, simulated_at,
      message_preview, result_note, performed_by, is_simulated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const e of seed.emissions) {
    insertEmission.run(
      e.id,
      e.documentId,
      e.channel,
      e.recipient,
      e.status,
      e.simulatedAt,
      e.messagePreview,
      e.resultNote,
      e.performedBy,
      e.isSimulated ? 1 : 0
    );
  }

  const insertAudit = db.prepare(`
    INSERT INTO audit_events (
      id, action_type, document_id, document_label, user_name, timestamp, details, old_value, new_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const a of seed.auditEvents) {
    insertAudit.run(
      a.id,
      a.actionType,
      a.documentId,
      a.documentLabel,
      a.user,
      a.timestamp,
      a.details,
      a.oldValue,
      a.newValue
    );
  }
}

export function getSettings(db: DatabaseSync): CompanySettings {
  const row = db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as Record<string, unknown> | undefined;
  if (!row) {
    insertDefaultSettings(db, DEFAULT_COMPANY_SETTINGS);
    return DEFAULT_COMPANY_SETTINGS;
  }
  return {
    productName: String(row.product_name),
    companyName: String(row.company_name),
    legalForm: String(row.legal_form),
    ifu: String(row.ifu),
    rccm: String(row.rccm),
    address: String(row.address),
    city: String(row.city),
    country: String(row.country),
    email: String(row.email),
    phone: String(row.phone),
    currency: 'XOF',
    currencyLabel: String(row.currency_label),
    defaultVatRate: Number(row.default_vat_rate),
    demoUser: String(row.demo_user),
    mode: (row.mode === AppMode.INTEGRATION ? AppMode.INTEGRATION : AppMode.DEMO),
    enabledChannels: JSON.parse(String(row.enabled_channels_json)) as EmissionChannel[],
  };
}

export function nextSequenceNumber(db: DatabaseSync, prefix: 'FAC' | 'AV' | 'BR', year = 2026): string {
  const key = `${prefix}-${year}`;
  db.prepare('INSERT OR IGNORE INTO sequences (seq_key, last_value) VALUES (?, 0)').run(key);
  db.prepare('UPDATE sequences SET last_value = last_value + 1 WHERE seq_key = ?').run(key);
  const row = db.prepare('SELECT last_value FROM sequences WHERE seq_key = ?').get(key) as { last_value: number };
  return `${prefix}-${year}-${String(row.last_value).padStart(4, '0')}`;
}
