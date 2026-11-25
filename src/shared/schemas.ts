/**
 * Contrat commun de données — Factura AI (Hackathon BWAI 2026)
 *
 * Ce fichier définit les structures partagées entre :
 * - Rôle A / Extraction IA (Sosthène — src/extraction.py ou adaptateur HTTP/IPC)
 * - Rôle B / Contrôles & Calculs déterministes (Phanouel — src/controls.py & src/engine.py)
 * - Rôle D / Documents, Audit, Canaux, PDF & Interface (Jého)
 *
 * IMPORTANT : Toute modification de ce contrat doit être validée par l'équipe.
 */

export enum DocumentStatus {
  BROUILLON = 'BROUILLON',
  VALIDEE = 'VALIDÉE',
  EMISE = 'ÉMISE',
  AVOIR = 'AVOIR',
}

export enum AppMode {
  DEMO = 'DEMO',
  INTEGRATION = 'INTEGRATION',
}

export enum AnomalySeverity {
  INFO = 'INFO',
  AVERTISSEMENT = 'AVERTISSEMENT',
  BLOQUANT = 'BLOQUANT',
}

export enum EmissionChannel {
  COURRIEL = 'COURRIEL',
  WHATSAPP = 'WHATSAPP',
  SMS = 'SMS',
}

export enum AuditActionType {
  DOCUMENT_CREE = 'DOCUMENT_CRÉÉ',
  SOURCE_IMPORTEE = 'SOURCE_IMPORTÉE',
  EXTRACTION_EXECUTEE = 'EXTRACTION_EXÉCUTÉE',
  CHAMP_CORRIGE = 'CHAMP_CORRIGÉ',
  CHAMP_VERIFIE = 'CHAMP_VÉRIFIÉ',
  LIGNE_MODIFIEE = 'LIGNE_MODIFIÉE',
  DOCUMENT_VALIDE = 'DOCUMENT_VALIDÉ',
  NUMERO_ATTRIBUE = 'NUMÉRO_ATTRIBUÉ',
  EMISSION_SIMULEE = 'ÉMISSION_SIMULÉE',
  AVOIR_CREE = 'AVOIR_CRÉÉ',
  FACTURE_RECTIFICATIVE_CREEE = 'FACTURE_RECTIFICATIVE_CRÉÉE',
  PDF_EXPORTE = 'PDF_EXPORTÉ',
  REINITIALISATION_DEMO = 'RÉINITIALISATION_DÉMO',
  MODE_CHANGE = 'MODE_CHANGÉ',
}

export type SourceType = 'PDF' | 'IMAGE' | 'MESSAGE';

export interface ExtractedField {
  key: string;
  label: string;
  value: string;
  sourceText: string;
  /** Score simulé en MODE DEMO (0-100). Provient de src/extraction.py en MODE INTEGRATION. */
  confidence: number | null;
  verified: boolean;
  required: boolean;
  isSimulated: boolean;
}

export interface DocumentLineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number; // En FCFA (entier ou décimal précis)
  discountPercent: number; // 0 à 100
  vatRate: number; // ex: 18 (TVA Bénin fictive de démonstration)
  sourceText?: string;
  confidence?: number | null;
  verified?: boolean;
}

export interface AnomalyItem {
  id: string;
  code: string;
  severity: AnomalySeverity;
  fieldKey?: string;
  title: string;
  message: string;
  resolved: boolean;
  isSimulated: boolean;
  sourceModule: 'DEMO_CONTROLS' | 'CONTROLS_ENGINE';
}

export interface CalculationResult {
  subtotalHt: number;
  totalDiscount: number;
  netHt: number;
  vatRate: number;
  vatAmount: number;
  totalTtc: number;
  currency: 'XOF';
  isSimulated: boolean;
  sourceModule: 'DEMO_ENGINE' | 'CALCULATION_ENGINE';
}

export interface SourceAttachment {
  fileName: string;
  mimeType: string;
  sourceType: SourceType;
  sizeBytes: number;
  rawText: string;
  /** Data URL base64 pour prévisualisation locale d'image ou PDF */
  previewDataUrl?: string | null;
  uploadedAt: string;
}

export interface EmissionRecord {
  id: string;
  documentId: string;
  channel: EmissionChannel;
  recipient: string;
  status: 'SIMULÉ_ENVOYÉ';
  simulatedAt: string;
  messagePreview: string;
  resultNote: string;
  performedBy: string;
  isSimulated: true;
}

export interface DocumentRecord {
  id: string;
  invoiceNumber: string | null; // Strictement null tant que BROUILLON
  draftCode: string; // Référence temporaire interne ex: BR-0001
  status: DocumentStatus;
  clientName: string;
  clientIfu: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  commercialReference: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  currency: 'XOF';
  fields: ExtractedField[];
  lines: DocumentLineItem[];
  anomalies: AnomalyItem[];
  totals: CalculationResult;
  source: SourceAttachment | null;
  /** Lien obligatoire si statut === AVOIR */
  originalDocumentId: string | null;
  originalInvoiceNumber: string | null;
  creditNoteReason: string | null;
  /** Métadonnées de validation humaine */
  validatedAt: string | null;
  validatedBy: string | null;
  validationIdempotencyKey: string | null;
  /** Émissions simulées associées */
  emissions: EmissionRecord[];
  /** Identifiants d'avoirs liés (calculé à la lecture) */
  linkedCreditNoteIds?: string[];
  /** Identifiant de la facture d'origine ou rectificative */
  rectifiesCreditNoteId?: string | null;
  isDemoData: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  actionType: AuditActionType;
  documentId: string | null;
  documentLabel: string;
  user: string;
  timestamp: string;
  details: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface CompanySettings {
  productName: string;
  companyName: string;
  legalForm: string;
  ifu: string;
  rccm: string;
  address: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  currency: 'XOF';
  currencyLabel: string;
  defaultVatRate: number;
  demoUser: string;
  mode: AppMode;
  enabledChannels: EmissionChannel[];
}

export interface ExternalModuleStatus {
  id: 'extraction' | 'controls' | 'engine';
  name: string;
  expectedFile: string;
  owner: string;
  integrated: boolean;
  statusLabel: string;
  details: string;
}

export interface DashboardMetrics {
  draftCount: number;
  validatedCount: number;
  issuedCount: number;
  creditNoteCount: number;
  pendingVerificationCount: number;
  blockingAnomalyCount: number;
  totalValidatedAndIssuedTtc: number;
  recentDocuments: DocumentRecord[];
  recentAudit: AuditEvent[];
}

export interface ExtractionInput {
  sourceType: SourceType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  rawText: string;
  previewDataUrl?: string | null;
  scenarioId?: string;
}

export interface ExtractionAdapterOutput {
  clientName: string;
  clientIfu: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  commercialReference: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  fields: ExtractedField[];
  lines: DocumentLineItem[];
  isSimulated: boolean;
  sourceModule: 'DEMO_EXTRACTION' | 'EXTRACTION_MODULE';
}

export class DomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
