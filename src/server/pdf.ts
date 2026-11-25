/**
 * Générateur d'export PDF professionnel — Rôle D (Jého).
 * Produit de véritables documents PDF A4 pour :
 * - BROUILLON (mention « BROUILLON — NON ÉMIS »)
 * - VALIDÉE / ÉMISE
 * - AVOIR (lié à la facture d'origine)
 *
 * Mentionne systématiquement le contexte fictif / démonstration et ne prétend
 * jamais produire une facture officiellement normalisée par la DGI Bénin.
 */

import PDFDocument from 'pdfkit';
import {
  CompanySettings,
  DocumentRecord,
  DocumentStatus,
} from '../shared/schemas';

function formatFcfa(amount: number): string {
  const rounded = Math.round(amount);
  const formatted = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} FCFA`;
}

export function generateDocumentPdfBuffer(
  doc: DocumentRecord,
  settings: CompanySettings
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: 44,
      info: {
        Title: `${doc.invoiceNumber || doc.draftCode} — ${settings.productName}`,
        Author: settings.companyName,
        Subject: `Document ${doc.status} (MODE DÉMONSTRATION)`,
      },
    });

    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const emerald = '#065F46';
    const emeraldLight = '#ECFDF5';
    const slateDark = '#111827';
    const slateMuted = '#4B5563';
    const borderGray = '#D1D5DB';

    // Bandeau supérieur de démonstration (toujours visible)
    pdf
      .rect(44, 34, 507, 22)
      .fill(doc.status === DocumentStatus.BROUILLON ? '#FEF3C7' : emeraldLight);
    pdf
      .fillColor(doc.status === DocumentStatus.BROUILLON ? '#92400E' : emerald)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(
        doc.status === DocumentStatus.BROUILLON
          ? 'BROUILLON — NON ÉMIS  |  MODE DÉMONSTRATION — DONNÉES FICTIVES'
          : 'MODE DÉMONSTRATION — DONNÉES FICTIVES — ÉMISSION NON RÉELLE — DOCUMENT NON NORMALISÉ DGI',
        50,
        41,
        { width: 495, align: 'center' }
      );

    // Filigrane discret sur BROUILLON
    if (doc.status === DocumentStatus.BROUILLON) {
      pdf.save();
      pdf.rotate(-32, { origin: [300, 420] });
      pdf
        .fillColor('#E5E7EB')
        .font('Helvetica-Bold')
        .fontSize(46)
        .text('BROUILLON — NON ÉMIS', 40, 390, { align: 'center', width: 520 });
      pdf.restore();
    }

    // En-tête entreprise (gauche) et titre document (droite)
    const headerTop = 74;
    pdf
      .fillColor(emerald)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(settings.companyName, 44, headerTop);

    pdf
      .fillColor(slateMuted)
      .font('Helvetica')
      .fontSize(8.5)
      .text(settings.legalForm, 44, headerTop + 21)
      .text(`${settings.address}, ${settings.city}, ${settings.country}`, 44, headerTop + 33)
      .text(`IFU : ${settings.ifu}`, 44, headerTop + 45)
      .text(`RCCM : ${settings.rccm}`, 44, headerTop + 57)
      .text(`${settings.email}  |  ${settings.phone}`, 44, headerTop + 69);

    const docHeading =
      doc.status === DocumentStatus.AVOIR
        ? 'AVOIR'
        : doc.status === DocumentStatus.BROUILLON
          ? 'PROJET DE FACTURE'
          : 'FACTURE';

    pdf
      .fillColor(slateDark)
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(docHeading, 330, headerTop, { width: 221, align: 'right' });

    pdf
      .fillColor(emerald)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(doc.invoiceNumber || `${doc.draftCode} (non numéroté)`, 330, headerTop + 24, {
        width: 221,
        align: 'right',
      });

    pdf
      .fillColor(slateMuted)
      .font('Helvetica')
      .fontSize(8.5)
      .text(`Statut : ${doc.status}`, 330, headerTop + 41, { width: 221, align: 'right' })
      .text(`Date : ${doc.issueDate || 'Non renseignée'}`, 330, headerTop + 53, {
        width: 221,
        align: 'right',
      })
      .text(`Échéance : ${doc.dueDate || 'Non renseignée'}`, 330, headerTop + 65, {
        width: 221,
        align: 'right',
      });

    // Ligne séparatrice
    pdf
      .moveTo(44, 162)
      .lineTo(551, 162)
      .strokeColor(borderGray)
      .lineWidth(0.75)
      .stroke();

    // Bloc Client et Références
    const infoTop = 176;
    pdf
      .fillColor(slateMuted)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('CLIENT FACTURÉ (FICTIF)', 44, infoTop);

    pdf
      .fillColor(slateDark)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(doc.clientName || '(Client non renseigné)', 44, infoTop + 13);

    pdf
      .fillColor(slateMuted)
      .font('Helvetica')
      .fontSize(8.5)
      .text(`IFU client : ${doc.clientIfu || '(Non renseigné)'}`, 44, infoTop + 28)
      .text(doc.clientAddress || 'Adresse non renseignée', 44, infoTop + 40, { width: 240 })
      .text(
        `${doc.clientEmail || '—'}  |  ${doc.clientPhone || '—'}`,
        44,
        infoTop + 54,
        { width: 240 }
      );

    pdf
      .fillColor(slateMuted)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('RÉFÉRENCES & CONDITIONS', 310, infoTop);

    pdf
      .fillColor(slateDark)
      .font('Helvetica')
      .fontSize(8.5)
      .text(`Réf. commerciale : ${doc.commercialReference || '—'}`, 310, infoTop + 14)
      .text(`Conditions : ${doc.paymentTerms || '—'}`, 310, infoTop + 28, { width: 240 })
      .text(`Devise : ${settings.currencyLabel}`, 310, infoTop + 42);

    if (doc.validatedAt && doc.validatedBy) {
      pdf.text(
        `Validé par : ${doc.validatedBy} (${doc.validatedAt.slice(0, 10)})`,
        310,
        infoTop + 56,
        { width: 240 }
      );
    }

    let cursorY = 258;

    // Encadré spécifique AVOIR (lien obligatoire vers la facture originale)
    if (doc.status === DocumentStatus.AVOIR) {
      pdf
        .rect(44, cursorY, 507, 44)
        .fillAndStroke('#FEF2F2', '#FECACA');
      pdf
        .fillColor('#991B1B')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(
          `AVOIR LIÉ À LA FACTURE D'ORIGINE : ${doc.originalInvoiceNumber || doc.originalDocumentId}`,
          54,
          cursorY + 8
        );
      pdf
        .fillColor('#7F1D1D')
        .font('Helvetica')
        .fontSize(8.5)
        .text(`Motif : ${doc.creditNoteReason || 'Correction comptable'}`, 54, cursorY + 23, {
          width: 485,
        });
      cursorY += 58;
    }

    // Tableau des lignes d'articles
    const colX = {
      desc: 48,
      qty: 288,
      pu: 342,
      rem: 418,
      total: 468,
    };

    pdf.rect(44, cursorY, 507, 22).fill('#F3F4F6');
    pdf
      .fillColor(slateDark)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('DÉSIGNATION', colX.desc, cursorY + 7)
      .text('QTÉ', colX.qty, cursorY + 7, { width: 46, align: 'right' })
      .text('P.U. HT', colX.pu, cursorY + 7, { width: 70, align: 'right' })
      .text('REM.', colX.rem, cursorY + 7, { width: 42, align: 'right' })
      .text('TOTAL HT', colX.total, cursorY + 7, { width: 79, align: 'right' });

    cursorY += 26;

    const sign = doc.status === DocumentStatus.AVOIR ? -1 : 1;

    for (const line of doc.lines) {
      const gross = Math.round(line.quantity * line.unitPrice);
      const disc = Math.round((gross * (line.discountPercent || 0)) / 100);
      const net = (gross - disc) * sign;

      const rowHeight = 24;
      pdf
        .fillColor(slateDark)
        .font('Helvetica')
        .fontSize(8.5)
        .text(line.description, colX.desc, cursorY + 4, { width: 235, ellipsis: true })
        .text(`${line.quantity} ${line.unit || ''}`.trim(), colX.qty, cursorY + 4, {
          width: 46,
          align: 'right',
        })
        .text(formatFcfa(line.unitPrice), colX.pu, cursorY + 4, {
          width: 70,
          align: 'right',
        })
        .text(`${line.discountPercent || 0} %`, colX.rem, cursorY + 4, {
          width: 42,
          align: 'right',
        })
        .font('Helvetica-Bold')
        .text(formatFcfa(net), colX.total, cursorY + 4, {
          width: 79,
          align: 'right',
        });

      cursorY += rowHeight;
      pdf
        .moveTo(44, cursorY)
        .lineTo(551, cursorY)
        .strokeColor('#E5E7EB')
        .lineWidth(0.5)
        .stroke();
    }

    // Bloc Totaux (droite)
    cursorY += 16;
    const totalsBoxX = 320;
    const totalsBoxW = 231;

    const rows: Array<[string, string, boolean]> = [
      ['Sous-total brut HT', formatFcfa(doc.totals.subtotalHt * sign), false],
      ['Total remises', formatFcfa(-doc.totals.totalDiscount * sign), false],
      ['Total net HT', formatFcfa(doc.totals.netHt * sign), false],
      [`TVA configurée (${doc.totals.vatRate} % — démo)`, formatFcfa(doc.totals.vatAmount * sign), false],
      [
        doc.status === DocumentStatus.AVOIR ? 'NET À CRÉDITER TTC' : 'NET À PAYER TTC',
        formatFcfa(doc.totals.totalTtc * sign),
        true,
      ],
    ];

    for (const [label, value, highlight] of rows) {
      if (highlight) {
        pdf.rect(totalsBoxX, cursorY - 3, totalsBoxW, 24).fill(emerald);
        pdf
          .fillColor('#FFFFFF')
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .text(label, totalsBoxX + 10, cursorY + 4)
          .text(value, totalsBoxX + 110, cursorY + 4, { width: 112, align: 'right' });
        cursorY += 28;
      } else {
        pdf
          .fillColor(slateMuted)
          .font('Helvetica')
          .fontSize(8.5)
          .text(label, totalsBoxX + 10, cursorY + 2)
          .fillColor(slateDark)
          .text(value, totalsBoxX + 110, cursorY + 2, { width: 112, align: 'right' });
        cursorY += 18;
      }
    }

    pdf
      .fillColor(slateMuted)
      .font('Helvetica-Oblique')
      .fontSize(7.5)
      .text(
        doc.totals.isSimulated
          ? 'Note : Totaux calculés par le simulateur MODE DÉMO (en attente de src/engine.py).'
          : 'Totaux fournis par le moteur de calcul déterministe.',
        totalsBoxX,
        cursorY + 2,
        { width: totalsBoxW, align: 'right' }
      );

    // Pied de page réglementaire de démonstration
    const footerY = 762;
    pdf
      .moveTo(44, footerY - 8)
      .lineTo(551, footerY - 8)
      .strokeColor(borderGray)
      .lineWidth(0.75)
      .stroke();

    pdf
      .fillColor(slateMuted)
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(
        'AVERTISSEMENT — DOCUMENT DE DÉMONSTRATION (HACKATHON BWAI 2026)',
        44,
        footerY,
        { width: 507, align: 'center' }
      );
    pdf
      .font('Helvetica')
      .fontSize(7)
      .text(
        'Ce document est généré avec des données entièrement fictives dans un cadre pédagogique et de démonstration. Il ne constitue en aucun cas une facture normalisée officiellement émise ou reconnue par la Direction Générale des Impôts (DGI) du Bénin.',
        44,
        footerY + 12,
        { width: 507, align: 'center' }
      );

    pdf.end();
  });
}
