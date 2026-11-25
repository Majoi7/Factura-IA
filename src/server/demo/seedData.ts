import {
  AnomalyItem,
  AnomalySeverity,
  AppMode,
  AuditActionType,
  AuditEvent,
  CompanySettings,
  DocumentLineItem,
  DocumentRecord,
  DocumentStatus,
  EmissionChannel,
  EmissionRecord,
  ExtractedField,
} from '../../shared/schemas';

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  productName: process.env.APP_PRODUCT_NAME || 'Factura AI',
  companyName: 'SOGECOT Bénin SARL',
  legalForm: 'SARL — Société fictive de démonstration',
  ifu: '3202600001482 (IFU fictif de démonstration)',
  rccm: 'RB/COT/26 B 00419 (RCCM fictif de démonstration)',
  address: 'Ilot 418, Boulevard Saint-Michel, Haie Vive',
  city: 'Cotonou',
  country: 'République du Bénin',
  email: 'facturation.demo@sogecot-benin.example',
  phone: '+229 01 97 00 42 18',
  currency: 'XOF',
  currencyLabel: 'FCFA (XOF)',
  defaultVatRate: 18,
  demoUser: 'Jého K. (Responsable Facturation — Démo)',
  mode: AppMode.DEMO,
  enabledChannels: [
    EmissionChannel.COURRIEL,
    EmissionChannel.WHATSAPP,
    EmissionChannel.SMS,
  ],
};

export interface DemoExtractionScenario {
  id: string;
  title: string;
  subtitle: string;
  sourceType: 'PDF' | 'IMAGE' | 'MESSAGE';
  fileName: string;
  rawText: string;
}

export const DEMO_SCENARIOS: DemoExtractionScenario[] = [
  {
    id: 'devis-anomalie',
    title: 'Devis matériel solaire (avec anomalie bloquante)',
    subtitle: 'Idéal pour la démo jury : champ IFU manquant + remise excessive à corriger avant validation.',
    sourceType: 'MESSAGE',
    fileName: 'Devis_Zou_Energie_2026-114.txt',
    rawText: `Devis n° DEV-2026-114 — Date : 2026-11-24
Client : Zou Énergie Solaire SARL
Adresse : Quartier Bohicon Centre, Route d'Abomey, Bénin
Contact : achats@zou-energie.example | Tél : +229 01 96 44 12 09
Objet : Fourniture kits photovoltaïques et régulateurs hybrides

1. Panneau monocristallin 550W — Qté : 12 — PU : 115 000 FCFA — Remise : 5 %
2. Onduleur hybride 5 kVA MPPT — Qté : 2 — PU : 485 000 FCFA — Remise : 0 %
3. Câblage solaire et coffret AC/DC — Qté : 1 — PU : 165 000 FCFA — Remise : 55 %

Conditions de règlement : Virement 30 jours fin de mois.
NB : Merci de compléter l'IFU client avant validation définitive.`,
  },
  {
    id: 'bc-complet',
    title: 'Bon de commande agro-logistique (prêt à valider)',
    subtitle: 'Document complet avec scores de confiance élevés et aucune anomalie bloquante.',
    sourceType: 'PDF',
    fileName: 'BC_Benin_AgroLogistique_892.pdf',
    rawText: `BON DE COMMANDE N° BC-BAL-2026-892
Émis le : 2026-11-22 | Échéance : 2026-12-22
Client : Bénin Agro-Logistique SA
IFU : 3202400891124
Adresse : Zone Portuaire, Akpakpa, Cotonou
Courriel : compta@benin-agrolog.example | WhatsApp : +229 01 95 22 80 14

Articles commandés :
- Maintenance flotte groupes électrogènes (trimestrielle) | Qté : 4 | PU : 240 000 FCFA | Remise : 0 %
- Kit filtres industriels haute capacité | Qté : 8 | PU : 42 500 FCFA | Remise : 5 %

Conditions : Paiement par virement bancaire BOA Bénin à 30 jours.`,
  },
  {
    id: 'whatsapp-incomplet',
    title: 'Message WhatsApp commercial (champs à confirmer)',
    subtitle: 'Message informel d’un client de Parakou avec date d’échéance absente et confiance 62 %.',
    sourceType: 'MESSAGE',
    fileName: 'Message_WhatsApp_Borgou_Froid.txt',
    rawText: `Bonjour SOGECOT, c'est M. Chabi de Borgou Froid & Services (Parakou, quartier Banikanni).
Nous confirmons la commande réf CMD-PK-047 pour :
- 3 compresseurs frigorifiques 2HP à 285 000 FCFA l'unité
- 6 bouteilles gaz réfrigérant R404A à 68 000 FCFA
Facturez sur notre email direction@borgou-froid.example ou WhatsApp +229 01 94 71 03 55.
Paiement sous 15 jours à réception. Merci !`,
  },
];

export function computeDemoTotals(lines: DocumentLineItem[], vatRate = 18) {
  let subtotalHt = 0;
  let totalDiscount = 0;

  for (const line of lines) {
    const qty = Math.max(0, Number(line.quantity) || 0);
    const price = Math.max(0, Number(line.unitPrice) || 0);
    const discPct = Math.min(100, Math.max(0, Number(line.discountPercent) || 0));
    const gross = Math.round(qty * price);
    const discount = Math.round((gross * discPct) / 100);
    subtotalHt += gross;
    totalDiscount += discount;
  }

  const netHt = subtotalHt - totalDiscount;
  const vatAmount = Math.round((netHt * vatRate) / 100);
  const totalTtc = netHt + vatAmount;

  return {
    subtotalHt,
    totalDiscount,
    netHt,
    vatRate,
    vatAmount,
    totalTtc,
    currency: 'XOF' as const,
    isSimulated: true,
    sourceModule: 'DEMO_ENGINE' as const,
  };
}

export function evaluateDemoAnomalies(doc: {
  clientName: string;
  clientIfu: string;
  commercialReference: string;
  issueDate: string;
  dueDate: string;
  lines: DocumentLineItem[];
  fields: ExtractedField[];
}): AnomalyItem[] {
  const anomalies: AnomalyItem[] = [];

  if (!doc.clientName.trim()) {
    anomalies.push({
      id: 'anom-client-missing',
      code: 'DEMO_CLIENT_MANQUANT',
      severity: AnomalySeverity.BLOQUANT,
      fieldKey: 'clientName',
      title: 'Nom du client manquant',
      message: 'Règle démo : le nom du client est obligatoire avant toute validation humaine.',
      resolved: false,
      isSimulated: true,
      sourceModule: 'DEMO_CONTROLS',
    });
  }

  if (!doc.clientIfu.trim()) {
    anomalies.push({
      id: 'anom-ifu-missing',
      code: 'DEMO_IFU_MANQUANT',
      severity: AnomalySeverity.BLOQUANT,
      fieldKey: 'clientIfu',
      title: 'Identifiant IFU client absent',
      message:
        'Règle démo : le champ IFU client est vide. Renseignez un IFU (ex. 13 chiffres fictifs) pour lever ce blocage.',
      resolved: false,
      isSimulated: true,
      sourceModule: 'DEMO_CONTROLS',
    });
  } else if (!/^\d{13}$/.test(doc.clientIfu.replace(/\s+/g, ''))) {
    anomalies.push({
      id: 'anom-ifu-format',
      code: 'DEMO_IFU_FORMAT',
      severity: AnomalySeverity.AVERTISSEMENT,
      fieldKey: 'clientIfu',
      title: 'Format IFU inhabituel (avertissement démo)',
      message:
        'Règle démo : un IFU béninois comporte habituellement 13 chiffres. Vérifiez la saisie avant validation.',
      resolved: false,
      isSimulated: true,
      sourceModule: 'DEMO_CONTROLS',
    });
  }

  if (!doc.dueDate.trim()) {
    anomalies.push({
      id: 'anom-duedate-missing',
      code: 'DEMO_ECHEANCE_MANQUANTE',
      severity: AnomalySeverity.AVERTISSEMENT,
      fieldKey: 'dueDate',
      title: 'Date d’échéance non renseignée',
      message: 'Règle démo : aucune date d’échéance n’a été détectée dans le document source.',
      resolved: false,
      isSimulated: true,
      sourceModule: 'DEMO_CONTROLS',
    });
  }

  if (!doc.lines || doc.lines.length === 0) {
    anomalies.push({
      id: 'anom-lines-empty',
      code: 'DEMO_LIGNES_VIDES',
      severity: AnomalySeverity.BLOQUANT,
      title: 'Aucune ligne d’article',
      message: 'Règle démo : la facture doit contenir au moins une ligne facturable.',
      resolved: false,
      isSimulated: true,
      sourceModule: 'DEMO_CONTROLS',
    });
  } else {
    doc.lines.forEach((line, idx) => {
      if (line.quantity <= 0 || line.unitPrice <= 0) {
        anomalies.push({
          id: `anom-line-invalid-${idx}`,
          code: 'DEMO_LIGNE_MONTANT_INVALIDE',
          severity: AnomalySeverity.BLOQUANT,
          title: `Ligne ${idx + 1} : quantité ou prix unitaire nul`,
          message: `La ligne « ${line.description || 'Sans libellé'} » doit avoir une quantité > 0 et un prix unitaire > 0 FCFA.`,
          resolved: false,
          isSimulated: true,
          sourceModule: 'DEMO_CONTROLS',
        });
      }
      if (line.discountPercent > 30) {
        anomalies.push({
          id: `anom-line-discount-${idx}`,
          code: 'DEMO_REMISE_EXCESSIVE',
          severity: AnomalySeverity.BLOQUANT,
          title: `Ligne ${idx + 1} : remise supérieure au plafond de 30 %`,
          message: `Remise détectée de ${line.discountPercent} % sur « ${line.description} ». Réduisez la remise à 30 % maximum pour autoriser la validation.`,
          resolved: false,
          isSimulated: true,
          sourceModule: 'DEMO_CONTROLS',
        });
      }
    });
  }

  const lowConfidenceCount = doc.fields.filter(
    (f) => f.confidence !== null && f.confidence < 75 && !f.verified && f.value.trim() !== ''
  ).length;

  if (lowConfidenceCount > 0) {
    anomalies.push({
      id: 'anom-low-confidence',
      code: 'DEMO_CONFIANCE_FAIBLE',
      severity: AnomalySeverity.INFO,
      title: `${lowConfidenceCount} champ(s) à confiance modérée (< 75 %)`,
      message:
        'Information démo : vérifiez manuellement les champs signalés avant de confirmer la validation humaine.',
      resolved: false,
      isSimulated: true,
      sourceModule: 'DEMO_CONTROLS',
    });
  }

  return anomalies;
}

export function buildSeedDataset(): {
  documents: DocumentRecord[];
  emissions: EmissionRecord[];
  auditEvents: AuditEvent[];
  sequences: { invoiceYear: number; invoiceLast: number; creditLast: number; draftLast: number };
} {
  // 1. Brouillon avec anomalie bloquante (scénario phare pour le jury)
  const draft1Lines: DocumentLineItem[] = [
    {
      id: 'ln-d1-1',
      description: 'Panneau photovoltaïque monocristallin 550W',
      quantity: 12,
      unit: 'unité',
      unitPrice: 115000,
      discountPercent: 5,
      vatRate: 18,
      sourceText: 'Panneau monocristallin 550W — Qté : 12 — PU : 115 000 FCFA — Remise : 5 %',
      confidence: 98,
      verified: true,
    },
    {
      id: 'ln-d1-2',
      description: 'Onduleur hybride 5 kVA MPPT',
      quantity: 2,
      unit: 'unité',
      unitPrice: 485000,
      discountPercent: 0,
      vatRate: 18,
      sourceText: 'Onduleur hybride 5 kVA MPPT — Qté : 2 — PU : 485 000 FCFA',
      confidence: 94,
      verified: true,
    },
    {
      id: 'ln-d1-3',
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
  const draft1Fields: ExtractedField[] = [
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
      sourceText: 'Non détecté dans le document source',
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
      sourceText: 'Virement 30 jours fin de mois',
      confidence: 62,
      verified: false,
      required: false,
      isSimulated: true,
    },
    {
      key: 'paymentTerms',
      label: 'Conditions de paiement',
      value: 'Virement bancaire à 30 jours fin de mois',
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
  ];
  const draft1: DocumentRecord = {
    id: 'doc-demo-draft-1',
    invoiceNumber: null,
    draftCode: 'BR-2026-0004',
    status: DocumentStatus.BROUILLON,
    clientName: 'Zou Énergie Solaire SARL',
    clientIfu: '',
    clientEmail: 'achats@zou-energie.example',
    clientPhone: '+229 01 96 44 12 09',
    clientAddress: "Quartier Bohicon Centre, Route d'Abomey, Bénin",
    commercialReference: 'DEV-2026-114',
    issueDate: '2026-11-24',
    dueDate: '2026-12-24',
    paymentTerms: 'Virement bancaire à 30 jours fin de mois',
    currency: 'XOF',
    fields: draft1Fields,
    lines: draft1Lines,
    anomalies: evaluateDemoAnomalies({
      clientName: 'Zou Énergie Solaire SARL',
      clientIfu: '',
      commercialReference: 'DEV-2026-114',
      issueDate: '2026-11-24',
      dueDate: '2026-12-24',
      lines: draft1Lines,
      fields: draft1Fields,
    }),
    totals: computeDemoTotals(draft1Lines, 18),
    source: {
      fileName: 'Devis_Zou_Energie_2026-114.pdf',
      mimeType: 'application/pdf',
      sourceType: 'PDF',
      sizeBytes: 148200,
      rawText: DEMO_SCENARIOS[0].rawText,
      previewDataUrl: null,
      uploadedAt: '2026-11-24T09:15:00.000Z',
    },
    originalDocumentId: null,
    originalInvoiceNumber: null,
    creditNoteReason: null,
    validatedAt: null,
    validatedBy: null,
    validationIdempotencyKey: null,
    emissions: [],
    isDemoData: true,
    createdAt: '2026-11-24T09:15:00.000Z',
    updatedAt: '2026-11-24T09:16:00.000Z',
  };

  // 2. Brouillon prêt à valider (aucune anomalie bloquante)
  const draft2Lines: DocumentLineItem[] = [
    {
      id: 'ln-d2-1',
      description: 'Prestation audit réseau fibre optique — Agence Akpakpa',
      quantity: 1,
      unit: 'forfait',
      unitPrice: 450000,
      discountPercent: 0,
      vatRate: 18,
      sourceText: 'Audit réseau fibre optique Agence Akpakpa : 450 000 FCFA',
      confidence: 98,
      verified: true,
    },
    {
      id: 'ln-d2-2',
      description: 'Commutateur manageable 24 ports PoE',
      quantity: 3,
      unit: 'unité',
      unitPrice: 175000,
      discountPercent: 5,
      vatRate: 18,
      sourceText: '3x Switch 24 ports PoE — 175 000 FCFA — remise 5 %',
      confidence: 95,
      verified: true,
    },
  ];
  const draft2Fields: ExtractedField[] = [
    {
      key: 'clientName',
      label: 'Client',
      value: 'Cotonou Tech Services SA',
      sourceText: 'Client : Cotonou Tech Services SA',
      confidence: 98,
      verified: true,
      required: true,
      isSimulated: true,
    },
    {
      key: 'clientIfu',
      label: 'IFU Client',
      value: '3202300419821',
      sourceText: 'IFU : 3202300419821',
      confidence: 98,
      verified: true,
      required: true,
      isSimulated: true,
    },
    {
      key: 'commercialReference',
      label: 'Référence commerciale',
      value: 'BC-CTS-2026-308',
      sourceText: 'Bon de commande BC-CTS-2026-308',
      confidence: 97,
      verified: true,
      required: true,
      isSimulated: true,
    },
    {
      key: 'issueDate',
      label: 'Date du document',
      value: '2026-11-23',
      sourceText: 'Date : 23/11/2026',
      confidence: 96,
      verified: true,
      required: true,
      isSimulated: true,
    },
    {
      key: 'dueDate',
      label: 'Date d’échéance',
      value: '2026-12-23',
      sourceText: 'Échéance : 23/12/2026',
      confidence: 85,
      verified: true,
      required: false,
      isSimulated: true,
    },
    {
      key: 'paymentTerms',
      label: 'Conditions de paiement',
      value: 'Virement bancaire 30 jours nets',
      sourceText: 'Paiement : virement 30 jours nets',
      confidence: 92,
      verified: true,
      required: false,
      isSimulated: true,
    },
    {
      key: 'clientEmail',
      label: 'Courriel client',
      value: 'finance@cotonou-tech.example',
      sourceText: 'finance@cotonou-tech.example',
      confidence: 98,
      verified: true,
      required: false,
      isSimulated: true,
    },
    {
      key: 'clientPhone',
      label: 'Téléphone / WhatsApp',
      value: '+229 01 97 11 45 80',
      sourceText: '+229 01 97 11 45 80',
      confidence: 94,
      verified: true,
      required: false,
      isSimulated: true,
    },
  ];
  const draft2: DocumentRecord = {
    id: 'doc-demo-draft-2',
    invoiceNumber: null,
    draftCode: 'BR-2026-0005',
    status: DocumentStatus.BROUILLON,
    clientName: 'Cotonou Tech Services SA',
    clientIfu: '3202300419821',
    clientEmail: 'finance@cotonou-tech.example',
    clientPhone: '+229 01 97 11 45 80',
    clientAddress: 'Avenue Clozel, Ganhi, Cotonou, Bénin',
    commercialReference: 'BC-CTS-2026-308',
    issueDate: '2026-11-23',
    dueDate: '2026-12-23',
    paymentTerms: 'Virement bancaire 30 jours nets',
    currency: 'XOF',
    fields: draft2Fields,
    lines: draft2Lines,
    anomalies: evaluateDemoAnomalies({
      clientName: 'Cotonou Tech Services SA',
      clientIfu: '3202300419821',
      commercialReference: 'BC-CTS-2026-308',
      issueDate: '2026-11-23',
      dueDate: '2026-12-23',
      lines: draft2Lines,
      fields: draft2Fields,
    }),
    totals: computeDemoTotals(draft2Lines, 18),
    source: {
      fileName: 'BC_Cotonou_Tech_308.pdf',
      mimeType: 'application/pdf',
      sourceType: 'PDF',
      sizeBytes: 94120,
      rawText:
        'Bon de commande BC-CTS-2026-308 — Cotonou Tech Services SA (IFU 3202300419821). Audit réseau fibre optique Agence Akpakpa (450 000 FCFA) + 3 Switchs 24 ports PoE à 175 000 FCFA (remise 5 %). Virement 30 jours nets.',
      previewDataUrl: null,
      uploadedAt: '2026-11-23T14:40:00.000Z',
    },
    originalDocumentId: null,
    originalInvoiceNumber: null,
    creditNoteReason: null,
    validatedAt: null,
    validatedBy: null,
    validationIdempotencyKey: null,
    emissions: [],
    isDemoData: true,
    createdAt: '2026-11-23T14:40:00.000Z',
    updatedAt: '2026-11-23T15:05:00.000Z',
  };

  // 3. Facture VALIDÉE (prête pour simulation d'émission)
  const val1Lines: DocumentLineItem[] = [
    {
      id: 'ln-v1-1',
      description: 'Fourniture palettes bois traitées NIMP-15 (lot de 50)',
      quantity: 4,
      unit: 'lot',
      unitPrice: 310000,
      discountPercent: 0,
      vatRate: 18,
      confidence: 98,
      verified: true,
    },
    {
      id: 'ln-v1-2',
      description: 'Transport sécurisé zone portuaire — Abomey-Calavi',
      quantity: 2,
      unit: 'rotation',
      unitPrice: 85000,
      discountPercent: 0,
      vatRate: 18,
      confidence: 97,
      verified: true,
    },
  ];
  const val1: DocumentRecord = {
    id: 'doc-demo-val-1',
    invoiceNumber: 'FAC-2026-0002',
    draftCode: 'BR-2026-0002',
    status: DocumentStatus.VALIDEE,
    clientName: 'Atlantique Distribution SA',
    clientIfu: '3202100745210',
    clientEmail: 'fournisseurs@atlantique-distrib.example',
    clientPhone: '+229 01 97 52 19 04',
    clientAddress: 'Route de l’Aéroport, Cadjèhoun, Cotonou',
    commercialReference: 'BC-ATD-2026-190',
    issueDate: '2026-11-20',
    dueDate: '2026-12-20',
    paymentTerms: 'Virement bancaire 30 jours',
    currency: 'XOF',
    fields: [
      {
        key: 'clientName',
        label: 'Client',
        value: 'Atlantique Distribution SA',
        sourceText: 'Atlantique Distribution SA',
        confidence: 98,
        verified: true,
        required: true,
        isSimulated: true,
      },
      {
        key: 'clientIfu',
        label: 'IFU Client',
        value: '3202100745210',
        sourceText: 'IFU : 3202100745210',
        confidence: 98,
        verified: true,
        required: true,
        isSimulated: true,
      },
      {
        key: 'commercialReference',
        label: 'Référence commerciale',
        value: 'BC-ATD-2026-190',
        sourceText: 'Réf. BC-ATD-2026-190',
        confidence: 98,
        verified: true,
        required: true,
        isSimulated: true,
      },
      {
        key: 'issueDate',
        label: 'Date du document',
        value: '2026-11-20',
        sourceText: '20/11/2026',
        confidence: 98,
        verified: true,
        required: true,
        isSimulated: true,
      },
      {
        key: 'dueDate',
        label: 'Date d’échéance',
        value: '2026-12-20',
        sourceText: '20/12/2026',
        confidence: 95,
        verified: true,
        required: false,
        isSimulated: true,
      },
      {
        key: 'paymentTerms',
        label: 'Conditions de paiement',
        value: 'Virement bancaire 30 jours',
        sourceText: 'Virement bancaire 30 jours',
        confidence: 96,
        verified: true,
        required: false,
        isSimulated: true,
      },
    ],
    lines: val1Lines,
    anomalies: [],
    totals: computeDemoTotals(val1Lines, 18),
    source: {
      fileName: 'BC_Atlantique_Distribution_190.pdf',
      mimeType: 'application/pdf',
      sourceType: 'PDF',
      sizeBytes: 112500,
      rawText:
        'Bon de commande BC-ATD-2026-190 — Atlantique Distribution SA (IFU 3202100745210). 4 lots de 50 palettes NIMP-15 à 310 000 FCFA + 2 rotations transport à 85 000 FCFA.',
      previewDataUrl: null,
      uploadedAt: '2026-11-20T10:00:00.000Z',
    },
    originalDocumentId: null,
    originalInvoiceNumber: null,
    creditNoteReason: null,
    validatedAt: '2026-11-20T11:25:00.000Z',
    validatedBy: 'Jého K. (Responsable Facturation — Démo)',
    validationIdempotencyKey: 'seed-val-0002',
    emissions: [],
    isDemoData: true,
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T11:25:00.000Z',
  };

  // 4. Facture ÉMISE (avec émission simulée et un avoir lié)
  const em1Lines: DocumentLineItem[] = [
    {
      id: 'ln-e1-1',
      description: 'Licences suite gestion stocks (abonnement annuel 10 postes)',
      quantity: 10,
      unit: 'poste',
      unitPrice: 95000,
      discountPercent: 10,
      vatRate: 18,
      confidence: 98,
      verified: true,
    },
    {
      id: 'ln-e1-2',
      description: 'Formation équipe comptable sur site — Porto-Novo',
      quantity: 2,
      unit: 'jour',
      unitPrice: 180000,
      discountPercent: 0,
      vatRate: 18,
      confidence: 96,
      verified: true,
    },
  ];
  const em1Emission: EmissionRecord = {
    id: 'em-demo-1',
    documentId: 'doc-demo-em-1',
    channel: EmissionChannel.COURRIEL,
    recipient: 'comptabilite@oueme-materiaux.example',
    status: 'SIMULÉ_ENVOYÉ',
    simulatedAt: '2026-11-18T16:10:00.000Z',
    messagePreview:
      'Bonjour, veuillez trouver ci-joint la facture FAC-2026-0001 (1 433 700 FCFA TTC) — ÉMISSION SIMULÉE (MODE DÉMONSTRATION).',
    resultNote: 'Simulation réussie (aucun courriel réel envoyé).',
    performedBy: 'Jého K. (Responsable Facturation — Démo)',
    isSimulated: true,
  };
  const em1: DocumentRecord = {
    id: 'doc-demo-em-1',
    invoiceNumber: 'FAC-2026-0001',
    draftCode: 'BR-2026-0001',
    status: DocumentStatus.EMISE,
    clientName: 'Ouémé Matériaux & Négoce SARL',
    clientIfu: '3201900512908',
    clientEmail: 'comptabilite@oueme-materiaux.example',
    clientPhone: '+229 01 96 08 33 17',
    clientAddress: 'Boulevard Lagunaire, Quartier Catchi, Porto-Novo',
    commercialReference: 'CMD-OMN-2026-077',
    issueDate: '2026-11-18',
    dueDate: '2026-12-18',
    paymentTerms: 'Virement bancaire 30 jours',
    currency: 'XOF',
    fields: [
      {
        key: 'clientName',
        label: 'Client',
        value: 'Ouémé Matériaux & Négoce SARL',
        sourceText: 'Ouémé Matériaux & Négoce SARL',
        confidence: 98,
        verified: true,
        required: true,
        isSimulated: true,
      },
      {
        key: 'clientIfu',
        label: 'IFU Client',
        value: '3201900512908',
        sourceText: 'IFU : 3201900512908',
        confidence: 98,
        verified: true,
        required: true,
        isSimulated: true,
      },
      {
        key: 'commercialReference',
        label: 'Référence commerciale',
        value: 'CMD-OMN-2026-077',
        sourceText: 'CMD-OMN-2026-077',
        confidence: 98,
        verified: true,
        required: true,
        isSimulated: true,
      },
      {
        key: 'issueDate',
        label: 'Date du document',
        value: '2026-11-18',
        sourceText: '18/11/2026',
        confidence: 98,
        verified: true,
        required: true,
        isSimulated: true,
      },
      {
        key: 'dueDate',
        label: 'Date d’échéance',
        value: '2026-12-18',
        sourceText: '18/12/2026',
        confidence: 98,
        verified: true,
        required: false,
        isSimulated: true,
      },
      {
        key: 'paymentTerms',
        label: 'Conditions de paiement',
        value: 'Virement bancaire 30 jours',
        sourceText: 'Virement bancaire 30 jours',
        confidence: 98,
        verified: true,
        required: false,
        isSimulated: true,
      },
    ],
    lines: em1Lines,
    anomalies: [],
    totals: computeDemoTotals(em1Lines, 18),
    source: {
      fileName: 'Commande_Oueme_Materiaux_077.pdf',
      mimeType: 'application/pdf',
      sourceType: 'PDF',
      sizeBytes: 128900,
      rawText:
        'Commande CMD-OMN-2026-077 — Ouémé Matériaux & Négoce SARL (IFU 3201900512908). 10 licences annuelles gestion stocks à 95 000 FCFA (-10 %) + 2 jours formation Porto-Novo à 180 000 FCFA.',
      previewDataUrl: null,
      uploadedAt: '2026-11-18T08:30:00.000Z',
    },
    originalDocumentId: null,
    originalInvoiceNumber: null,
    creditNoteReason: null,
    validatedAt: '2026-11-18T14:20:00.000Z',
    validatedBy: 'Jého K. (Responsable Facturation — Démo)',
    validationIdempotencyKey: 'seed-val-0001',
    emissions: [em1Emission],
    isDemoData: true,
    createdAt: '2026-11-18T08:30:00.000Z',
    updatedAt: '2026-11-18T16:10:00.000Z',
  };

  // 5. Avoir lié à la facture FAC-2026-0001 (correction d'une journée de formation reportée)
  const av1Lines: DocumentLineItem[] = [
    {
      id: 'ln-av1-1',
      description: 'Avoir partiel — 1 journée de formation Porto-Novo reportée au trimestre suivant',
      quantity: 1,
      unit: 'jour',
      unitPrice: 180000,
      discountPercent: 0,
      vatRate: 18,
      confidence: 100,
      verified: true,
    },
  ];
  const av1: DocumentRecord = {
    id: 'doc-demo-av-1',
    invoiceNumber: 'AV-2026-0001',
    draftCode: 'AV-REF-0001',
    status: DocumentStatus.AVOIR,
    clientName: 'Ouémé Matériaux & Négoce SARL',
    clientIfu: '3201900512908',
    clientEmail: 'comptabilite@oueme-materiaux.example',
    clientPhone: '+229 01 96 08 33 17',
    clientAddress: 'Boulevard Lagunaire, Quartier Catchi, Porto-Novo',
    commercialReference: 'AVOIR SUR FAC-2026-0001',
    issueDate: '2026-11-19',
    dueDate: '2026-11-19',
    paymentTerms: 'Déduction sur règlement de FAC-2026-0001',
    currency: 'XOF',
    fields: [],
    lines: av1Lines,
    anomalies: [],
    totals: computeDemoTotals(av1Lines, 18),
    source: null,
    originalDocumentId: 'doc-demo-em-1',
    originalInvoiceNumber: 'FAC-2026-0001',
    creditNoteReason:
      'Report d’une journée de formation sur site à la demande du client (facture originale FAC-2026-0001 conservée intacte).',
    validatedAt: '2026-11-19T10:45:00.000Z',
    validatedBy: 'Jého K. (Responsable Facturation — Démo)',
    validationIdempotencyKey: 'seed-av-0001',
    emissions: [],
    isDemoData: true,
    createdAt: '2026-11-19T10:45:00.000Z',
    updatedAt: '2026-11-19T10:45:00.000Z',
  };

  const auditEvents: AuditEvent[] = [
    {
      id: 'aud-seed-1',
      actionType: AuditActionType.DOCUMENT_CREE,
      documentId: 'doc-demo-em-1',
      documentLabel: 'FAC-2026-0001',
      user: 'Jého K. (Responsable Facturation — Démo)',
      timestamp: '2026-11-18T08:30:00.000Z',
      details: 'Création du brouillon BR-2026-0001 à partir de Commande_Oueme_Materiaux_077.pdf',
      oldValue: null,
      newValue: 'BROUILLON',
    },
    {
      id: 'aud-seed-2',
      actionType: AuditActionType.NUMERO_ATTRIBUE,
      documentId: 'doc-demo-em-1',
      documentLabel: 'FAC-2026-0001',
      user: 'Jého K. (Responsable Facturation — Démo)',
      timestamp: '2026-11-18T14:20:00.000Z',
      details: 'Validation humaine confirmée et attribution du numéro unique FAC-2026-0001.',
      oldValue: 'BROUILLON (sans numéro)',
      newValue: 'VALIDÉE — FAC-2026-0001',
    },
    {
      id: 'aud-seed-3',
      actionType: AuditActionType.EMISSION_SIMULEE,
      documentId: 'doc-demo-em-1',
      documentLabel: 'FAC-2026-0001',
      user: 'Jého K. (Responsable Facturation — Démo)',
      timestamp: '2026-11-18T16:10:00.000Z',
      details: 'Émission simulée via COURRIEL vers comptabilite@oueme-materiaux.example.',
      oldValue: 'VALIDÉE',
      newValue: 'ÉMISE (simulée)',
    },
    {
      id: 'aud-seed-4',
      actionType: AuditActionType.AVOIR_CREE,
      documentId: 'doc-demo-av-1',
      documentLabel: 'AV-2026-0001',
      user: 'Jého K. (Responsable Facturation — Démo)',
      timestamp: '2026-11-19T10:45:00.000Z',
      details: 'Création de l’avoir AV-2026-0001 lié à la facture immuable FAC-2026-0001 (212 400 FCFA TTC).',
      oldValue: null,
      newValue: 'AV-2026-0001 -> FAC-2026-0001',
    },
    {
      id: 'aud-seed-5',
      actionType: AuditActionType.DOCUMENT_VALIDE,
      documentId: 'doc-demo-val-1',
      documentLabel: 'FAC-2026-0002',
      user: 'Jého K. (Responsable Facturation — Démo)',
      timestamp: '2026-11-20T11:25:00.000Z',
      details: 'Validation humaine de BR-2026-0002 → numéro FAC-2026-0002 attribué.',
      oldValue: 'BROUILLON',
      newValue: 'VALIDÉE — FAC-2026-0002',
    },
    {
      id: 'aud-seed-6',
      actionType: AuditActionType.SOURCE_IMPORTEE,
      documentId: 'doc-demo-draft-1',
      documentLabel: 'BR-2026-0004',
      user: 'Jého K. (Responsable Facturation — Démo)',
      timestamp: '2026-11-24T09:15:00.000Z',
      details:
        'Import de Devis_Zou_Energie_2026-114.pdf — 2 anomalies bloquantes détectées (IFU manquant, remise 55 %).',
      oldValue: null,
      newValue: 'BROUILLON (en attente de vérification)',
    },
  ];

  return {
    documents: [draft1, draft2, val1, em1, av1],
    emissions: [em1Emission],
    auditEvents,
    sequences: {
      invoiceYear: 2026,
      invoiceLast: 2,
      creditLast: 1,
      draftLast: 5,
    },
  };
}
