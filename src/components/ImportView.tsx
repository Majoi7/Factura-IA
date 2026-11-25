import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  FileImage,
  FileText,
  MessageSquareText,
  Play,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppMode, DocumentRecord, SourceType } from '../shared/schemas';
import { ApiError, DemoScenarioItem, api } from '../services/api';

interface ImportViewProps {
  mode: AppMode;
  scenarios: DemoScenarioItem[];
  onDraftCreated: (doc: DocumentRecord) => void;
  onGoToSettings: () => void;
}

export function ImportView({
  mode,
  scenarios,
  onDraftCreated,
  onGoToSettings,
}: ImportViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceTab, setSourceTab] = useState<'FILE' | 'MESSAGE'>('FILE');
  const [fileName, setFileName] = useState<string>('');
  const [mimeType, setMimeType] = useState<string>('');
  const [sizeBytes, setSizeBytes] = useState<number>(0);
  const [sourceType, setSourceType] = useState<SourceType>('PDF');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileSelected = (file: File | null) => {
    setErrorMsg(null);
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedPdf = file.type === 'application/pdf' || ext === 'pdf';
    const allowedImg =
      ['image/jpeg', 'image/jpg', 'image/png'].includes(file.type) ||
      ['jpg', 'jpeg', 'png'].includes(ext);

    if (!allowedPdf && !allowedImg) {
      setErrorMsg('Formats acceptés uniquement : PDF, JPG, JPEG ou PNG.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg('Le fichier dépasse la limite de 8 Mo.');
      return;
    }

    setFileName(file.name);
    setMimeType(file.type || (allowedPdf ? 'application/pdf' : 'image/png'));
    setSizeBytes(file.size);
    setSourceType(allowedPdf ? 'PDF' : 'IMAGE');
    setSelectedScenarioId('');

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      setPreviewDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleClearFile = () => {
    setFileName('');
    setMimeType('');
    setSizeBytes(0);
    setPreviewDataUrl(null);
    setSelectedScenarioId('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleApplyScenario = (scenario: DemoScenarioItem) => {
    setErrorMsg(null);
    setSourceTab('MESSAGE');
    setSelectedScenarioId(scenario.id);
    setFileName(scenario.fileName);
    setMimeType('text/plain');
    setSourceType(scenario.sourceType);
    setRawText(scenario.rawText);
    setPreviewDataUrl(null);
    setSizeBytes(new Blob([scenario.rawText]).size);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (sourceTab === 'FILE' && !fileName) {
      setErrorMsg('Veuillez importer un fichier PDF ou une image (JPG, JPEG, PNG).');
      return;
    }
    if (sourceTab === 'MESSAGE' && !rawText.trim()) {
      setErrorMsg('Veuillez saisir ou coller un message commercial (devis, commande ou WhatsApp).');
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.importDocument({
        sourceType: sourceTab === 'MESSAGE' ? 'MESSAGE' : sourceType,
        fileName:
          sourceTab === 'FILE'
            ? fileName
            : fileName || `Message_Commercial_${new Date().toISOString().slice(0, 10)}.txt`,
        mimeType: sourceTab === 'FILE' ? mimeType : 'text/plain',
        sizeBytes:
          sourceTab === 'FILE' ? sizeBytes : new Blob([rawText]).size,
        rawText:
          sourceTab === 'MESSAGE'
            ? rawText
            : rawText.trim() || `Document importé : ${fileName}`,
        previewDataUrl: sourceTab === 'FILE' ? previewDataUrl : null,
        scenarioId: selectedScenarioId || undefined,
      });
      onDraftCreated(created);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Une erreur inattendue est survenue lors de la création du brouillon.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Nouvelle facture — Import de source commerciale
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Importez un devis, un bon de commande (PDF, JPG, PNG) ou collez un message commercial pour créer un brouillon vérifiable.
          </p>
        </div>
      </div>

      {mode === AppMode.INTEGRATION && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-950">
                MODE INTÉGRATION actif — Module src/extraction.py non encore intégré
              </p>
              <p className="text-xs text-amber-900 mt-0.5">
                L’application ne bascule jamais silencieusement vers une simulation en Mode Intégration. Lancer l’extraction renverra une erreur explicite tant que le module de Sosthène n’est pas connecté.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onGoToSettings}
            className="px-3 py-1.5 text-xs font-medium text-amber-950 bg-white border border-amber-300 rounded-md hover:bg-amber-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Revenir en Mode Démo
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Colonne principale : Import / Saisie */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-8 bg-white border border-gray-200 rounded-lg p-6 space-y-6"
        >
          {/* Sélecteur de source (contrôle segmenté interactif) */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-md w-fit">
            <button
              type="button"
              onClick={() => {
                setSourceTab('FILE');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                sourceTab === 'FILE'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Importer PDF ou image
            </button>
            <button
              type="button"
              onClick={() => {
                setSourceTab('MESSAGE');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                sourceTab === 'MESSAGE'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <MessageSquareText className="w-3.5 h-3.5" />
              Coller un message commercial
            </button>
          </div>

          {sourceTab === 'FILE' ? (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                id="source-file-input"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
                className="sr-only"
              />

              {!fileName ? (
                <label
                  htmlFor="source-file-input"
                  className="flex flex-col items-center justify-center border border-dashed border-gray-300 rounded-lg p-10 text-center bg-gray-50/60 hover:bg-emerald-50/40 hover:border-emerald-400 transition-colors cursor-pointer"
                >
                  <Upload className="w-8 h-8 text-emerald-800 mb-3" />
                  <span className="text-sm font-medium text-gray-900">
                    Cliquez pour sélectionner un document commercial
                  </span>
                  <span className="text-xs text-gray-500 mt-1">
                    Formats pris en charge : PDF, JPG, JPEG, PNG (max 8 Mo)
                  </span>
                </label>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {sourceType === 'IMAGE' ? (
                        <FileImage className="w-4 h-4 text-emerald-800 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-emerald-800 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{fileName}</p>
                        <p className="text-xs text-gray-500 font-mono-num">
                          {sourceType} · {(sizeBytes / 1024).toFixed(1)} Ko
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="source-file-input"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Remplacer
                      </label>
                      <button
                        type="button"
                        onClick={handleClearFile}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-white border border-rose-200 rounded hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Supprimer
                      </button>
                    </div>
                  </div>

                  {/* Prévisualisation du document importé */}
                  <div className="p-4 bg-white">
                    {sourceType === 'IMAGE' && previewDataUrl ? (
                      <div className="flex justify-center bg-gray-50 rounded border border-gray-100 p-3">
                        <img
                          src={previewDataUrl}
                          alt={`Aperçu de ${fileName}`}
                          className="max-h-72 object-contain rounded"
                        />
                      </div>
                    ) : sourceType === 'PDF' && previewDataUrl ? (
                      <iframe
                        src={previewDataUrl}
                        title={`Aperçu PDF de ${fileName}`}
                        className="w-full h-72 border border-gray-200 rounded"
                      />
                    ) : (
                      <p className="text-xs text-gray-500">
                        Document prêt pour l’extraction de démonstration.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="optional-notes"
                  className="block text-xs font-medium text-gray-700 mb-1.5"
                >
                  Texte complémentaire ou contexte de commande (optionnel)
                </label>
                <textarea
                  id="optional-notes"
                  rows={3}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Ex. Client : Atlantique Services, IFU : 3202500112233, Réf : BC-2026-412..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="commercial-message"
                  className="block text-xs font-medium text-gray-700"
                >
                  Contenu du devis, bon de commande ou message client (courriel / WhatsApp)
                </label>
                {rawText && (
                  <button
                    type="button"
                    onClick={() => {
                      setRawText('');
                      setFileName('');
                      setSelectedScenarioId('');
                    }}
                    className="text-xs text-rose-700 hover:text-rose-900 cursor-pointer"
                  >
                    Effacer le texte
                  </button>
                )}
              </div>
              <textarea
                id="commercial-message"
                rows={10}
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  if (selectedScenarioId) setSelectedScenarioId('');
                }}
                placeholder="Collez ici un devis, un bon de commande ou un message commercial béninois (client, référence, articles, quantités, prix en FCFA)..."
                className="w-full rounded-md border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              />
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="pt-2 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-gray-500">
              {mode === AppMode.DEMO
                ? 'Extraction déterministe de démonstration (données fictives, sans appel LLM réel). Crée un brouillon non numéroté.'
                : 'Appellera l’adaptateur externe src/extraction.py (MODE INTÉGRATION).'}
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-4 h-4" />
              {submitting
                ? 'Extraction en cours...'
                : mode === AppMode.DEMO
                  ? 'Lancer l’extraction (Démo)'
                  : 'Lancer l’extraction (Intégration)'}
            </button>
          </div>
        </form>

        {/* Colonne latérale : Scénarios prêts pour la démonstration jury */}
        <aside className="lg:col-span-4 bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Scénarios de démonstration (Bénin / FCFA)
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Chargez un cas commercial fictif en un clic pour tester l’extraction simulée, la vérification humaine et les contrôles.
            </p>
          </div>

          <div className="space-y-2.5">
            {scenarios.map((sc) => {
              const active = selectedScenarioId === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => handleApplyScenario(sc)}
                  className={`w-full text-left p-3.5 rounded-md border transition-colors cursor-pointer ${
                    active
                      ? 'border-emerald-700 bg-emerald-50/50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-xs font-semibold text-gray-900">{sc.title}</div>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">{sc.subtitle}</p>
                  <div className="mt-2 text-[11px] font-mono-num text-emerald-800">
                    {sc.fileName}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
