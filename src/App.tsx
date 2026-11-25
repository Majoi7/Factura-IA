import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  FileText,
  History,
  LayoutDashboard,
  Menu,
  Settings,
  X,
} from 'lucide-react';
import {
  AppMode,
  AuditEvent,
  CompanySettings,
  DashboardMetrics,
  DocumentRecord,
  DocumentStatus,
  ExternalModuleStatus,
} from './shared/schemas';
import { DemoScenarioItem, api } from './services/api';
import { AuditLogView } from './components/AuditLogView';
import { DashboardView } from './components/DashboardView';
import { DocumentDetailView } from './components/DocumentDetailView';
import { DocumentsListView } from './components/DocumentsListView';
import { ImportView } from './components/ImportView';
import { SettingsView } from './components/SettingsView';
import { VerificationView } from './components/VerificationView';
import {
  CreditNoteModal,
  EmissionModal,
  ValidationModal,
} from './components/WorkflowModals';

type ActiveView =
  | 'dashboard'
  | 'import'
  | 'verify'
  | 'documents'
  | 'detail'
  | 'audit'
  | 'settings';

interface ToastNotice {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [modules, setModules] = useState<ExternalModuleStatus[]>([]);
  const [scenarios, setScenarios] = useState<DemoScenarioItem[]>([]);

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocHistory, setSelectedDocHistory] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [validationTarget, setValidationTarget] = useState<DocumentRecord | null>(null);
  const [emissionTarget, setEmissionTarget] = useState<DocumentRecord | null>(null);
  const [creditNoteTarget, setCreditNoteTarget] = useState<DocumentRecord | null>(null);

  const [toast, setToast] = useState<ToastNotice | null>(null);

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToast({ id, message, tone });
    window.setTimeout(() => {
      setToast((prev) => (prev && prev.id === id ? null : prev));
    }, 4500);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [dash, docs, audit, setRes] = await Promise.all([
        api.getDashboard(),
        api.listDocuments(),
        api.listAudit(),
        api.getSettings(),
      ]);
      setDashboard(dash);
      setDocuments(docs);
      setAuditEvents(audit);
      setSettings(setRes.settings);
      setModules(setRes.modules);
      setScenarios(setRes.scenarios);
    } catch {
      notify('Erreur lors du chargement des données locales.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadDocumentDetail = useCallback(async (id: string) => {
    try {
      const res = await api.getDocument(id);
      setDocuments((prev) => {
        const exists = prev.some((d) => d.id === res.document.id);
        return exists
          ? prev.map((d) => (d.id === res.document.id ? res.document : d))
          : [res.document, ...prev];
      });
      setSelectedDocId(res.document.id);
      setSelectedDocHistory(res.history);
    } catch {
      notify('Document introuvable.', 'error');
    }
  }, [notify]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const drafts = useMemo(
    () => documents.filter((d) => d.status === DocumentStatus.BROUILLON),
    [documents]
  );

  const selectedDocument = useMemo(() => {
    if (selectedDocId) {
      return documents.find((d) => d.id === selectedDocId) || null;
    }
    return drafts[0] || documents[0] || null;
  }, [documents, drafts, selectedDocId]);

  const handleOpenDetail = (doc: DocumentRecord) => {
    setSelectedDocId(doc.id);
    setActiveView('detail');
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
    loadDocumentDetail(doc.id);
  };

  const handleOpenDetailById = (id: string) => {
    setSelectedDocId(id);
    setActiveView('detail');
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
    loadDocumentDetail(id);
  };

  const handleOpenVerify = (doc: DocumentRecord) => {
    setSelectedDocId(doc.id);
    setActiveView('verify');
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const navItems: Array<{
    id: ActiveView;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
  }> = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'import', label: 'Nouvelle facture', icon: FilePlus2 },
    {
      id: 'verify',
      label: 'Vérification',
      icon: ClipboardCheck,
      badge: drafts.length > 0 ? drafts.length : undefined,
    },
    { id: 'documents', label: 'Documents & factures', icon: FileText },
    { id: 'audit', label: 'Journal d’audit', icon: History },
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ];

  const breadcrumbMap: Record<ActiveView, string> = {
    dashboard: 'Tableau de bord',
    import: 'Nouvelle facture / Import',
    verify: 'Vérification des données',
    documents: 'Documents & factures',
    detail: selectedDocument
      ? `Documents / ${selectedDocument.invoiceNumber || selectedDocument.draftCode}`
      : 'Détail du document',
    audit: 'Journal d’audit',
    settings: 'Paramètres & réinitialisation',
  };

  const productName = settings?.productName || 'Factura AI';
  const currentMode = settings?.mode || AppMode.DEMO;

  const navigateTo = (view: ActiveView) => {
    if (view === 'verify' && !selectedDocId && drafts[0]) {
      setSelectedDocId(drafts[0].id);
    }
    setActiveView(view);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return (
    <div className="min-h-screen flex bg-[#F7F8F7] text-[#111827]">
      {/* Sidebar desktop (256px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-gray-200 z-30">
        <div className="h-16 px-6 flex items-center border-b border-gray-200">
          <button
            type="button"
            onClick={() => navigateTo('dashboard')}
            className="flex items-center gap-2.5 text-left cursor-pointer"
          >
            <span className="w-8 h-8 rounded-md bg-emerald-800 text-white flex items-center justify-center font-bold text-sm tracking-tight">
              FA
            </span>
            <span className="text-base font-bold tracking-tight text-gray-900 whitespace-nowrap">
              {productName}
            </span>
          </button>
        </div>

        <nav aria-label="Navigation principale" className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              activeView === item.id ||
              (activeView === 'detail' && item.id === 'documents');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-50 text-emerald-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-emerald-800' : 'text-gray-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && (
                  <span className="text-xs font-mono-num text-emerald-800 font-semibold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 text-xs text-gray-500 space-y-1">
          <div className="font-semibold text-gray-800 truncate">
            {settings?.companyName || 'SOGECOT Bénin SARL'}
          </div>
          <div className="truncate">Rôle D · Documents & Interface</div>
          <div className="font-mono-num text-[11px] text-gray-400">
            Devise : FCFA (XOF)
          </div>
        </div>
      </aside>

      {/* Drawer mobile */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-gray-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white h-full flex flex-col border-r border-gray-200 z-10">
            <div className="h-14 px-5 flex items-center justify-between border-b border-gray-200">
              <span className="text-base font-bold text-gray-900">{productName}</span>
              <button
                type="button"
                aria-label="Fermer le menu"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-gray-500 hover:text-gray-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav aria-label="Navigation mobile" className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium cursor-pointer ${
                      active
                        ? 'bg-emerald-50 text-emerald-900'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Zone de contenu principale */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Bandeau de démonstration obligatoire */}
        <div
          className={`px-4 sm:px-6 py-2 text-center text-[11px] font-medium tracking-wide border-b ${
            currentMode === AppMode.DEMO
              ? 'bg-emerald-950 text-emerald-50 border-emerald-900'
              : 'bg-amber-900 text-amber-50 border-amber-950'
          }`}
        >
          {currentMode === AppMode.DEMO
            ? 'MODE DÉMONSTRATION — DONNÉES FICTIVES — ÉMISSION NON RÉELLE'
            : 'MODE INTÉGRATION — APPEL AUX MODULES EXTERNES REQUIS (AUCUNE SIMULATION SILENCIEUSE)'}
        </div>

        {/* Top bar SaaS (3 zones strictes : breadcrumb, action primaire) */}
        <header className="h-14 bg-white border-b border-gray-200 px-4 sm:px-8 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Ouvrir le menu de navigation"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-gray-600 hover:text-gray-900 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-medium text-gray-800 truncate">
              {breadcrumbMap[activeView]}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <span className="hidden sm:inline text-xs text-gray-500 whitespace-nowrap">
              {currentMode === AppMode.DEMO ? 'Mode Démo' : 'Mode Intégration'}
              {' · '}FCFA (XOF)
            </span>
            <button
              type="button"
              onClick={() => navigateTo('import')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              Nouvelle facture
            </button>
          </div>
        </header>

        {/* Contenu de la vue active */}
        <main className="flex-1 px-4 sm:px-8 py-7 max-w-[1360px] w-full mx-auto">
          {activeView === 'dashboard' && (
            <DashboardView
              metrics={dashboard}
              loading={loading}
              onNavigate={(v) => navigateTo(v)}
              onOpenDocument={handleOpenDetail}
              onOpenVerify={handleOpenVerify}
            />
          )}

          {activeView === 'import' && (
            <ImportView
              mode={currentMode}
              scenarios={scenarios}
              onDraftCreated={(created) => {
                setDocuments((prev) => [created, ...prev]);
                setSelectedDocId(created.id);
                setActiveView('verify');
                refreshAll();
                notify(
                  `Brouillon ${created.draftCode} créé sans numéro définitif. Passez à la vérification.`,
                  'success'
                );
              }}
              onGoToSettings={() => navigateTo('settings')}
            />
          )}

          {activeView === 'verify' &&
            (selectedDocument ? (
              <VerificationView
                document={selectedDocument}
                drafts={drafts}
                onSelectDraft={(d) => setSelectedDocId(d.id)}
                onUpdated={(updated) => {
                  setDocuments((prev) =>
                    prev.map((d) => (d.id === updated.id ? updated : d))
                  );
                  refreshAll();
                }}
                onOpenValidation={(d) => setValidationTarget(d)}
                onOpenDetail={handleOpenDetail}
                onBack={() => navigateTo('documents')}
                onNotify={notify}
              />
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg p-10 text-center space-y-3">
                <p className="text-sm font-medium text-gray-900">
                  Aucun brouillon en attente de vérification.
                </p>
                <p className="text-xs text-gray-500">
                  Importez un document commercial pour créer un brouillon et vérifier ses données extraites.
                </p>
                <button
                  type="button"
                  onClick={() => navigateTo('import')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-md cursor-pointer"
                >
                  Importer un document
                </button>
              </div>
            ))}

          {activeView === 'documents' && (
            <DocumentsListView
              documents={documents}
              loading={loading}
              onOpenDetail={handleOpenDetail}
              onOpenVerify={handleOpenVerify}
              onNewInvoice={() => navigateTo('import')}
            />
          )}

          {activeView === 'detail' && selectedDocument && (
            <DocumentDetailView
              document={selectedDocument}
              history={selectedDocHistory}
              onBack={() => navigateTo('documents')}
              onOpenVerify={handleOpenVerify}
              onOpenValidation={(d) => setValidationTarget(d)}
              onOpenEmission={(d) => setEmissionTarget(d)}
              onOpenCreditNote={(d) => setCreditNoteTarget(d)}
              onOpenDocumentById={handleOpenDetailById}
            />
          )}

          {activeView === 'audit' && (
            <AuditLogView
              events={auditEvents}
              loading={loading}
              onOpenDocumentById={handleOpenDetailById}
            />
          )}

          {activeView === 'settings' && settings && (
            <SettingsView
              settings={settings}
              modules={modules}
              onSettingsUpdated={(nextSettings, nextModules) => {
                setSettings(nextSettings);
                setModules(nextModules);
                refreshAll();
              }}
              onDataReset={() => {
                setSelectedDocId(null);
                setActiveView('dashboard');
                refreshAll();
              }}
              onNotify={notify}
            />
          )}
        </main>
      </div>

      {/* Modale F : Validation humaine */}
      {validationTarget && (
        <ValidationModal
          document={validationTarget}
          demoUser={settings?.demoUser || 'Jého K. (Démo)'}
          onClose={() => setValidationTarget(null)}
          onValidated={(validatedDoc, alreadyValidated) => {
            setValidationTarget(null);
            setSelectedDocId(validatedDoc.id);
            setActiveView('detail');
            refreshAll();
            loadDocumentDetail(validatedDoc.id);
            notify(
              alreadyValidated
                ? `Facture ${validatedDoc.invoiceNumber} déjà validée (idempotence garantie).`
                : `Facture validée et numérotée ${validatedDoc.invoiceNumber}. Document désormais immuable.`,
              'success'
            );
          }}
          onGoToVerify={(d) => handleOpenVerify(d)}
        />
      )}

      {/* Modale G : Simulation d'émission */}
      {emissionTarget && (
        <EmissionModal
          document={emissionTarget}
          enabledChannels={settings?.enabledChannels || []}
          onClose={() => setEmissionTarget(null)}
          onEmitted={(updatedDoc, emission) => {
            setSelectedDocId(updatedDoc.id);
            refreshAll();
            loadDocumentDetail(updatedDoc.id);
            notify(
              `Émission simulée (${emission.channel}) enregistrée pour ${updatedDoc.invoiceNumber}.`,
              'success'
            );
          }}
        />
      )}

      {/* Modale H : Création d'un avoir lié */}
      {creditNoteTarget && (
        <CreditNoteModal
          document={creditNoteTarget}
          onClose={() => setCreditNoteTarget(null)}
          onCreated={(creditNote, rectifyingDraft) => {
            setCreditNoteTarget(null);
            refreshAll();
            setSelectedDocId(creditNote.id);
            setActiveView('detail');
            loadDocumentDetail(creditNote.id);
            notify(
              rectifyingDraft
                ? `Avoir ${creditNote.invoiceNumber} créé et brouillon rectificatif ${rectifyingDraft.draftCode} préparé.`
                : `Avoir ${creditNote.invoiceNumber} créé et lié à ${creditNote.originalInvoiceNumber}.`,
              'success'
            );
          }}
        />
      )}

      {/* Notification discrète */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-md px-4 py-3 rounded-lg shadow-lg border text-xs font-medium flex items-center justify-between gap-2.5 ${
            toast.tone === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-white border-emerald-200 text-emerald-950'
          }`}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2
              className={`w-4 h-4 shrink-0 ${
                toast.tone === 'error' ? 'text-rose-700' : 'text-emerald-700'
              }`}
            />
            <span>{toast.message}</span>
          </span>
          <button
            type="button"
            aria-label="Fermer la notification"
            onClick={() => setToast(null)}
            className="text-gray-400 hover:text-gray-700 ml-1 shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
