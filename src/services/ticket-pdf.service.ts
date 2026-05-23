import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

import type { Ticket } from '../types/domain';

const PAGE_WIDTH = 1016;
const PAGE_HEIGHT = 673;
const RED = '#d60000';
const INK = '#1f2a44';

export class TicketPdfService {
  async createTicketsPdf(tickets: Ticket[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pdf = new PDFDocument({ autoFirstPage: false, margin: 0, size: [PAGE_WIDTH, PAGE_HEIGHT] });
      const chunks: Buffer[] = [];
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdf.on('error', reject);
      pdf.on('end', () => resolve(Buffer.concat(chunks)));

      void this.writeTickets(pdf, tickets)
        .then(() => pdf.end())
        .catch((error) => {
          pdf.destroy();
          reject(error);
        });
    });
  }

  private async writeTickets(pdf: PDFKit.PDFDocument, tickets: Ticket[]): Promise<void> {
    for (const ticket of tickets) {
      const qrBuffer = await QRCode.toBuffer(ticket.qrUrl ?? ticket.codigo, {
        errorCorrectionLevel: 'H',
        margin: 2,
        scale: 12,
        color: { dark: INK, light: '#ffffff' }
      });

      pdf.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
      pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill('#ffffff');
      pdf.roundedRect(34, 34, PAGE_WIDTH - 68, PAGE_HEIGHT - 68, 24).lineWidth(4).stroke(RED);
      pdf.rect(34, 34, 220, PAGE_HEIGHT - 68).fill(RED);
      pdf.rotate(-90, { origin: [120, PAGE_HEIGHT / 2] });
      pdf.fillColor('#ffffff').font('Helvetica-Bold').fontSize(52).text('FFSJ', -160, PAGE_HEIGHT / 2 - 18, { width: PAGE_HEIGHT, align: 'center' });
      pdf.rotate(90, { origin: [120, PAGE_HEIGHT / 2] });
      pdf.fillColor(INK).font('Helvetica-Bold').fontSize(44).text('Entrada oficial', 300, 92, { width: 600 });
      pdf.fillColor('#626976').font('Helvetica').fontSize(22).text('Presenta este QR en el acceso.', 300, 152, { width: 600 });
      pdf.image(qrBuffer, 548, 118, { width: 340, height: 340 });
      pdf.fillColor(INK).font('Helvetica-Bold').fontSize(38).text(ticket.codigo, 300, 482, { width: 588, align: 'center' });
    }
  }
}
