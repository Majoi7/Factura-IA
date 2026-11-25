/**
 * Module de simulation d'émission multi-canal — Rôle D (Jého).
 * Préparé pour correspondre à src/channels.py.
 *
 * IMPORTANT : Aucun courriel, message WhatsApp ou SMS réel n'est envoyé.
 * Toute émission est explicitement enregistrée comme simulation de démonstration.
 */

import crypto from 'node:crypto';
import {
  AuditActionType,
  DocumentRecord,
  DocumentStatus,
  DomainError,
  EmissionChannel,
  EmissionRecord,
} from '../shared/schemas';
import { recordAuditEvent } from './audit';
import { FacturaDatabase, getSettings } from './db';
import { getDocumentById } from './documents';

export interface SimulateEmissionPayload {
  channel: EmissionChannel;
  recipient: string;
  customNote?: string;
  performedBy?: string;
}

export function simulateDocumentEmission(
  fdb: FacturaDatabase,
  documentId: string,
  payload: SimulateEmissionPayload
): { document: DocumentRecord; emission: EmissionRecord } {
  const settings = getSettings(fdb.db);
  const actor = payload.performedBy || settings.demoUser;

  if (!settings.enabledChannels.includes(payload.channel)) {
    throw new DomainError(
      'CHANNEL_DISABLED',
      `Le canal ${payload.channel} est désactivé dans les paramètres.`,
      400
    );
  }

  const recipient = (payload.recipient || '').trim();
  if (!recipient) {
    throw new DomainError(
      'RECIPIENT_REQUIRED',
      'Veuillez renseigner un destinataire fictif (adresse courriel ou numéro de téléphone).',
      400
    );
  }

  if (payload.channel === EmissionChannel.COURRIEL && !recipient.includes('@')) {
    throw new DomainError(
      'INVALID_EMAIL_RECIPIENT',
      'Veuillez saisir une adresse courriel valide pour la simulation par courriel.',
      400
    );
  }

  return fdb.withImmediateTransaction(() => {
    const doc = getDocumentById(fdb, documentId);

    if (
      doc.status !== DocumentStatus.VALIDEE &&
      doc.status !== DocumentStatus.EMISE
    ) {
      throw new DomainError(
        'EMISSION_REQUIRES_VALIDATED_DOCUMENT',
        `L'émission simulée n'est autorisée qu'après validation humaine (statut actuel : ${doc.status}).`,
        409
      );
    }

    const now = new Date().toISOString();
    const emissionId = `em-${crypto.randomUUID().slice(0, 10)}`;
    const amountFormatted = `${doc.totals.totalTtc.toLocaleString('fr-FR')} FCFA`;

    const channelLabel =
      payload.channel === EmissionChannel.COURRIEL
        ? 'Courriel'
        : payload.channel === EmissionChannel.WHATSAPP
          ? 'WhatsApp'
          : 'SMS';

    const messagePreview =
      payload.customNote?.trim() ||
      `[SIMULATION ${channelLabel.toUpperCase()}] Bonjour ${doc.clientName}, votre facture ${doc.invoiceNumber} d'un montant de ${amountFormatted} TTC est disponible. (MODE DÉMONSTRATION — ÉMISSION NON RÉELLE)`;

    const resultNote = `Simulation ${channelLabel} enregistrée avec succès. Aucun message externe réel n'a été transmis.`;

    fdb.db
      .prepare(`
        INSERT INTO emissions (
          id, document_id, channel, recipient, status, simulated_at,
          message_preview, result_note, performed_by, is_simulated
        ) VALUES (?, ?, ?, ?, 'SIMULÉ_ENVOYÉ', ?, ?, ?, ?, 1)
      `)
      .run(
        emissionId,
        doc.id,
        payload.channel,
        recipient,
        now,
        messagePreview,
        resultNote,
        actor
      );

    const prevStatus = doc.status;
    if (doc.status === DocumentStatus.VALIDEE) {
      fdb.db
        .prepare('UPDATE documents SET status = ?, updated_at = ? WHERE id = ?')
        .run(DocumentStatus.EMISE, now, doc.id);
    }

    recordAuditEvent(fdb.db, {
      actionType: AuditActionType.EMISSION_SIMULEE,
      documentId: doc.id,
      documentLabel: doc.invoiceNumber || doc.draftCode,
      user: actor,
      details: `Émission simulée via ${channelLabel} vers ${recipient} (aucun envoi externe réel).`,
      oldValue: prevStatus,
      newValue: `${DocumentStatus.EMISE} (${channelLabel} simulé)`,
      timestamp: now,
    });

    const emission: EmissionRecord = {
      id: emissionId,
      documentId: doc.id,
      channel: payload.channel,
      recipient,
      status: 'SIMULÉ_ENVOYÉ',
      simulatedAt: now,
      messagePreview,
      resultNote,
      performedBy: actor,
      isSimulated: true,
    };

    return {
      document: getDocumentById(fdb, doc.id),
      emission,
    };
  });
}
