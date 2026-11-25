import { AnomalySeverity, DocumentStatus } from '../shared/schemas';

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const styles: Record<DocumentStatus, string> = {
    [DocumentStatus.BROUILLON]: 'bg-amber-50 text-amber-800 border-amber-200',
    [DocumentStatus.VALIDEE]: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    [DocumentStatus.EMISE]: 'bg-teal-50 text-teal-900 border-teal-200',
    [DocumentStatus.AVOIR]: 'bg-rose-50 text-rose-800 border-rose-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: AnomalySeverity }) {
  const styles: Record<AnomalySeverity, { cls: string; label: string }> = {
    [AnomalySeverity.BLOQUANT]: {
      cls: 'bg-rose-50 text-rose-800 border-rose-200',
      label: 'Bloquant',
    },
    [AnomalySeverity.AVERTISSEMENT]: {
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
      label: 'Avertissement',
    },
    [AnomalySeverity.INFO]: {
      cls: 'bg-slate-100 text-slate-700 border-slate-200',
      label: 'Information',
    },
  };

  const { cls, label } = styles[severity];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap ${cls}`}
    >
      {label}
    </span>
  );
}

export function ConfidenceIndicator({ confidence }: { confidence: number | null }) {
  if (confidence === null) {
    return <span className="text-xs font-medium text-rose-700 font-mono-num">Absent</span>;
  }

  const tone =
    confidence >= 90
      ? 'text-emerald-700'
      : confidence >= 75
        ? 'text-amber-700'
        : 'text-rose-700';

  return (
    <span className={`text-xs font-semibold font-mono-num ${tone}`} title="Score de confiance simulé (Mode Démo)">
      {confidence} %
    </span>
  );
}
