const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const isValid = allowedTypes.test(file.mimetype) && allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (isValid) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and WebP images are allowed.'));
  },
});

// GET /api/products — list all products (with optional search)
router.get('/', authenticateToken, (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM products';
  let countQuery = 'SELECT COUNT(*) as total FROM products';
  const params = [];

  if (search) {
    query += ' WHERE name LIKE ? OR description LIKE ? OR hsn_code LIKE ?';
    countQuery += ' WHERE name LIKE ? OR description LIKE ? OR hsn_code LIKE ?';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  const products = db.prepare(query).all(...params, parseInt(limit), parseInt(offset));
  const { total } = db.prepare(countQuery).get(...params);

  // Add full image URL
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const productsWithUrl = products.map(p => ({
    ...p,
    image_url: p.image_url ? `${baseUrl}/uploads/${p.image_url}` : null,
  }));

  res.json({ success: true, products: productsWithUrl, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/products/:id
router.get('/:id', authenticateToken, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.json({
    success: true,
    product: {
      ...product,
      image_url: product.image_url ? `${baseUrl}/uploads/${product.image_url}` : null,
    },
  });
});

// POST /api/products — create product
router.post('/', authenticateToken, upload.single('image'), (req, res) => {
  const { name, description, base_price, gst_percentage, hsn_code, unit, stock_quantity } = req.body;

  if (!name || !base_price) {
    return res.status(400).json({ success: false, message: 'Product name and base price are required.' });
  }

  // const imageFilename = req.file ? req.file.filename : null;
  const image = req.file ? req.file.filename : null;

  const result = db.prepare(`
    INSERT INTO products (name, description, image, base_price, gst_percentage, hsn_code, unit, stock_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    description || '',
    image,
    parseFloat(base_price),
    parseFloat(gst_percentage) || 18,
    hsn_code || '',
    unit || 'pcs',
    parseInt(stock_quantity) || 0
  );

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  // ✅ Convert filename → full URL only in response
  const productWithImage = {
    ...product,
    image: product.image
      ? `${baseUrl}/uploads/${product.image}`
      : null,
  };

  res.status(201).json({
    success: true,
    message: 'Product created successfully.',
    product: productWithImage,
  });
});

// PUT /api/products/:id — update product
router.put('/:id', authenticateToken, upload.single('image'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

  const { name, description, base_price, gst_percentage, hsn_code, unit, stock_quantity } = req.body;

  // If new image uploaded, delete old one
  let imageFilename = product.image_url;
  if (req.file) {
    if (product.image_url) {
      const oldPath = path.join(__dirname, '../../uploads', product.image_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    imageFilename = req.file.filename;
  }

  db.prepare(`
    UPDATE products
    SET name = ?, description = ?, image_url = ?, base_price = ?, gst_percentage = ?,
        hsn_code = ?, unit = ?, stock_quantity = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name || product.name,
    description !== undefined ? description : product.description,
    imageFilename,
    base_price ? parseFloat(base_price) : product.base_price,
    gst_percentage ? parseFloat(gst_percentage) : product.gst_percentage,
    hsn_code !== undefined ? hsn_code : product.hsn_code,
    unit || product.unit,
    stock_quantity !== undefined ? parseInt(stock_quantity) : product.stock_quantity,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  res.json({
    success: true,
    message: 'Product updated successfully.',
    product: {
      ...updated,
      image_url: updated.image_url ? `${baseUrl}/uploads/${updated.image_url}` : null,
    },
  });
});

// DELETE /api/products/:id
router.delete('/:id', authenticateToken, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

  // Delete product image
  if (product.image_url) {
    const imgPath = path.join(__dirname, '../../uploads', product.image_url);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Product deleted successfully.' });
});

module.exports = router;
