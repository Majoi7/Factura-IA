# Factura AI — Rôle D : Documents et Interface
## Hackathon BWAI 2026 — Cas pratique 2 : Automatisation de la facturation

> **MODE DÉMONSTRATION — DONNÉES FICTIVES — ÉMISSION NON RÉELLE**
> Ce projet est entièrement fictif et pédagogique. Il ne produit pas de factures fiscalement normalisées ni officiellement reconnues par la Direction Générale des Impôts (DGI) du Bénin.

---

## Architecture réalisée (Stack du dépôt)

Le dépôt utilise la stack web présente dans l’environnement (Node.js 22+, TypeScript, Express, Vite, React 19, Tailwind CSS v4, SQLite natif `node:sqlite`, PDFKit), structurée selon une séparation modulaire stricte prête à recevoir les modules externes de l’équipe (notamment Python `src/extraction.py`, `src/controls.py`, `src/engine.py` via pont HTTP/CLI ou adaptateurs dédiés).

| Fichier / Dossier | Responsabilité (Rôle D — Jého) |
| --- | --- |
| `src/shared/schemas.ts` | Contrat commun partagé (statuts, champs extraits, anomalies, totaux, documents, émissions, audit). |
| `src/server/db.ts` | Persistance SQLite (`data/factura_demo.db`), contraintes `UNIQUE`, transactions `BEGIN IMMEDIATE`, séquences atomiques et jeu de données initial. |
| `src/server/documents.ts` | Cycle de vie complet : brouillons non numérotés, corrections, validation humaine idempotente et concurrente, immutabilité, avoirs liés, réinitialisation. |
| `src/server/audit.ts` | Journal d’audit persistant et non modifiable (anciennes/nouvelles valeurs, horodatage, acteur). |
| `src/server/channels.ts` | Simulation d’émission multi-canal (`COURRIEL`, `WHATSAPP`, `SMS`) sans aucun envoi externe réel. |
| `src/server/pdf.ts` | Export PDF A4 réel (`BROUILLON — NON ÉMIS`, `VALIDÉE / ÉMISE`, `AVOIR` lié à la facture originale). |
| `src/server/adapters/index.ts` | Couche d’adaptation séparant strictement `MODE DÉMO` et `MODE INTÉGRATION`. |
| `src/server/demo/seedData.ts` | Données fictives béninoises (FCFA / XOF), 3 scénarios commerciaux et règles de démonstration. |
| `server.ts` | Serveur Express (`/api/*`) + middleware Vite sur le port `3000`. |
| `src/components/*` & `src/App.tsx` | Interface SaaS complète (écrans A à K) inspirée de Pennylane et Yooz. |
| `tests/documents.test.ts` | Suite de tests automatisés (`node:test` via `tsx`) couvrant les 16 exigences de fiabilité. |

---

# ÉTAT D'AVANCEMENT ET GUIDE D'INTÉGRATION DE L'ÉQUIPE

## A. Ce que Jého a terminé

### 1. Interface SaaS complète (Écrans A à K)
- **Tableau de bord** : 6 KPI dynamiques issus de SQLite (brouillons, validées, émises, avoirs, en attente de vérification, anomalies bloquantes), derniers documents, dernières activités d’audit et actions rapides.
- **Nouvelle facture / Import** : import PDF, JPG, JPEG, PNG avec nom de fichier, prévisualisation, remplacement/suppression, saisie/collage de message commercial et 3 scénarios béninois de démonstration.
- **Vérification des données extraites** : écran scindé (document source à gauche, champs structurés à droite) avec zones distinctes (*Anomalies métier*, *Champs manquants*, *Champs à confirmer*, *Champs vérifiés*), scores de confiance simulés (98 %, 85 %, 62 %), textes sources, indicateurs de vérification et édition des lignes d’articles.
- **Liste des documents** : filtres (*Tous*, *Brouillons*, *Validées*, *Émises*, *Avoirs*) et recherche par numéro, client ou référence.
- **Détail d’un document** : affichage complet et actions strictement conditionnées au statut.
- **Modales métier** : validation humaine explicite, simulation d’émission multi-canal et création d’avoir lié (avec option de brouillon rectificatif).
- **Journal d’audit** : consultation filtrable en lecture seule avec diff ancien → nouveau.
- **Paramètres & réinitialisation** : identité fictive, nom du produit configurable, canaux actifs, bascule `MODE DÉMO` / `MODE INTÉGRATION` et réinitialisation doublement confirmée.

### 2. Cycle de vie des documents
- Gestion stricte des 4 statuts : `BROUILLON`, `VALIDÉE`, `ÉMISE`, `AVOIR`.
- Persistance complète sur disque dans SQLite (`data/factura_demo.db`) avec reprise immédiate après interruption ou redémarrage.

### 3. Validation humaine & Numérotation
- Le numéro définitif (`FAC-2026-XXXX`) n’est **jamais** attribué sur un `BROUILLON`.
- Validation refusée sans confirmation humaine explicite ou en présence d’une anomalie `BLOQUANT` non résolue.
- Attribution atomique via table `sequences` + contrainte `UNIQUE(invoice_number)` en base.

### 4. Idempotence & Validations concurrentes
- Clé d’idempotence (`validation_idempotency_key UNIQUE`) + vérification d’état dans une transaction SQLite `BEGIN IMMEDIATE`.
- Double clic, rejeu ou appels concurrents sur le même brouillon retournent exactement la même facture et le même numéro sans doublon ni saut de séquence.

### 5. Immutabilité & Avoirs
- Tout document `VALIDÉE`, `ÉMISE` ou `AVOIR` refuse toute modification directe (HTTP `409 DOCUMENT_IMMUTABLE`).
- Création d’un `AVOIR` (`AV-2026-XXXX`) obligatoirement lié à une facture existante (`original_document_id`), avec conservation intacte de la facture originale et création optionnelle d’un nouveau brouillon rectificatif.

### 6. Audit, PDF, Canaux, Réinitialisation & Mode démonstration
- Journal d’audit persistant (création, import, corrections ancien/nouveau, validation, numérotation, émission simulée, avoir, export PDF, changement de mode, réinitialisation).
- Export PDF A4 réel pour `BROUILLON` (`BROUILLON — NON ÉMIS`), `VALIDÉE / ÉMISE` et `AVOIR` avec mention claire de démonstration non DGI.
- Simulation d’émission sur `COURRIEL`, `WHATSAPP` et `SMS` sans envoi réel.
- Réinitialisation confirmée (`REINITIALISER`) restaurant le jeu initial sans altérer le schéma SQLite.
- `MODE DÉMO` autonome activé par défaut ; `MODE INTÉGRATION` levant une erreur explicite (`MODULE_NOT_INTEGRATED`) sans jamais simuler silencieusement.

---

## B. Ce qui reste à intégrer

| Responsable | Fichier attendu | Fonctionnalité attendue | Entrées | Sorties | État |
| --- | --- | --- | --- | --- | --- |
| Sosthène | `src/extraction.py` | Extraction IA | Source documentaire (PDF, image, texte) | Champs structurés, extraits sources et scores de confiance réels | À intégrer |
| Phanouel | `src/controls.py` | Détection des anomalies | Données extraites et référentiels | Liste des anomalies (`INFO`, `AVERTISSEMENT`, `BLOQUANT`) | À intégrer |
| Phanouel | `src/engine.py` | Calcul déterministe | Lignes, quantités, remises et taxes | Montants HT, remises, TVA et TTC fiables (`Decimal`) | À intégrer |
| Sosthène / Jého | `src/shared/schemas.ts` / `src/schemas.py` | Contrat commun | Structures des modules | Schémas partagés synchronisés | À coordonner |
| Jého | `src/server/*`, `src/components/*`, `tests/documents.test.ts` | Documents, audit, canaux, PDF, interface | Requêtes utilisateur & sorties adaptateurs | Cycle documentaire persistant, PDF, audit | Terminé et testé |
| Équipe | `tests/` | Tests d’intégration bout-en-bout | Modules assemblés | Résultats reproductibles | À compléter |

---

## C. Ce que chaque membre doit fournir

### Sosthène — Extraction IA (`src/extraction.py`)
- **Fonction d’entrée (proposition à valider)** : `extract_document(source_type: str, file_name: str, raw_text: str, file_bytes: bytes | None) -> dict` (ou endpoint HTTP `POST /extract` appelé par `ExternalExtractionProvider` dans `src/server/adapters/index.ts`).
- **Formats de fichiers acceptés** : PDF, JPG, JPEG, PNG et texte commercial brut.
- **Structure exacte attendue** : champs `clientName`, `clientIfu`, `clientEmail`, `clientPhone`, `clientAddress`, `commercialReference`, `issueDate`, `dueDate`, `paymentTerms`, tableau `fields` et tableau `lines`.
- **Confiance par champ** : entier `0` à `100` (ou `null` si absent). Les scores actuels (`98 %`, `85 %`, `62 %`) sont simulés en Mode Démo.
- **Source de chaque champ** : extrait exact du texte source ayant servi à détecter la valeur (`sourceText`).
- **Champs manquants** : valeur chaîne vide `""`, `confidence: null` — **ne jamais inventer** une donnée absente.
- **Gestion des erreurs** : erreur explicite typée (fichier illisible, délai dépassé, format invalide).
- **Tests fournis** : tests unitaires reproductibles sur au moins 3 documents (complet, incomplet, bruité).

### Phanouel — Contrôles et calculs (`src/controls.py` & `src/engine.py`)
- **Fonction d’entrée contrôles (proposition à valider)** : `run_controls(document_payload: dict) -> list[dict]`.
- **Structure des anomalies** : `{ id, code, severity, fieldKey, title, message, resolved }`.
- **Sévérités** :
  - `INFO` : informative, n’empêche pas la validation.
  - `AVERTISSEMENT` : alerte visible dans la vérification et la validation, non bloquante.
  - `BLOQUANT` : **interdit strictement** la validation humaine tant que non résolue.
- **Fonction d’entrée calcul (proposition à valider)** : `calculate_totals(lines: list[dict], vat_rate: Decimal) -> dict`.
- **Règles de calcul** : utilisation impérative de `Decimal` (aucun flottant binaire), arrondi FCFA (XOF, 0 décimale ou règle définie par l’équipe), prise en compte des quantités livrées, remises par ligne et TVA configurée.
- **Tests fournis** : tests déterministes sur arrondis, remises, quantités nulles/livrées et blocages.

### Jého — Documents et interface (livrable actuel)
- Cycle de vie `BROUILLON` → `VALIDÉE` → `ÉMISE` et `AVOIR` lié.
- Validation humaine obligatoire, idempotente et protégée contre les accès concurrents.
- Numérotation séquentielle post-validation (`FAC-2026-XXXX`, `AV-2026-XXXX`).
- Immutabilité post-validation vérifiée en base et dans l’API.
- Journal d’audit persistant, simulation d’émission multi-canal, export PDF A4 et interface SaaS complète.

---

# MODIFICATIONS NÉCESSAIRES LORS DE L'INTÉGRATION

Aucun fichier du Rôle D ne doit être supprimé lors de l’intégration. Seuls les branchements suivants sont nécessaires :

| # | Fichier concerné | Fonction / Emplacement | Modification précise | Raison | Responsable | Risque éventuel |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `src/server/adapters/index.ts` | `defaultRegistry.extraction` | Implémenter `ExternalExtractionProvider` appelant `src/extraction.py` (via HTTP local ou bridge CLI) et le brancher sur `defaultRegistry.extraction`. | Remplacer l’extraction simulée lorsque `MODE INTÉGRATION` est activé. | Sosthène + Jého | Écart de noms de champs entre JSON Python et `ExtractionAdapterOutput`. |
| 2 | `src/server/adapters/index.ts` | `defaultRegistry.controls` | Implémenter `ExternalControlsProvider` appelant `src/controls.py` et le brancher sur `defaultRegistry.controls`. | Remplacer `evaluateDemoAnomalies` en `MODE INTÉGRATION`. | Phanouel + Jého | Mapping des sévérités (`BLOQUANT` / `AVERTISSEMENT` / `INFO`). |
| 3 | `src/server/adapters/index.ts` | `defaultRegistry.engine` | Implémenter `ExternalCalculationProvider` appelant `src/engine.py` et le brancher sur `defaultRegistry.engine`. | Remplacer `computeDemoTotals` en `MODE INTÉGRATION`. | Phanouel + Jého | Différence d’arrondi sur les montants FCFA. |
| 4 | `.env` / `src/server/demo/seedData.ts` | `APP_MODE` | Passer `APP_MODE="INTEGRATION"` (ou basculer dans *Paramètres*). Conserver `src/server/demo/seedData.ts` pour les démonstrations hors-ligne. | Activer les vrais modules sans supprimer le mode démo de secours. | Équipe | Oubli de démarrage d’un service externe en mode intégration. |
| 5 | `src/shared/schemas.ts` | Types partagés | Vérifier l’alignement des champs avec `src/schemas.py` si un nouveau champ métier est introduit (après accord d’équipe). | Maintenir un contrat unique sans régression. | Sosthène / Phanouel / Jého | Casse de sérialisation JSON. |
| 6 | `tests/documents.test.ts` | Tests 15 & 16 | Ajouter des tests d’intégration dédiés dans un nouveau fichier `tests/integration.test.ts` sans supprimer les tests unitaires existants. | Valider la chaîne complète assemblée. | Équipe | Tests non déterministes si un LLM réel est appelé sans mock. |

**Fichiers à ne surtout pas supprimer** : `src/server/db.ts`, `src/server/documents.ts`, `src/server/audit.ts`, `src/server/channels.ts`, `src/server/pdf.ts`, `src/shared/schemas.ts`, `tests/documents.test.ts`.

---

## E. Procédure d'intégration étape par étape

1. Récupérer la branche du membre (`git fetch && git checkout ...`).
2. Copier ou fusionner son module (`src/extraction.py`, `src/controls.py` ou `src/engine.py`) sans écraser les fichiers du Rôle D.
3. Vérifier les dépendances et le contrat JSON attendu (voir section F).
4. Connecter l’adaptateur correspondant dans `src/server/adapters/index.ts` (`defaultRegistry`).
5. Passer l’application en `MODE INTÉGRATION` via l’écran *Paramètres* (ou `APP_MODE=INTEGRATION`), ce qui désactive automatiquement la simulation correspondante.
6. Exécuter les tests unitaires du module externe.
7. Exécuter les tests du Rôle D (`npm test`) puis les tests d’intégration bout-en-bout.
8. Vérifier manuellement le parcours complet dans l’interface (Import → Vérification → Correction → Validation → Émission simulée → PDF → Avoir → Audit).
9. Mettre à jour le tableau de la section B du présent `README.md`.

---

## F. Contrat d'intégration (exemples JSON — proposition à valider par l'équipe)

### Sortie attendue de l’adaptateur Extraction (`ExtractionAdapterOutput`)
```json
{
  "clientName": "Bénin Agro-Logistique SA",
  "clientIfu": "3202400891124",
  "clientEmail": "compta@benin-agrolog.example",
  "clientPhone": "+229 01 95 22 80 14",
  "clientAddress": "Zone Portuaire, Akpakpa, Cotonou",
  "commercialReference": "BC-BAL-2026-892",
  "issueDate": "2026-11-22",
  "dueDate": "2026-12-22",
  "paymentTerms": "Virement bancaire BOA Bénin à 30 jours",
  "fields": [
    {
      "key": "clientName",
      "label": "Client",
      "value": "Bénin Agro-Logistique SA",
      "sourceText": "Client : Bénin Agro-Logistique SA",
      "confidence": 98,
      "verified": false,
      "required": true,
      "isSimulated": false
    }
  ],
  "lines": [
    {
      "id": "ln-1",
      "description": "Maintenance flotte groupes électrogènes",
      "quantity": 4,
      "unit": "intervention",
      "unitPrice": 240000,
      "discountPercent": 0,
      "vatRate": 18,
      "sourceText": "Qté : 4 | PU : 240 000 FCFA",
      "confidence": 98,
      "verified": false
    }
  ],
  "isSimulated": false,
  "sourceModule": "EXTRACTION_MODULE"
}
```

### Sortie attendue des Contrôles (`AnomalyItem[]`)
```json
[
  {
    "id": "anom-ifu-missing",
    "code": "IFU_MANQUANT",
    "severity": "BLOQUANT",
    "fieldKey": "clientIfu",
    "title": "Identifiant IFU client absent",
    "message": "L'IFU client est requis avant validation.",
    "resolved": false,
    "isSimulated": false,
    "sourceModule": "CONTROLS_ENGINE"
  }
]
```

### Sortie attendue du Calcul (`CalculationResult`)
```json
{
  "subtotalHt": 1300000,
  "totalDiscount": 17000,
  "netHt": 1283000,
  "vatRate": 18,
  "vatAmount": 230940,
  "totalTtc": 1513940,
  "currency": "XOF",
  "isSimulated": false,
  "sourceModule": "CALCULATION_ENGINE"
}
```

---

## G. Lancement du projet et scénarios de démonstration

### 1. Installation et configuration
```bash
npm install
cp .env.example .env
```

### 2. Initialisation de la base et lancement
La base SQLite locale (`data/factura_demo.db`) est créée et peuplée automatiquement au premier démarrage :
```bash
npm run dev
```
L’interface est accessible sur `http://localhost:3000`.

### 3. Exécution des tests et vérification TypeScript
```bash
npm test
npm run lint
npm run build
```

### 4. Scénario de démonstration recommandé pour le jury
1. **Tableau de bord** : observer les compteurs SQLite en temps réel et l’alerte sur `BR-2026-0004` (Zou Énergie Solaire).
2. **Import** (*Nouvelle facture*) : charger un scénario béninois ou importer un PDF/image et lancer l’extraction démo → création d’un brouillon sans numéro.
3. **Vérification** : ouvrir `BR-2026-0004`, constater le champ IFU manquant (non inventé), la remise bloquante à 55 % et les scores de confiance (98 %, 85 %, 62 %).
4. **Correction humaine** : saisir un IFU fictif (ex. `3202600987654`), ramener la remise de la ligne 3 à `10 %` et cliquer sur *Enregistrer les corrections*.
5. **Validation humaine** : cliquer sur *Valider la facture*, cocher la confirmation → attribution du numéro unique `FAC-2026-0003`, verrouillage en lecture seule.
6. **Émission simulée** : depuis la fiche de la facture validée, cliquer sur *Simuler l’émission* (Courriel, WhatsApp ou SMS) → passage au statut `ÉMISE`.
7. **Export PDF** : télécharger le PDF (brouillon, facture validée/émise ou avoir).
8. **Création d’un avoir** : sur une facture validée ou émise, cliquer sur *Créer un avoir lié* → génération de `AV-2026-XXXX` tout en conservant la facture d’origine strictement intacte.
9. **Journal d’audit** : vérifier la traçabilité complète (anciennes/nouvelles valeurs, numérotation, émission, avoir).
10. **Mode Intégration & Réinitialisation** (*Paramètres*) : tester la protection en `MODE INTÉGRATION`, puis réinitialiser proprement la base en saisissant `REINITIALISER`.

### 5. Dépannage
- Si la base locale doit être reconstruite à neuf : utiliser le bouton *Réinitialiser la base démo* dans *Paramètres* ou supprimer `data/factura_demo.db` avant de relancer `npm run dev`.
- Aucune clé API externe n’est requise en `MODE DÉMO`.
