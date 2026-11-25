/**
 * Service de journalisation d'audit persistant et immuable (Rôle D — Jého).
 * Aucune API de modification ou de suppression individuelle des événements n'est exposée.
 */

import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AuditActionType, AuditEvent } from '../shared/schemas';

export interface RecordAuditParams {
  actionType: AuditActionType;
  documentId?: string | null;
  documentLabel: string;
  user: string;
  details: string;
  oldValue?: string | null;
  newValue?: string | null;
  timestamp?: string;
}

export function recordAuditEvent(db: DatabaseSync, params: RecordAuditParams): AuditEvent {
  const event: AuditEvent = {
    id: `aud-${crypto.randomUUID().slice(0, 12)}`,
    actionType: params.actionType,
    documentId: params.documentId ?? null,
    documentLabel: params.documentLabel,
    user: params.user,
    timestamp: params.timestamp ?? new Date().toISOString(),
    details: params.details,
    oldValue: params.oldValue ?? null,
    newValue: params.newValue ?? null,
  };

  db.prepare(`
    INSERT INTO audit_events (
      id, action_type, document_id, document_label, user_name, timestamp, details, old_value, new_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.actionType,
    event.documentId,
    event.documentLabel,
    event.user,
    event.timestamp,
    event.details,
    event.oldValue,
    event.newValue
  );

  return event;
}

function mapRowToAuditEvent(row: Record<string, unknown>): AuditEvent {
  return {
    id: String(row.id),
    actionType: row.action_type as AuditActionType,
    documentId: row.document_id ? String(row.document_id) : null,
    documentLabel: String(row.document_label),
    user: String(row.user_name),
    timestamp: String(row.timestamp),
    details: String(row.details),
    oldValue: row.old_value !== null && row.old_value !== undefined ? String(row.old_value) : null,
    newValue: row.new_value !== null && row.new_value !== undefined ? String(row.new_value) : null,
  };
}

export function listAuditEvents(
  db: DatabaseSync,
  options?: { actionType?: string; search?: string; limit?: number }
): AuditEvent[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (options?.actionType && options.actionType !== 'ALL') {
    clauses.push('action_type = ?');
    params.push(options.actionType);
  }
  if (options?.search && options.search.trim()) {
    const q = `%${options.search.trim().toLowerCase()}%`;
    clauses.push('(LOWER(document_label) LIKE ? OR LOWER(details) LIKE ? OR LOWER(user_name) LIKE ?)');
    params.push(q, q, q);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = options?.limit ? Math.min(500, Math.max(1, options.limit)) : 200;
  params.push(limit);

  const rows = db
    .prepare(`SELECT * FROM audit_events ${where} ORDER BY timestamp DESC, rowid DESC LIMIT ?`)
    .all(...params) as Record<string, unknown>[];

  return rows.map(mapRowToAuditEvent);
}

export function listDocumentAuditEvents(db: DatabaseSync, documentId: string): AuditEvent[] {
  const rows = db
    .prepare('SELECT * FROM audit_events WHERE document_id = ? ORDER BY timestamp DESC, rowid DESC')
    .all(documentId) as Record<string, unknown>[];
  return rows.map(mapRowToAuditEvent);
}
