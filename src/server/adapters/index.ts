/**
 * Couche d'adaptation modulaire — MODE DEMO vs MODE INTEGRATION
 *
 * Règle impérative du projet :
 * - En MODE DEMO : utilise des simulations déterministes explicitement marquées `isSimulated: true`.
 * - En MODE INTEGRATION : appelle les modules externes de l'équipe (Sosthène : extraction,
 *   Phanouel : controls & engine). Si un module externe n'est pas encore intégré, lève une erreur
 *   explicite `MODULE_NOT_INTEGRATED` et ne bascule JAMAIS silencieusement vers une simulation.
 */

import crypto from 'node:crypto';
import {
  AnomalyItem,
  AppMode,
  CalculationResult,
  DocumentLineItem,
  DomainError,
  ExtractedField,
  ExternalModuleStatus,
  ExtractionAdapterOutput,
  ExtractionInput,
} from '../../shared/schemas';
import { computeDemoTotals, evaluateDemoAnomalies } from '../demo/seedData';

export interface ExternalExtractionProvider {
  extract(input: ExtractionInput): Promise<ExtractionAdapterOutput>;
}

export interface ExternalControlsProvider {
  evaluate(doc: {
    clientName: string;
    clientIfu: string;
    commercialReference: string;
    issueDate: string;
    dueDate: string;
    lines: DocumentLineItem[];
    fields: ExtractedField[];
  }): Promise<AnomalyItem[]>;
}

export interface ExternalCalculationProvider {
  calculate(lines: DocumentLineItem[], vatRate: number): Promise<CalculationResult>;
}

export interface AdapterRegistry {
  extraction: ExternalExtractionProvider | null;
  controls: ExternalControlsProvider | null;
  engine: ExternalCalculationProvider | null;
}

const defaultRegistry: AdapterRegistry = {
  // À connecter lors de l'intégration du module de Sosthène (src/extraction.py ou pont IPC/HTTP)
  extraction: null,
  // À connecter lors de l'intégration du module de Phanouel (src/controls.py)
  controls: null,
  // À connecter lors de l'intégration du module de Phanouel (src/engine.py)
  engine: null,
};

export function getExternalModuleStatuses(
  registry: AdapterRegistry = defaultRegistry
): ExternalModuleStatus[] {
  return [
    {
      id: 'extraction',
      name: 'Extraction IA documentaire',
      expectedFile: 'src/extraction.py (via adaptateur)',
      owner: 'Sosthène',
      integrated: registry.extraction !== null,
      statusLabel: registry.extraction ? 'Intégré' : 'Non intégré — simulé en Mode Démo',
      details: registry.extraction
        ? 'Module d’extraction connecté.'
        : 'En attente du module de Sosthène pour extraire les champs, textes sources et scores de confiance réels.',
    },
    {
      id: 'controls',
      name: 'Contrôles métier & anomalies',
      expectedFile: 'src/controls.py (via adaptateur)',
      owner: 'Phanouel',
      integrated: registry.controls !== null,
      statusLabel: registry.controls ? 'Intégré' : 'Non intégré — simulé en Mode Démo',
      details: registry.controls
        ? 'Moteur de contrôles connecté.'
        : 'En attente du moteur de règles de Phanouel (anomalies informatives, avertissements et blocages).',
    },
    {
      id: 'engine',
      name: 'Moteur de calcul déterministe',
      expectedFile: 'src/engine.py (via adaptateur)',
      owner: 'Phanouel',
      integrated: registry.engine !== null,
      statusLabel: registry.engine ? 'Intégré' : 'Non intégré — simulé en Mode Démo',
      details: registry.engine
        ? 'Moteur de calcul connecté.'
        : 'En attente du moteur Decimal de Phanouel pour les calculs HT, remises, taxes et TTC.',
    },
  ];
}

/**
 * Extraction déterministe de démonstration (aucun appel LLM réel tant que src/extraction.py n'est pas connecté).
 * Ne fabrique jamais de valeur pour un champ absent : laisse la valeur vide et signale l'absence.
 */
function runDemoExtraction(input: ExtractionInput): ExtractionAdapterOutput {
  const text = (input.rawText || '').trim();
  const lower = text.toLowerCase();

  // Scénario 1 : Zou Énergie Solaire (Devis avec anomalie bloquante + IFU manquant)
  if (input.scenarioId === 'devis-anomalie' || lower.includes('zou énergie') || lower.includes('dev-2026-114')) {
    const lines: DocumentLineItem[] = [
      {
        id: `ln-${crypto.randomUUID().slice(0, 8)}`,
        description: 'Panneau monocristallin 550W',
        quantity: 12,
        unit: 'unité',
        unitPrice: 115000,
        discountPercent: 5,
        vatRate: 18,
        sourceText: 'Panneau monocristallin 550W — Qté : 12 — PU : 115 000 FCFA — Remise : 5 %',
        confidence: 98,
        verified: false,
      },
      {
        id: `ln-${crypto.randomUUID().slice(0, 8)}`,
        description: 'Onduleur hybride 5 kVA MPPT',
        quantity: 2,
        unit: 'unité',
        unitPrice: 485000,
        discountPercent: 0,
        vatRate: 18,
        sourceText: 'Onduleur hybride 5 kVA MPPT — Qté : 2 — PU : 485 000 FCFA',
        confidence: 95,
        verified: false,
      },
      {
        id: `ln-${crypto.randomUUID().slice(0, 8)}`,
        description: 'Câblage solaire et coffret AC/DC',
        quantity: 1,
        unit: 'forfait',
        unitPrice: 165000,
        discountPercent: 55,
        vatRate: 18,
        sourceText: 'Câblage solaire et coffret AC/DC — PU : 165 000 FCFA — Remise : 55 %',
        confidence: 62,
        verified: false,
      },
    ];

    return {
      clientName: 'Zou Énergie Solaire SARL',
      clientIfu: '',
      clientEmail: 'achats@zou-energie.example',
      clientPhone: '+229 01 96 44 12 09',
      clientAddress: "Quartier Bohicon Centre, Route d'Abomey, Bénin",
      commercialReference: 'DEV-2026-114',
      issueDate: '2026-11-24',
      dueDate: '2026-12-24',
      paymentTerms: 'Virement 30 jours fin de mois',
      fields: [
        {
          key: 'clientName',
          label: 'Client',
          value: 'Zou Énergie Solaire SARL',
          sourceText: 'Client : Zou Énergie Solaire SARL',
          confidence: 98,
          verified: true,
          required: true,
          isSimulated: true,
        },
        {
          key: 'clientIfu',
          label: 'IFU Client',
          value: '',
          sourceText: 'Absent du document source (non inventé)',
          confidence: null,
          verified: false,
          required: true,
          isSimulated: true,
        },
        {
          key: 'commercialReference',
          label: 'Référence commerciale',
          value: 'DEV-2026-114',
          sourceText: 'Devis n° DEV-2026-114',
          confidence: 98,
          verified: true,
          required: true,
          isSimulated: true,
        },
        {
          key: 'issueDate',
          label: 'Date du document',
          value: '2026-11-24',
          sourceText: 'Date : 2026-11-24',
          confidence: 85,
          verified: false,
          required: true,
          isSimulated: true,
        },
        {
          key: 'dueDate',
          label: 'Date d’échéance',
          value: '2026-12-24',
          sourceText: 'Déduit de « 30 jours fin de mois » (à confirmer)',
          confidence: 62,
          verified: false,
          required: false,
          isSimulated: true,
        },
        {
          key: 'paymentTerms',
          label: 'Conditions de paiement',
          value: 'Virement 30 jours fin de mois',
          sourceText: 'Conditions de règlement : Virement 30 jours fin de mois.',
          confidence: 85,
          verified: false,
          required: false,
          isSimulated: true,
        },
        {
          key: 'clientEmail',
          label: 'Courriel client',
          value: 'achats@zou-energie.example',
          sourceText: 'Contact : achats@zou-energie.example',
          confidence: 96,
          verified: true,
          required: false,
          isSimulated: true,
        },
        {
          key: 'clientPhone',
          label: 'Téléphone / WhatsApp',
          value: '+229 01 96 44 12 09',
          sourceText: 'Tél : +229 01 96 44 12 09',
          confidence: 85,
          verified: false,
          required: false,
          isSimulated: true,
        },
      ],
      lines,
      isSimulated: true,
      sourceModule: 'DEMO_EXTRACTION',
    };
  }

  // Scénario 2 : Bénin Agro-Logistique (complet, prêt à valider)
  if (input.scenarioId === 'bc-complet' || lower.includes('agro-logistique') || lower.includes('bc-bal-2026-892')) {
    const lines: DocumentLineItem[] = [
      {
        id: `ln-${crypto.randomUUID().slice(0, 8)}`,
        description: 'Maintenance flotte groupes électrogènes (trimestrielle)',
        quantity: 4,
        unit: 'intervention',
        unitPrice: 240000,
        discountPercent: 0,
        vatRate: 18,
        sourceText: 'Maintenance flotte groupes électrogènes | Qté : 4 | PU : 240 000 FCFA',
        confidence: 98,
        verified: true,
      },
      {
        id: `ln-${crypto.randomUUID().slice(0, 8)}`,
        description: 'Kit filtres industriels haute capacité',
        quantity: 8,
        unit: 'kit',
        unitPrice: 42500,
        discountPercent: 5,
        vatRate: 18,
        sourceText: 'Kit filtres industriels haute capacité | Qté : 8 | PU : 42 500 FCFA | Remise : 5 %',
        confidence: 96,
        verified: true,
      },
    ];

    return {
      clientName: 'Bénin Agro-Logistique SA',
      clientIfu: '3202400891124',
      clientEmail: 'compta@benin-agrolog.example',
      clientPhone: '+229 01 95 22 80 14',
      clientAddress: 'Zone Portuaire, Akpakpa, Cotonou',
      commercialReference: 'BC-BAL-2026-892',
      issueDate: '2026-11-22',
      dueDate: '2026-12-22',
      paymentTerms: 'Virement bancaire BOA Bénin à 30 jours',
      fields: [
        {
          key: 'clientName',
          label: 'Client',
          value: 'Bénin Agro-Logistique SA',
          sourceText: 'Client : Bénin Agro-Logistique SA',
          confidence: 98,
          verified: true,
          required: true,
          isSimulated: true,
        },
        {
          key: 'clientIfu',
          label: 'IFU Client',
          value: '3202400891124',
          sourceText: 'IFU : 3202400891124',
          confidence: 98,
          verified: true,
          required: true,
          isSimulated: true,
        },
        {
          key: 'commercialReference',
          label: 'Référence commerciale',
          value: 'BC-BAL-2026-892',
          sourceText: 'BON DE COMMANDE N° BC-BAL-2026-892',
          confidence: 98,
          verified: true,
          required: true,
          isSimulated: true,
        },
        {
          key: 'issueDate',
          label: 'Date du document',
          value: '2026-11-22',
          sourceText: 'Émis le : 2026-11-22',
          confidence: 98,
          verified: true,
          required: true,
          isSimulated: true,
        },
        {
          key: 'dueDate',
          label: 'Date d’échéance',
          value: '2026-12-22',
          sourceText: 'Échéance : 2026-12-22',
          confidence: 95,
          verified: true,
          required: false,
          isSimulated: true,
        },
        {
          key: 'paymentTerms',
          label: 'Conditions de paiement',
          value: 'Virement bancaire BOA Bénin à 30 jours',
          sourceText: 'Paiement par virement bancaire BOA Bénin à 30 jours.',
          confidence: 85,
          verified: false,
          required: false,
          isSimulated: true,
        },
        {
          key: 'clientEmail',
          label: 'Courriel client',
          value: 'compta@benin-agrolog.example',
          sourceText: 'Courriel : compta@benin-agrolog.example',
          confidence: 98,
          verified: true,
          required: false,
          isSimulated: true,
        },
        {
          key: 'clientPhone',
          label: 'Téléphone / WhatsApp',
          value: '+229 01 95 22 80 14',
          sourceText: 'WhatsApp : +229 01 95 22 80 14',
          confidence: 96,
          verified: true,
          required: false,
          isSimulated: true,
        },
      ],
      lines,
      isSimulated: true,
      sourceModule: 'DEMO_EXTRACTION',
    };
  }

  // Scénario 3 : WhatsApp Borgou Froid (champs manquants + faible confiance)
  if (input.scenarioId === 'whatsapp-incomplet' || lower.includes('borgou') || lower.includes('cmd-pk-047')) {
    const lines: DocumentLineItem[] = [
      {
        id: `ln-${crypto.randomUUID().slice(0, 8)}`,
        description: 'Compresseur frigorifique 2HP',
        quantity: 3,
        unit: 'unité',
        unitPrice: 285000,
        discountPercent: 0,
        vatRate: 18,
        sourceText: '3 compresseurs frigorifiques 2HP à 285 000 FCFA l’unité',
        confidence: 85,
        verified: false,
      },
      {
        id: `ln-${crypto.randomUUID().slice(0, 8)}`,
        description: 'Bouteille gaz réfrigérant R404A',
        quantity: 6,
        unit: 'bouteille',
        unitPrice: 68000,
        discountPercent: 0,
        vatRate: 18,
        sourceText: '6 bouteilles gaz réfrigérant R404A à 68 000 FCFA',
        confidence: 85,
        verified: false,
      },
    ];

    return {
      clientName: 'Borgou Froid & Services',
      clientIfu: '',
      clientEmail: 'direction@borgou-froid.example',
      clientPhone: '+229 01 94 71 03 55',
      clientAddress: 'Quartier Banikanni, Parakou, Bénin',
      commercialReference: 'CMD-PK-047',
      issueDate: '2026-11-24',
      dueDate: '',
      paymentTerms: 'Paiement sous 15 jours à réception',
      fields: [
        {
          key: 'clientName',
          label: 'Client',
          value: 'Borgou Froid & Services',
          sourceText: 'M. Chabi de Borgou Froid & Services (Parakou)',
          confidence: 85,
          verified: false,
          required: true,
          isSimulated: true,
        },
        {
          key: 'clientIfu',
          label: 'IFU Client',
          value: '',
          sourceText: 'Absent du message WhatsApp (non inventé)',
          confidence: null,
          verified: false,
          required: true,
          isSimulated: true,
        },
        {
          key: 'commercialReference',
          label: 'Référence commerciale',
          value: 'CMD-PK-047',
          sourceText: 'commande réf CMD-PK-047',
          confidence: 98,
          verified: true,
          required: true,
          isSimulated: true,
        },
        {
          key: 'issueDate',
          label: 'Date du document',
          value: '2026-11-24',
          sourceText: 'Date de réception du message',
          confidence: 62,
          verified: false,
          required: true,
          isSimulated: true,
        },
        {
          key: 'dueDate',
          label: 'Date d’échéance',
          value: '',
          sourceText: 'Absente du message source (non inventée)',
          confidence: null,
          verified: false,
          required: false,
          isSimulated: true,
        },
        {
          key: 'paymentTerms',
          label: 'Conditions de paiement',
          value: 'Paiement sous 15 jours à réception',
          sourceText: 'Paiement sous 15 jours à réception',
          confidence: 85,
          verified: false,
          required: false,
          isSimulated: true,
        },
        {
          key: 'clientEmail',
          label: 'Courriel client',
          value: 'direction@borgou-froid.example',
          sourceText: 'email direction@borgou-froid.example',
          confidence: 98,
          verified: true,
          required: false,
          isSimulated: true,
        },
        {
          key: 'clientPhone',
          label: 'Téléphone / WhatsApp',
          value: '+229 01 94 71 03 55',
          sourceText: 'WhatsApp +229 01 94 71 03 55',
          confidence: 98,
          verified: true,
          required: false,
          isSimulated: true,
        },
      ],
      lines,
      isSimulated: true,
      sourceModule: 'DEMO_EXTRACTION',
    };
  }

  // Extraction générique déterministe sur texte libre ou fichier importé (PDF/Image)
  const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = text.match(/\+229[\s0-9]{8,14}/);
  const ifuMatch = text.match(/IFU\s*:?\s*(\d{10,15})/i);
  const refMatch = text.match(/(?:DEV|BC|CMD|REF|FACT)[-_A-Z0-9]{3,20}/i);
  const clientMatch = text.match(/Client\s*:\s*([^\n\r]+)/i);

  const clientName = clientMatch
    ? clientMatch[1].trim()
    : input.fileName
      ? `Client à confirmer (${input.fileName.replace(/\.[^.]+$/, '')})`
      : '';
  const clientIfu = ifuMatch ? ifuMatch[1].trim() : '';
  const commercialReference = refMatch ? refMatch[0].trim() : '';
  const clientEmail = emailMatch ? emailMatch[0].trim() : '';
  const clientPhone = phoneMatch ? phoneMatch[0].trim() : '';
  const today = new Date().toISOString().slice(0, 10);

  const lines: DocumentLineItem[] = [
    {
      id: `ln-${crypto.randomUUID().slice(0, 8)}`,
      description: `Prestation / fourniture extraite de ${input.fileName || 'source commerciale'} (démo)`,
      quantity: 1,
      unit: 'forfait',
      unitPrice: 250000,
      discountPercent: 0,
      vatRate: 18,
      sourceText: text ? text.slice(0, 110) : `Fichier importé : ${input.fileName}`,
      confidence: 62,
      verified: false,
    },
  ];

  return {
    clientName,
    clientIfu,
    clientEmail,
    clientPhone,
    clientAddress: 'Cotonou, République du Bénin (à confirmer)',
    commercialReference,
    issueDate: today,
    dueDate: '',
    paymentTerms: 'Virement bancaire à 30 jours (à confirmer)',
    fields: [
      {
        key: 'clientName',
        label: 'Client',
        value: clientName,
        sourceText: clientMatch ? clientMatch[0] : 'Détection simulée — à confirmer',
        confidence: clientMatch ? 85 : clientName ? 62 : null,
        verified: false,
        required: true,
        isSimulated: true,
      },
      {
        key: 'clientIfu',
        label: 'IFU Client',
        value: clientIfu,
        sourceText: ifuMatch ? ifuMatch[0] : 'Non détecté dans la source (champ laissé vide)',
        confidence: ifuMatch ? 98 : null,
        verified: false,
        required: true,
        isSimulated: true,
      },
      {
        key: 'commercialReference',
        label: 'Référence commerciale',
        value: commercialReference,
        sourceText: refMatch ? refMatch[0] : 'Non détectée dans la source (champ laissé vide)',
        confidence: refMatch ? 95 : null,
        verified: false,
        required: true,
        isSimulated: true,
      },
      {
        key: 'issueDate',
        label: 'Date du document',
        value: today,
        sourceText: 'Date d’importation du document',
        confidence: 62,
        verified: false,
        required: true,
        isSimulated: true,
      },
      {
        key: 'dueDate',
        label: 'Date d’échéance',
        value: '',
        sourceText: 'Non détectée dans la source (champ laissé vide)',
        confidence: null,
        verified: false,
        required: false,
        isSimulated: true,
      },
      {
        key: 'paymentTerms',
        label: 'Conditions de paiement',
        value: 'Virement bancaire à 30 jours (à confirmer)',
        sourceText: 'Défaut de démonstration — à confirmer',
        confidence: 62,
        verified: false,
        required: false,
        isSimulated: true,
      },
      {
        key: 'clientEmail',
        label: 'Courriel client',
        value: clientEmail,
        sourceText: emailMatch ? emailMatch[0] : 'Non détecté dans la source',
        confidence: emailMatch ? 98 : null,
        verified: false,
        required: false,
        isSimulated: true,
      },
      {
        key: 'clientPhone',
        label: 'Téléphone / WhatsApp',
        value: clientPhone,
        sourceText: phoneMatch ? phoneMatch[0] : 'Non détecté dans la source',
        confidence: phoneMatch ? 85 : null,
        verified: false,
        required: false,
        isSimulated: true,
      },
    ],
    lines,
    isSimulated: true,
    sourceModule: 'DEMO_EXTRACTION',
  };
}

export async function runExtractionAdapter(
  mode: AppMode,
  input: ExtractionInput,
  registry: AdapterRegistry = defaultRegistry
): Promise<ExtractionAdapterOutput> {
  if (mode === AppMode.INTEGRATION) {
    if (!registry.extraction) {
      throw new DomainError(
        'MODULE_NOT_INTEGRATED',
        'Module d’extraction externe non intégré (attendu : src/extraction.py de Sosthène). En MODE INTÉGRATION, aucune simulation silencieuse n’est utilisée.',
        503
      );
    }
    return registry.extraction.extract(input);
  }
  return runDemoExtraction(input);
}

export async function runControlsAdapter(
  mode: AppMode,
  doc: {
    clientName: string;
    clientIfu: string;
    commercialReference: string;
    issueDate: string;
    dueDate: string;
    lines: DocumentLineItem[];
    fields: ExtractedField[];
  },
  registry: AdapterRegistry = defaultRegistry
): Promise<AnomalyItem[]> {
  if (mode === AppMode.INTEGRATION) {
    if (!registry.controls) {
      throw new DomainError(
        'MODULE_NOT_INTEGRATED',
        'Module de contrôles métier externe non intégré (attendu : src/controls.py de Phanouel). En MODE INTÉGRATION, aucune simulation silencieuse n’est utilisée.',
        503
      );
    }
    return registry.controls.evaluate(doc);
  }
  return evaluateDemoAnomalies(doc);
}

export async function runCalculationAdapter(
  mode: AppMode,
  lines: DocumentLineItem[],
  vatRate: number,
  registry: AdapterRegistry = defaultRegistry
): Promise<CalculationResult> {
  if (mode === AppMode.INTEGRATION) {
    if (!registry.engine) {
      throw new DomainError(
        'MODULE_NOT_INTEGRATED',
        'Moteur de calcul externe non intégré (attendu : src/engine.py de Phanouel). En MODE INTÉGRATION, aucune simulation silencieuse n’est utilisée.',
        503
      );
    }
    return registry.engine.calculate(lines, vatRate);
  }
  return computeDemoTotals(lines, vatRate);
}
