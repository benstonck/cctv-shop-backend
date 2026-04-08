const express = require('express');
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/settings
router.get('/', authenticateToken, (req, res) => {
  const settings = db.prepare('SELECT * FROM shop_settings LIMIT 1').get();
  res.json({ success: true, settings });
});

// PUT /api/settings
router.put('/', authenticateToken, (req, res) => {
  const { shop_name, address, phone, email, gstin } = req.body;
  const existing = db.prepare('SELECT * FROM shop_settings LIMIT 1').get();

  if (existing) {
    db.prepare(`
      UPDATE shop_settings SET shop_name = ?, address = ?, phone = ?, email = ?, gstin = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(shop_name, address, phone, email, gstin, existing.id);
  } else {
    db.prepare('INSERT INTO shop_settings (shop_name, address, phone, email, gstin) VALUES (?, ?, ?, ?, ?)')
      .run(shop_name, address, phone, email, gstin);
  }

  const updated = db.prepare('SELECT * FROM shop_settings LIMIT 1').get();
  res.json({ success: true, message: 'Settings saved.', settings: updated });
});

module.exports = router;
