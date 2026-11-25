import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  AnomalySeverity,
  AppMode,
  AuditActionType,
  DocumentStatus,
  DomainError,
  EmissionChannel,
} from '../src/shared/schemas';
import { listAuditEvents } from '../src/server/audit';
import { simulateDocumentEmission } from '../src/server/channels';
import { FacturaDatabase, getSettings, openFacturaDatabase } from '../src/server/db';
import {
  createCreditNote,
  createDraftFromSource,
  getDashboardMetrics,
  getDocumentById,
  resetDemoData,
  updateAppSettings,
  updateDraftDocument,
  validateDocument,
} from '../src/server/documents';
import { generateDocumentPdfBuffer } from '../src/server/pdf';

function createTempDb(): { fdb: FacturaDatabase; dbPath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factura-test-'));
  const dbPath = path.join(dir, 'test.db');
  const fdb = openFacturaDatabase(dbPath);
  return {
    fdb,
    dbPath,
    cleanup: () => {
      try {
        fdb.close();
      } catch {
        // already closed
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('1. Création d’un brouillon sans numéro définitif (MODE DEMO autonome)', async () => {
  const { fdb, cleanup } = createTempDb();
  try {
    const draft = await createDraftFromSource(fdb, {
      sourceType: 'MESSAGE',
      fileName: 'Devis_Test.txt',
      mimeType: 'text/plain',
      sizeBytes: 120,
      rawText: 'Devis pour test',
      scenarioId: 'bc-complet',
    });

    assert.equal(draft.status, DocumentStatus.BROUILLON);
    assert.equal(draft.invoiceNumber, null, 'Un brouillon ne doit jamais recevoir de numéro définitif');
    assert.match(draft.draftCode, /^BR-2026-\d{4}$/);
    assert.equal(draft.totals.isSimulated, true);
  } finally {
    cleanup();
  }
});

test('2. Attribution du numéro unique UNIQUEMENT après validation humaine', async () => {
  const { fdb, cleanup } = createTempDb();
  try {
    const draft = await createDraftFromSource(fdb, {
      sourceType: 'MESSAGE',
      fileName: 'BC_Valide.txt',
      mimeType: 'text/plain',
      sizeBytes: 100,
      rawText: 'BC complet',
      scenarioId: 'bc-complet',
    });

    assert.equal(draft.invoiceNumber, null);

    // Sans confirmation humaine -> refus
    assert.throws(
      () => validateDocument(fdb, draft.id, { confirmedByHuman: false }),
      (err: unknown) => err instanceof DomainError && err.code === 'HUMAN_CONFIRMATION_REQUIRED'
    );

    const { document: validated, alreadyValidated } = validateDocument(fdb, draft.id, {
      confirmedByHuman: true,
      idempotencyKey: 'idem-001',
    });

    assert.equal(alreadyValidated, false);
    assert.equal(validated.status, DocumentStatus.VALIDEE);
    assert.match(validated.invoiceNumber || '', /^FAC-2026-\d{4}$/);
    assert.ok(validated.validatedAt);
    assert.ok(validated.validatedBy);
  } finally {
    cleanup();
  }
});

test('3. Validation interdite tant qu’une anomalie bloquante est active', async () => {
  const { fdb, cleanup } = createTempDb();
  try {
    const draft = await createDraftFromSource(fdb, {
      sourceType: 'MESSAGE',
      fileName: 'Devis_Anomalie.txt',
      mimeType: 'text/plain',
      sizeBytes: 150,
      rawText: 'Zou Énergie',
      scenarioId: 'devis-anomalie',
    });

    const blockers = draft.anomalies.filter((a) => a.severity === AnomalySeverity.BLOQUANT);
    assert.ok(blockers.length >= 2, 'Le scénario devis-anomalie doit générer des anomalies bloquantes');

    assert.throws(
      () => validateDocument(fdb, draft.id, { confirmedByHuman: true }),
      (err: unknown) => err instanceof DomainError && err.code === 'BLOCKING_ANOMALIES_ACTIVE'
    );

    // Résolution humaine des blocages (IFU + remise <= 30%)
    const fixedLines = draft.lines.map((l) => ({
      ...l,
      discountPercent: Math.min(10, l.discountPercent),
    }));
    const updated = await updateDraftDocument(fdb, draft.id, {
      clientIfu: '3202600987654',
      lines: fixedLines,
    });

    assert.equal(
      updated.anomalies.filter((a) => a.severity === AnomalySeverity.BLOQUANT).length,
      0
    );

    const { document: validated } = validateDocument(fdb, draft.id, { confirmedByHuman: true });
    assert.equal(validated.status, DocumentStatus.VALIDEE);
    assert.ok(validated.invoiceNumber);
  } finally {
    cleanup();
  }
});

test('4 & 5. Idempotence : double clic et rejeu de validation ne créent jamais deux factures', async () => {
  const { fdb, cleanup } = createTempDb();
  try {
    const draft = await createDraftFromSource(fdb, {
      sourceType: 'MESSAGE',
      fileName: 'BC_Idem.txt',
      mimeType: 'text/plain',
      sizeBytes: 80,
      rawText: 'BC complet',
      scenarioId: 'bc-complet',
    });

    const first = validateDocument(fdb, draft.id, {
      confirmedByHuman: true,
      idempotencyKey: 'double-click-key-123',
    });

    // Double clic avec la même clé d'idempotence
    const second = validateDocument(fdb, draft.id, {
      confirmedByHuman: true,
      idempotencyKey: 'double-click-key-123',
    });

    // Rejeu ultérieur avec une nouvelle clé différente
    const replay = validateDocument(fdb, draft.id, {
      confirmedByHuman: true,
      idempotencyKey: 'replay-different-key-456',
    });

    assert.equal(first.alreadyValidated, false);
    assert.equal(second.alreadyValidated, true);
    assert.equal(replay.alreadyValidated, true);
    assert.equal(second.document.invoiceNumber, first.document.invoiceNumber);
    assert.equal(replay.document.invoiceNumber, first.document.invoiceNumber);

    // Vérifier qu'une seule attribution de numéro a été enregistrée pour ce document
    const numEvents = listAuditEvents(fdb.db, {
      actionType: AuditActionType.NUMERO_ATTRIBUE,
    }).filter((e) => e.documentId === draft.id);
    assert.equal(numEvents.length, 1);
  } finally {
    cleanup();
  }
});

test('6. Validations concurrentes (même brouillon + deux brouillons simultanés)', async () => {
  const { fdb, cleanup } = createTempDb();
  try {
    const draftA = await createDraftFromSource(fdb, {
      sourceType: 'MESSAGE',
      fileName: 'BC_Conc_A.txt',
      mimeType: 'text/plain',
      sizeBytes: 50,
      rawText: 'BC complet',
      scenarioId: 'bc-complet',
    });
    const draftB = await createDraftFromSource(fdb, {
      sourceType: 'MESSAGE',
      fileName: 'BC_Conc_B.txt',
      mimeType: 'text/plain',
      sizeBytes: 50,
      rawText: 'BC complet',
      scenarioId: 'bc-complet',
    });

    // Deux connexions distinctes vers la même base SQLite
    const fdb2 = openFacturaDatabase(fdb.dbPath);
    try {
      const [resA1, resA2, resB] = await Promise.all([
        Promise.resolve().then(() =>
          validateDocument(fdb, draftA.id, { confirmedByHuman: true, idempotencyKey: 'conc-a-1' })
        ),
        Promise.resolve().then(() =>
          validateDocument(fdb2, draftA.id, { confirmedByHuman: true, idempotencyKey: 'conc-a-2' })
        ),
        Promise.resolve().then(() =>
          validateDocument(fdb2, draftB.id, { confirmedByHuman: true, idempotencyKey: 'conc-b-1' })
        ),
      ]);

      assert.equal(resA1.document.invoiceNumber, resA2.document.invoiceNumber);
      assert.notEqual(resA1.document.invoiceNumber, resB.document.invoiceNumber);
      assert.ok(resA1.alreadyValidated !== resA2.alreadyValidated);
    } finally {
      fdb2.close();
    }
  } finally {
    cleanup();
  }
});

test('7. Immutabilité stricte après validation (VALIDÉE, ÉMISE, AVOIR)', async () => {
  const { fdb, cleanup } = createTempDb();
  try {
    const draft = await createDraftFromSource(fdb, {
      sourceType: 'MESSAGE',
      fileName: 'BC_Immut.txt',
      mimeType: 'text/plain',
      sizeBytes: 50,
      rawText: 'BC complet',
      scenarioId: 'bc-complet',
    });
    validateDocument(fdb, draft.id, { confirmedByHuman: true });

    await assert.rejects(
      () => updateDraftDocument(fdb, draft.id, { clientName: 'Client piraté' }),
      (err: unknown) => err instanceof DomainError && err.code === 'DOCUMENT_IMMUTABLE'
    );

    // Après émission simulée -> toujours immuable
    simulateDocumentEmission(fdb, draft.id, {
      channel: EmissionChannel.WHATSAPP,
      recipient: '+229 01 97 00 11 22',
    });

    await assert.rejects(
      () => updateDraftDocument(fdb, draft.id, { clientName: 'Tentative après émission' }),
      (err: unknown) => err instanceof DomainError && err.code === 'DOCUMENT_IMMUTABLE'
    );
  } finally {
    cleanup();
  }
});

test('8 & 9. Création d’un avoir lié et préservation intacte de la facture originale', async () => {
  const { fdb, cleanup } = createTempDb();
  try {
    const draft = await createDraftFromSource(fdb, {
      sourceType: 'MESSAGE',
      fileName: 'BC_Avoir.txt',
      mimeType: 'text/plain',
      sizeBytes: 50,
      rawText: 'BC complet',
      scenarioId: 'bc-complet',
    });
    const { document: validated } = validateDocument(fdb, draft.id, { confirmedByHuman: true });

    const { creditNote, rectifyingDraft } = await createCreditNote(fdb, validated.id, {
      reason: 'Erreur de quantité livrée sur la commande initiale',
      createRectifyingDraft: true,
    });

    assert.equal(creditNote.status, DocumentStatus.AVOIR);
    assert.match(creditNote.invoiceNumber || '', /^AV-2026-\d{4}$/);
    assert.equal(creditNote.originalDocumentId, validated.id);
    assert.equal(creditNote.originalInvoiceNumber, validated.invoiceNumber);

    // Facture originale intacte et liée à l'avoir
    const reloadedOriginal = getDocumentById(fdb, validated.id);
    assert.equal(reloadedOriginal.invoiceNumber, validated.invoiceNumber);
    assert.equal(reloadedOriginal.totals.totalTtc, validated.totals.totalTtc);
    assert.ok(reloadedOriginal.linkedCreditNoteIds?.includes(creditNote.id));

    // Brouillon rectificatif créé sans numéro définitif
    assert.ok(rectifyingDraft);
    assert.equal(rectifyingDraft?.status, DocumentStatus.BROUILLON);
    assert.equal(rectifyingDraft?.invoiceNumber, null);
  } finally {
    cleanup();
  }
});

test('10 & 11. Simulation d’émission multi-canal (Courriel, WhatsApp, SMS) et journal d’audit', async () => {
  const { fdb, cleanup } = createTempDb();
  try {
    const draft = await createDraftFromSource(fdb, {
      sourceType: 'MESSAGE',
      fileName: 'BC_Emit.txt',
      mimeType: 'text/plain',
      sizeBytes: 50,
      rawText: 'BC complet',
      scenarioId: 'bc-complet',
    });

    // Refus d'émission sur BROUILLON
    assert.throws(
      () =>
        simulateDocumentEmission(fdb, draft.id, {
          channel: EmissionChannel.COURRIEL,
          recipient: 'compta@client.example',
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'EMISSION_REQUIRES_VALIDATED_DOCUMENT'
    );

    validateDocument(fdb, draft.id, { confirmedByHuman: true });

    const { document: emitted, emission } = simulateDocumentEmission(fdb, draft.id, {
      channel: EmissionChannel.SMS,
      recipient: '+229 01 97 12 34 56',
    });

    assert.equal(emitted.status, DocumentStatus.EMISE);
    assert.equal(emission.isSimulated, true);
    assert.equal(emission.status, 'SIMULÉ_ENVOYÉ');
    assert.equal(emitted.emissions.length, 1);

    const audit = listAuditEvents(fdb.db);
    assert.ok(audit.some((e) => e.actionType === AuditActionType.EMISSION_SIMULEE && e.documentId === draft.id));
  } finally {
    cleanup();
  }
});

test('12. Export PDF valide (%PDF-) pour BROUILLON, VALIDÉE et AVOIR', async () => {
  const { fdb, cleanup } = createTempDb();
  try {
    const settings = getSettings(fdb.db);
    const draftDoc = getDocumentById(fdb, 'doc-demo-draft-1');
    const valDoc = getDocumentById(fdb, 'doc-demo-val-1');
    const avDoc = getDocumentById(fdb, 'doc-demo-av-1');

    for (const doc of [draftDoc, valDoc, avDoc]) {
      const buf = await generateDocumentPdfBuffer(doc, settings);
      assert.ok(buf.length > 1200, `Le PDF de ${doc.status} doit contenir un contenu réel`);
      assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-');
    }
  } finally {
    cleanup();
  }
});

test('13 & 14. Réinitialisation confirmée et reprise après interruption (fermeture/réouverture SQLite)', async () => {
  const { fdb, dbPath, cleanup } = createTempDb();
  try {
    const draft = await createDraftFromSource(fdb, {
      sourceType: 'MESSAGE',
      fileName: 'BC_Persistance.txt',
      mimeType: 'text/plain',
      sizeBytes: 50,
      rawText: 'BC complet',
      scenarioId: 'bc-complet',
    });
    const draftId = draft.id;

    // Simuler une interruption brutale / redémarrage en fermant puis rouvrant la base
    fdb.close();
    const reopened = openFacturaDatabase(dbPath);
    try {
      const recovered = getDocumentById(reopened, draftId);
      assert.equal(recovered.draftCode, draft.draftCode);
      assert.equal(recovered.status, DocumentStatus.BROUILLON);

      // Réinitialisation sans confirmation -> refus
      assert.throws(
        () => resetDemoData(reopened, 'MAUVAIS_MOT'),
        (err: unknown) => err instanceof DomainError && err.code === 'RESET_CONFIRMATION_REQUIRED'
      );

      // Réinitialisation confirmée -> restaure le jeu initial et logue l'audit
      const resetRes = resetDemoData(reopened, 'REINITIALISER');
      assert.equal(resetRes.documentCount, 5);
      const metrics = getDashboardMetrics(reopened);
      assert.equal(metrics.draftCount, 2);
      assert.equal(metrics.validatedCount, 1);
      assert.equal(metrics.issuedCount, 1);
      assert.equal(metrics.creditNoteCount, 1);
      const audit = listAuditEvents(reopened.db, {
        actionType: AuditActionType.REINITIALISATION_DEMO,
      });
      assert.equal(audit.length, 1);
    } finally {
      reopened.close();
    }
  } finally {
    cleanup();
  }
});

test('15 & 16. MODE INTEGRATION avec modules externes absents : erreur explicite, jamais de simulation silencieuse', async () => {
  const { fdb, cleanup } = createTempDb();
  try {
    updateAppSettings(fdb, { mode: AppMode.INTEGRATION });
    assert.equal(getSettings(fdb.db).mode, AppMode.INTEGRATION);

    await assert.rejects(
      () =>
        createDraftFromSource(fdb, {
          sourceType: 'MESSAGE',
          fileName: 'Test_Integ.txt',
          mimeType: 'text/plain',
          sizeBytes: 30,
          rawText: 'Test mode intégration',
          scenarioId: 'bc-complet',
        }),
      (err: unknown) =>
        err instanceof DomainError &&
        err.code === 'MODULE_NOT_INTEGRATED' &&
        err.message.includes('src/extraction.py')
    );

    // Mise à jour d'un brouillon en mode intégration sans controls.py -> erreur explicite
    await assert.rejects(
      () => updateDraftDocument(fdb, 'doc-demo-draft-1', { clientIfu: '3202600123456' }),
      (err: unknown) =>
        err instanceof DomainError &&
        err.code === 'MODULE_NOT_INTEGRATED' &&
        err.message.includes('src/controls.py')
    );
  } finally {
    cleanup();
  }
});
