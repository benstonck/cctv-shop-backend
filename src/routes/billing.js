const express = require('express');
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Generate invoice number: INV-YYYYMMDD-XXXX
function generateInvoiceNumber() {
  const date = new Date();
  const datePart = date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `INV-${datePart}-${randomPart}`;
}

// GET /api/billing — list all invoices
router.get('/', authenticateToken, (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM invoices';
  let countQuery = 'SELECT COUNT(*) as total FROM invoices';
  const params = [];

  if (search) {
    query += ' WHERE customer_name LIKE ? OR invoice_number LIKE ?';
    countQuery += ' WHERE customer_name LIKE ? OR invoice_number LIKE ?';
    const s = `%${search}%`;
    params.push(s, s);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  const invoices = db.prepare(query).all(...params, parseInt(limit), parseInt(offset));
  const { total } = db.prepare(countQuery).get(...params);

  res.json({ success: true, invoices, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/billing/:id — single invoice with items
router.get('/:id', authenticateToken, (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found.' });

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(req.params.id);
  const settings = db.prepare('SELECT * FROM shop_settings LIMIT 1').get();

  res.json({ success: true, invoice: { ...invoice, items }, shop: settings });
});

// POST /api/billing — create invoice/estimate
router.post('/', authenticateToken, (req, res) => {
  const { customer_name, customer_phone, customer_address, customer_gstin, items, notes, status } = req.body;

  if (!customer_name || !items || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Customer name and at least one product are required.' });
  }

  // Calculate totals
  let subtotal = 0;
  let totalGst = 0;

  const processedItems = items.map(item => {
    const basePrice = parseFloat(item.base_price);
    const quantity = parseInt(item.quantity);
    const gstPct = parseFloat(item.gst_percentage);

    const itemSubtotal = basePrice * quantity;
    const gstAmount = (itemSubtotal * gstPct) / 100;
    const totalPrice = itemSubtotal + gstAmount;

    subtotal += itemSubtotal;
    totalGst += gstAmount;

    return { ...item, base_price: basePrice, quantity, gst_percentage: gstPct, gst_amount: gstAmount, total_price: totalPrice };
  });

  const totalAmount = subtotal + totalGst;

  // Ensure unique invoice number
  let invoiceNumber = generateInvoiceNumber();
  let attempt = 0;
  while (db.prepare('SELECT id FROM invoices WHERE invoice_number = ?').get(invoiceNumber) && attempt < 10) {
    invoiceNumber = generateInvoiceNumber();
    attempt++;
  }

  // Insert invoice
  const invoiceResult = db.prepare(`
    INSERT INTO invoices (invoice_number, customer_name, customer_phone, customer_address, customer_gstin,
      subtotal, total_gst, total_amount, notes, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    invoiceNumber, customer_name, customer_phone || '', customer_address || '',
    customer_gstin || '', subtotal, totalGst, totalAmount, notes || '',
    status || 'estimate', req.user.id
  );

  const invoiceId = invoiceResult.lastInsertRowid;

  // Insert invoice items
  const insertItem = db.prepare(`
    INSERT INTO invoice_items (invoice_id, product_id, product_name, hsn_code, unit, quantity,
      base_price, gst_percentage, gst_amount, total_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  processedItems.forEach(item => {
    insertItem.run(
      invoiceId, item.product_id || null, item.product_name, item.hsn_code || '',
      item.unit || 'pcs', item.quantity, item.base_price, item.gst_percentage,
      item.gst_amount, item.total_price
    );
  });

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  const invoiceItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId);

  res.status(201).json({
    success: true,
    message: 'Invoice created successfully.',
    invoice: { ...invoice, items: invoiceItems },
  });
});

// PUT /api/billing/:id — update invoice status
router.put('/:id', authenticateToken, (req, res) => {
  const { status, notes } = req.body;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found.' });

  db.prepare('UPDATE invoices SET status = ?, notes = ? WHERE id = ?')
    .run(status || invoice.status, notes !== undefined ? notes : invoice.notes, req.params.id);

  const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  res.json({ success: true, message: 'Invoice updated.', invoice: updated });
});

// DELETE /api/billing/:id
router.delete('/:id', authenticateToken, (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found.' });

  db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Invoice deleted successfully.' });
});

// GET /api/billing/stats/summary — dashboard stats
router.get('/stats/summary', authenticateToken, (req, res) => {
  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const totalInvoices = db.prepare('SELECT COUNT(*) as count FROM invoices').get().count;
  const totalRevenue = db.prepare('SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices').get().total;
  const recentInvoices = db.prepare('SELECT * FROM invoices ORDER BY created_at DESC LIMIT 5').all();
  const lowStockProducts = db.prepare('SELECT * FROM products WHERE stock_quantity < 5 ORDER BY stock_quantity ASC LIMIT 5').all();

  res.json({
    success: true,
    stats: { totalProducts, totalInvoices, totalRevenue },
    recentInvoices,
    lowStockProducts,
  });
});

module.exports = router;
