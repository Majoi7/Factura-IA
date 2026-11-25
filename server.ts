import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { AuditActionType, DomainError } from './src/shared/schemas';
import { getExternalModuleStatuses } from './src/server/adapters';
import { listAuditEvents, listDocumentAuditEvents, recordAuditEvent } from './src/server/audit';
import { simulateDocumentEmission } from './src/server/channels';
import { getSettings, openFacturaDatabase } from './src/server/db';
import { DEMO_SCENARIOS } from './src/server/demo/seedData';
import {
  createCreditNote,
  createDraftFromSource,
  getDashboardMetrics,
  getDocumentById,
  listDocuments,
  resetDemoData,
  updateAppSettings,
  updateDraftDocument,
  validateDocument,
} from './src/server/documents';
import { generateDocumentPdfBuffer } from './src/server/pdf';

const PORT = Number(process.env.PORT || 3000);
const fdb = openFacturaDatabase();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  // --- API Rôle D : Tableau de bord, Paramètres & Modules externes ---
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mode: getSettings(fdb.db).mode });
  });

  app.get('/api/dashboard', (_req, res) => {
    res.json(getDashboardMetrics(fdb));
  });

  app.get('/api/settings', (_req, res) => {
    res.json({
      settings: getSettings(fdb.db),
      modules: getExternalModuleStatuses(),
      scenarios: DEMO_SCENARIOS,
    });
  });

  app.patch('/api/settings', (req, res, next) => {
    try {
      const updated = updateAppSettings(fdb, req.body || {});
      res.json({
        settings: updated,
        modules: getExternalModuleStatuses(),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/reset', (req, res, next) => {
    try {
      const { confirmationPhrase, performedBy } = req.body || {};
      const result = resetDemoData(fdb, String(confirmationPhrase || ''), performedBy);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // --- API Documents (Cycle de vie) ---
  app.get('/api/documents', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.json(listDocuments(fdb, { status, search }));
  });

  app.post('/api/documents/import', async (req, res, next) => {
    try {
      const doc = await createDraftFromSource(fdb, req.body || {}, req.body?.performedBy);
      res.status(201).json(doc);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/documents/:id', (req, res, next) => {
    try {
      const doc = getDocumentById(fdb, req.params.id);
      const history = listDocumentAuditEvents(fdb.db, doc.id);
      res.json({ document: doc, history });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/documents/:id', async (req, res, next) => {
    try {
      const updated = await updateDraftDocument(fdb, req.params.id, req.body || {});
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/documents/:id/validate', (req, res, next) => {
    try {
      const result = validateDocument(fdb, req.params.id, {
        confirmedByHuman: Boolean(req.body?.confirmedByHuman),
        idempotencyKey: req.body?.idempotencyKey,
        performedBy: req.body?.performedBy,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/documents/:id/emit', (req, res, next) => {
    try {
      const result = simulateDocumentEmission(fdb, req.params.id, {
        channel: req.body?.channel,
        recipient: req.body?.recipient,
        customNote: req.body?.customNote,
        performedBy: req.body?.performedBy,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/documents/:id/credit-note', async (req, res, next) => {
    try {
      const result = await createCreditNote(fdb, req.params.id, {
        reason: String(req.body?.reason || ''),
        lines: req.body?.lines,
        performedBy: req.body?.performedBy,
        createRectifyingDraft: Boolean(req.body?.createRectifyingDraft),
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/documents/:id/pdf', async (req, res, next) => {
    try {
      const doc = getDocumentById(fdb, req.params.id);
      const settings = getSettings(fdb.db);
      const buffer = await generateDocumentPdfBuffer(doc, settings);

      recordAuditEvent(fdb.db, {
        actionType: AuditActionType.PDF_EXPORTE,
        documentId: doc.id,
        documentLabel: doc.invoiceNumber || doc.draftCode,
        user: settings.demoUser,
        details: `Export PDF généré (${doc.status} — ${doc.invoiceNumber || doc.draftCode}).`,
      });

      const fileSlug = (doc.invoiceNumber || doc.draftCode).replace(/[^A-Za-z0-9_-]/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileSlug}_${doc.status}.pdf"`
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  // --- API Journal d'audit (lecture seule) ---
  app.get('/api/audit', (req, res) => {
    const actionType =
      typeof req.query.actionType === 'string' ? req.query.actionType : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.json(listAuditEvents(fdb.db, { actionType, search }));
  });

  // Gestion centralisée des erreurs API
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message,
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur.';
    res.status(500).json({ error: 'INTERNAL_ERROR', message });
  });

  // Vite dev middleware ou build statique de production
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Factura AI server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
