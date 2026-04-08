const express = require('express');
const PDFDocument = require('pdfkit');
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/pdf/:invoiceId — generate PDF for invoice
router.get('/:invoiceId', authenticateToken, (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.invoiceId);
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found.' });

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(req.params.invoiceId);
  const shop = db.prepare('SELECT * FROM shop_settings LIMIT 1').get();

  // Create PDF document
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
  doc.pipe(res);

  // ─── COLORS & FONTS ──────────────────────────────────────────────────────────
  const primaryColor = '#1e3a5f';
  const accentColor = '#2563eb';
  const lightGray = '#f8f9fa';
  const darkGray = '#374151';
  const borderColor = '#e5e7eb';

  // ─── HEADER ──────────────────────────────────────────────────────────────────
  doc.rect(0, 0, 595, 120).fill(primaryColor);

  doc.fontSize(26).fillColor('#ffffff').font('Helvetica-Bold')
    .text(shop?.shop_name || 'CCTV Shop', 50, 30, { align: 'left' });

  doc.fontSize(9).fillColor('#93c5fd').font('Helvetica')
    .text(shop?.address || '', 50, 62)
    .text(`Phone: ${shop?.phone || ''}   |   Email: ${shop?.email || ''}`, 50, 75);

  if (shop?.gstin) {
    doc.text(`GSTIN: ${shop.gstin}`, 50, 88);
  }

  // Invoice title on right side
  doc.fontSize(22).fillColor('#ffffff').font('Helvetica-Bold')
    .text(invoice.status === 'invoice' ? 'TAX INVOICE' : 'ESTIMATE', 350, 35, { align: 'right', width: 195 });

  doc.fontSize(10).fillColor('#93c5fd').font('Helvetica')
    .text(`#${invoice.invoice_number}`, 350, 65, { align: 'right', width: 195 });

  const invoiceDate = new Date(invoice.created_at).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
  doc.text(`Date: ${invoiceDate}`, 350, 80, { align: 'right', width: 195 });

  // ─── CUSTOMER & INVOICE INFO ──────────────────────────────────────────────────
  doc.rect(50, 135, 240, 100).fillAndStroke(lightGray, borderColor);
  doc.rect(310, 135, 235, 100).fillAndStroke(lightGray, borderColor);

  doc.fontSize(10).fillColor(primaryColor).font('Helvetica-Bold')
    .text('BILL TO:', 60, 145);
  doc.fontSize(11).fillColor(darkGray).font('Helvetica-Bold')
    .text(invoice.customer_name, 60, 160);
  doc.fontSize(9).fillColor(darkGray).font('Helvetica');
  if (invoice.customer_phone) doc.text(`Phone: ${invoice.customer_phone}`, 60, 178);
  if (invoice.customer_address) doc.text(invoice.customer_address, 60, 191, { width: 220 });
  if (invoice.customer_gstin) doc.text(`GSTIN: ${invoice.customer_gstin}`, 60, 214);

  doc.fontSize(10).fillColor(primaryColor).font('Helvetica-Bold')
    .text('INVOICE DETAILS:', 320, 145);
  doc.fontSize(9).fillColor(darkGray).font('Helvetica')
    .text(`Invoice No: ${invoice.invoice_number}`, 320, 162)
    .text(`Date: ${invoiceDate}`, 320, 176)
    .text(`Status: ${invoice.status.toUpperCase()}`, 320, 190);

  // ─── ITEMS TABLE ─────────────────────────────────────────────────────────────
  const tableTop = 255;
  const colWidths = [180, 40, 55, 65, 55, 50, 70];
  const colHeaders = ['Product Name', 'HSN', 'Unit', 'Rate (₹)', 'Qty', 'GST%', 'Total (₹)'];
  const colX = [50, 230, 270, 315, 380, 430, 480];

  // Table header
  doc.rect(50, tableTop, 495, 24).fill(accentColor);
  colHeaders.forEach((header, i) => {
    doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold')
      .text(header, colX[i], tableTop + 7, { width: colWidths[i] - 5, align: i >= 3 ? 'right' : 'left' });
  });

  // Table rows
  let y = tableTop + 24;
  items.forEach((item, index) => {
    const rowHeight = 22;
    const bgColor = index % 2 === 0 ? '#ffffff' : lightGray;
    doc.rect(50, y, 495, rowHeight).fill(bgColor);

    doc.fontSize(8.5).fillColor(darkGray).font('Helvetica')
      .text(item.product_name, colX[0], y + 6, { width: colWidths[0] - 5 })
      .text(item.hsn_code || '-', colX[1], y + 6, { width: colWidths[1] - 5, align: 'left' })
      .text(item.unit || 'pcs', colX[2], y + 6, { width: colWidths[2] - 5 })
      .text(`₹${item.base_price.toFixed(2)}`, colX[3], y + 6, { width: colWidths[3] - 5, align: 'right' })
      .text(item.quantity.toString(), colX[4], y + 6, { width: colWidths[4] - 5, align: 'right' })
      .text(`${item.gst_percentage}%`, colX[5], y + 6, { width: colWidths[5] - 5, align: 'right' })
      .text(`₹${item.total_price.toFixed(2)}`, colX[6], y + 6, { width: colWidths[6] - 5, align: 'right' });

    y += rowHeight;
  });

  // Table border
  doc.rect(50, tableTop, 495, y - tableTop).stroke(borderColor);

  // ─── TOTALS ───────────────────────────────────────────────────────────────────
  y += 10;
  const totalsX = 360;
  const totalsWidth = 185;

  const addTotalRow = (label, value, bold = false, highlight = false) => {
    if (highlight) {
      doc.rect(totalsX - 5, y - 3, totalsWidth + 10, 22).fill(primaryColor);
    }
    doc.fontSize(bold ? 11 : 9.5)
      .fillColor(highlight ? '#ffffff' : darkGray)
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .text(label, totalsX, y, { width: 110 })
      .text(value, totalsX + 110, y, { width: 75, align: 'right' });
    y += 20;
  };

  doc.rect(totalsX - 5, y - 3, totalsWidth + 10, 62).stroke(borderColor);
  addTotalRow('Subtotal:', `₹${invoice.subtotal.toFixed(2)}`);
  addTotalRow('GST Amount:', `₹${invoice.total_gst.toFixed(2)}`);
  y += 2;
  doc.moveTo(totalsX - 5, y - 5).lineTo(totalsX + totalsWidth + 5, y - 5).stroke(borderColor);
  y += 2;
  addTotalRow('TOTAL:', `₹${invoice.total_amount.toFixed(2)}`, true, true);

  // ─── AMOUNT IN WORDS ──────────────────────────────────────────────────────────
  y += 15;
  doc.rect(50, y, 495, 30).fillAndStroke(lightGray, borderColor);
  doc.fontSize(9).fillColor(primaryColor).font('Helvetica-Bold')
    .text(`Amount in Words: `, 60, y + 10, { continued: true })
    .font('Helvetica').fillColor(darkGray)
    .text(numberToWords(Math.round(invoice.total_amount)) + ' Rupees Only');

  // ─── NOTES & FOOTER ──────────────────────────────────────────────────────────
  y += 50;
  if (invoice.notes) {
    doc.fontSize(9).fillColor(primaryColor).font('Helvetica-Bold').text('Notes:', 50, y);
    doc.fontSize(9).fillColor(darkGray).font('Helvetica').text(invoice.notes, 50, y + 14, { width: 300 });
    y += 40;
  }

  doc.fontSize(9).fillColor(darkGray).font('Helvetica')
    .text('Terms: Goods once sold will not be taken back. E. & O.E.', 50, y);

  // Signature
  doc.rect(400, y - 10, 145, 55).stroke(borderColor);
  doc.fontSize(9).fillColor(darkGray).font('Helvetica')
    .text('Authorized Signature', 405, y + 30, { width: 135, align: 'center' });

  // Bottom line
  doc.rect(0, 785, 595, 12).fill(accentColor);
  doc.fontSize(7.5).fillColor('#ffffff').font('Helvetica')
    .text('Thank you for your business! | Computer Generated Invoice', 0, 788, { align: 'center', width: 595 });

  doc.end();
});

// ─── HELPER: Number to Words ──────────────────────────────────────────────────
function numberToWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (num === 0) return 'Zero';
  if (num < 20) return ones[num];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + ones[num % 10] : '');
  if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' ' + numberToWords(num % 100) : '');
  if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 !== 0 ? ' ' + numberToWords(num % 1000) : '');
  if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 !== 0 ? ' ' + numberToWords(num % 100000) : '');
  return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 !== 0 ? ' ' + numberToWords(num % 10000000) : '');
}

module.exports = router;
