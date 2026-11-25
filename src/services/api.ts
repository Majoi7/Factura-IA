import {
  AuditEvent,
  CompanySettings,
  DashboardMetrics,
  DocumentLineItem,
  DocumentRecord,
  EmissionChannel,
  EmissionRecord,
  ExternalModuleStatus,
  ExtractedField,
  ExtractionInput,
} from '../shared/schemas';

export interface DemoScenarioItem {
  id: string;
  title: string;
  subtitle: string;
  sourceType: 'PDF' | 'IMAGE' | 'MESSAGE';
  fileName: string;
  rawText: string;
}

export interface SettingsResponse {
  settings: CompanySettings;
  modules: ExternalModuleStatus[];
  scenarios: DemoScenarioItem[];
}

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let payload: { error?: string; message?: string } = {};
    try {
      payload = await res.json();
    } catch {
      payload = { message: `Erreur HTTP ${res.status}` };
    }
    throw new ApiError(
      payload.error || 'API_ERROR',
      payload.message || `Erreur HTTP ${res.status}`,
      res.status
    );
  }

  return res.json() as Promise<T>;
}

export const api = {
  getDashboard(): Promise<DashboardMetrics> {
    return request<DashboardMetrics>('/api/dashboard');
  },

  getSettings(): Promise<SettingsResponse> {
    return request<SettingsResponse>('/api/settings');
  },

  updateSettings(
    patch: Partial<Pick<CompanySettings, 'productName' | 'mode' | 'enabledChannels' | 'demoUser'>>
  ): Promise<{ settings: CompanySettings; modules: ExternalModuleStatus[] }> {
    return request('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  resetDemo(confirmationPhrase: string): Promise<{ resetAt: string; documentCount: number }> {
    return request('/api/reset', {
      method: 'POST',
      body: JSON.stringify({ confirmationPhrase }),
    });
  },

  listDocuments(params?: { status?: string; search?: string }): Promise<DocumentRecord[]> {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.search && params.search.trim()) query.set('search', params.search.trim());
    const qs = query.toString();
    return request<DocumentRecord[]>(`/api/documents${qs ? `?${qs}` : ''}`);
  },

  getDocument(id: string): Promise<{ document: DocumentRecord; history: AuditEvent[] }> {
    return request(`/api/documents/${encodeURIComponent(id)}`);
  },

  importDocument(input: ExtractionInput): Promise<DocumentRecord> {
    return request('/api/documents/import', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateDraft(
    id: string,
    payload: {
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
    }
  ): Promise<DocumentRecord> {
    return request(`/api/documents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  validateDocument(
    id: string,
    payload: { confirmedByHuman: boolean; idempotencyKey?: string; performedBy?: string }
  ): Promise<{ document: DocumentRecord; alreadyValidated: boolean }> {
    return request(`/api/documents/${encodeURIComponent(id)}/validate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  emitDocument(
    id: string,
    payload: { channel: EmissionChannel; recipient: string; customNote?: string }
  ): Promise<{ document: DocumentRecord; emission: EmissionRecord }> {
    return request(`/api/documents/${encodeURIComponent(id)}/emit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  createCreditNote(
    id: string,
    payload: { reason: string; lines?: DocumentLineItem[]; createRectifyingDraft?: boolean }
  ): Promise<{ creditNote: DocumentRecord; rectifyingDraft: DocumentRecord | null }> {
    return request(`/api/documents/${encodeURIComponent(id)}/credit-note`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listAudit(params?: { actionType?: string; search?: string }): Promise<AuditEvent[]> {
    const query = new URLSearchParams();
    if (params?.actionType && params.actionType !== 'ALL') {
      query.set('actionType', params.actionType);
    }
    if (params?.search && params.search.trim()) {
      query.set('search', params.search.trim());
    }
    const qs = query.toString();
    return request<AuditEvent[]>(`/api/audit${qs ? `?${qs}` : ''}`);
  },

  getPdfUrl(id: string): string {
    return `/api/documents/${encodeURIComponent(id)}/pdf`;
  },
};

export function formatFcfa(amount: number, signed = false): string {
  const rounded = Math.round(amount);
  const abs = Math.abs(rounded);
  const formatted = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  const prefix = rounded < 0 ? '-' : signed && rounded > 0 ? '+' : '';
  return `${prefix}${formatted} FCFA`;
}

export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const raw = iso.slice(0, 10);
  const parts = raw.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDateTimeFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
