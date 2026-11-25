import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Cpu,
  RotateCcw,
  Save,
  Sliders,
} from 'lucide-react';
import {
  AppMode,
  CompanySettings,
  EmissionChannel,
  ExternalModuleStatus,
} from '../shared/schemas';
import { ApiError, api } from '../services/api';

interface SettingsViewProps {
  settings: CompanySettings;
  modules: ExternalModuleStatus[];
  onSettingsUpdated: (settings: CompanySettings, modules: ExternalModuleStatus[]) => void;
  onDataReset: () => void;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

export function SettingsView({
  settings,
  modules,
  onSettingsUpdated,
  onDataReset,
  onNotify,
}: SettingsViewProps) {
  const [productName, setProductName] = useState(settings.productName);
  const [demoUser, setDemoUser] = useState(settings.demoUser);
  const [mode, setMode] = useState<AppMode>(settings.mode);
  const [enabledChannels, setEnabledChannels] = useState<EmissionChannel[]>(
    settings.enabledChannels
  );
  const [saving, setSaving] = useState(false);

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const toggleChannel = (ch: EmissionChannel) => {
    setEnabledChannels((prev) => {
      if (prev.includes(ch)) {
        if (prev.length === 1) return prev; // Garder au moins un canal actif
        return prev.filter((item) => item !== ch);
      }
      return [...prev, ch];
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateSettings({
        productName,
        demoUser,
        mode,
        enabledChannels,
      });
      onSettingsUpdated(res.settings, res.modules);
      onNotify(
        `Paramètres enregistrés (mode actif : ${res.settings.mode}).`,
        'success'
      );
    } catch (err) {
      onNotify(
        err instanceof ApiError ? err.message : 'Impossible de mettre à jour les paramètres.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetting(true);
    try {
      await api.resetDemo(confirmText);
      setResetDialogOpen(false);
      setConfirmText('');
      onDataReset();
      onNotify('Données de démonstration réinitialisées avec succès.', 'success');
    } catch (err) {
      setResetError(
        err instanceof ApiError ? err.message : 'Erreur lors de la réinitialisation.'
      );
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Paramètres et réinitialisation
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Configurez l’identité fictive de démonstration, les canaux d’émission simulée, le mode de fonctionnement (DÉMO ou INTÉGRATION) et la réinitialisation de la base SQLite locale.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Colonne gauche : Formulaire de configuration */}
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 bg-white border border-gray-200 rounded-lg p-6 space-y-6"
        >
          <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
            <Sliders className="w-4 h-4 text-emerald-800" />
            <h2 className="text-sm font-semibold text-gray-900">
              Configuration générale et mode de fonctionnement
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="product-name" className="block text-xs font-medium text-gray-700 mb-1">
                Nom du produit (configurable)
              </label>
              <input
                id="product-name"
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-900"
              />
            </div>

            <div>
              <label htmlFor="demo-user" className="block text-xs font-medium text-gray-700 mb-1">
                Utilisateur de démonstration (audit)
              </label>
              <input
                id="demo-user"
                type="text"
                value={demoUser}
                onChange={(e) => setDemoUser(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-900"
              />
            </div>
          </div>

          {/* Mode de fonctionnement */}
          <div className="space-y-2.5">
            <span className="block text-xs font-medium text-gray-700">
              Mode de fonctionnement de la couche d’adaptation
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode(AppMode.DEMO)}
                className={`text-left p-4 rounded-md border transition-colors cursor-pointer ${
                  mode === AppMode.DEMO
                    ? 'border-emerald-800 bg-emerald-50/50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="text-xs font-semibold text-gray-900">
                  MODE DÉMO (autonome — par défaut)
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Simule de façon déterministe l’extraction, les anomalies et les totaux afin de présenter tout le Rôle D sans attendre les autres modules.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode(AppMode.INTEGRATION)}
                className={`text-left p-4 rounded-md border transition-colors cursor-pointer ${
                  mode === AppMode.INTEGRATION
                    ? 'border-emerald-800 bg-emerald-50/50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="text-xs font-semibold text-gray-900">
                  MODE INTÉGRATION (modules équipe)
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Appelle uniquement les modules externes intégrés. Signale explicitement tout module manquant sans jamais basculer silencieusement vers une simulation.
                </p>
              </button>
            </div>
          </div>

          {/* Canaux de simulation */}
          <div className="space-y-2.5">
            <span className="block text-xs font-medium text-gray-700">
              Canaux de simulation d’émission disponibles
            </span>
            <div className="flex flex-wrap gap-3">
              {Object.values(EmissionChannel).map((ch) => {
                const checked = enabledChannels.includes(ch);
                return (
                  <label
                    key={ch}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-medium cursor-pointer ${
                      checked
                        ? 'border-emerald-700 bg-emerald-50/50 text-emerald-950'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleChannel(ch)}
                      className="rounded border-gray-300 text-emerald-800"
                    />
                    {ch === EmissionChannel.COURRIEL
                      ? 'Courriel (simulé)'
                      : ch === EmissionChannel.WHATSAPP
                        ? 'WhatsApp (simulé)'
                        : 'SMS (simulé)'}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-gray-200 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 rounded-md cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
            </button>
          </div>
        </form>

        {/* Colonne droite : Identité fictive + État modules externes */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
              <Building2 className="w-4 h-4 text-emerald-800" />
              <h2 className="text-sm font-semibold text-gray-900">
                Entreprise fictive (Bénin / FCFA)
              </h2>
            </div>
            <dl className="space-y-2 text-xs">
              <div>
                <dt className="text-gray-500">Raison sociale</dt>
                <dd className="font-semibold text-gray-900">{settings.companyName}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Statut</dt>
                <dd className="text-gray-700">{settings.legalForm}</dd>
              </div>
              <div>
                <dt className="text-gray-500">IFU de démonstration</dt>
                <dd className="font-mono-num text-gray-900">{settings.ifu}</dd>
              </div>
              <div>
                <dt className="text-gray-500">RCCM de démonstration</dt>
                <dd className="font-mono-num text-gray-900">{settings.rccm}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Siège fictif</dt>
                <dd className="text-gray-700">
                  {settings.address}, {settings.city}, {settings.country}
                </dd>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-100">
                <span className="text-gray-500">Devise d’affichage</span>
                <span className="font-mono-num font-semibold text-gray-900">
                  {settings.currencyLabel}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">TVA configurée (démo)</span>
                <span className="font-mono-num font-semibold text-gray-900">
                  {settings.defaultVatRate} %
                </span>
              </div>
            </dl>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
              <Cpu className="w-4 h-4 text-emerald-800" />
              <h2 className="text-sm font-semibold text-gray-900">
                Modules externes de l’équipe
              </h2>
            </div>
            <ul className="divide-y divide-gray-100 text-xs">
              {modules.map((m) => (
                <li key={m.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">
                      {m.name} ({m.owner})
                    </span>
                    <span
                      className={`text-[11px] font-medium ${
                        m.integrated ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {m.integrated ? 'Intégré' : 'En attente'}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-gray-500">{m.expectedFile}</p>
                  <p className="text-gray-600">{m.details}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* Zone de réinitialisation avec confirmation explicite */}
      <section className="bg-white border border-rose-200 rounded-lg p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-700" />
              Réinitialiser les données de démonstration
            </div>
            <p className="text-xs text-gray-600 max-w-2xl">
              Restaure le jeu de données initial (brouillons, facture validée, facture émise, avoir lié et journal d’audit) sans altérer la structure de la base SQLite. Un événement d’audit trace cette opération.
            </p>
          </div>
          {!resetDialogOpen && (
            <button
              type="button"
              onClick={() => {
                setResetDialogOpen(true);
                setResetError(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Réinitialiser la base démo
            </button>
          )}
        </div>

        {resetDialogOpen && (
          <form
            onSubmit={handleReset}
            className="p-4 rounded-md bg-rose-50/70 border border-rose-200 space-y-3"
          >
            <p className="text-xs text-rose-950">
              Confirmation explicite requise : saisissez <strong className="font-mono">REINITIALISER</strong> ci-dessous pour effacer les données courantes et restaurer le jeu initial.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                aria-label="Confirmation de réinitialisation"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Saisissez REINITIALISER"
                className="flex-1 rounded-md border border-rose-300 bg-white px-3 py-2 text-xs font-mono text-gray-900"
              />
              <button
                type="submit"
                disabled={resetting}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-rose-700 hover:bg-rose-800 disabled:opacity-50 rounded-md cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {resetting ? 'Réinitialisation...' : 'Confirmer la réinitialisation'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setResetDialogOpen(false);
                  setConfirmText('');
                  setResetError(null);
                }}
                className="px-3.5 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer"
              >
                Annuler
              </button>
            </div>
            {resetError && (
              <p role="alert" className="text-xs text-rose-800 font-medium">
                {resetError}
              </p>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
