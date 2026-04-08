const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './cctv_shop.db';
const db = new Database(path.resolve(DB_PATH));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Products table
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      base_price REAL NOT NULL,
      gst_percentage REAL NOT NULL DEFAULT 18,
      hsn_code TEXT,
      unit TEXT DEFAULT 'pcs',
      stock_quantity INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Invoices table
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      customer_address TEXT,
      customer_gstin TEXT,
      subtotal REAL NOT NULL,
      total_gst REAL NOT NULL,
      total_amount REAL NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'estimate',
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Invoice Items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      hsn_code TEXT,
      unit TEXT,
      quantity INTEGER NOT NULL,
      base_price REAL NOT NULL,
      gst_percentage REAL NOT NULL,
      gst_amount REAL NOT NULL,
      total_price REAL NOT NULL
    )
  `);

  // Shop Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS shop_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      gstin TEXT,
      logo_url TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default admin user if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (name, email, password, role)
      VALUES (?, ?, ?, ?)
    `).run('Admin', 'admin@cctvshop.com', hashedPassword, 'admin');
    console.log('✅ Default admin user created: admin@cctvshop.com / admin123');
  }

  // Seed default shop settings
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM shop_settings').get();
  if (settingsCount.count === 0) {
    db.prepare(`
      INSERT INTO shop_settings (shop_name, address, phone, email, gstin)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      process.env.SHOP_NAME || 'My CCTV Shop',
      process.env.SHOP_ADDRESS || '123 Main Street, City - 600001',
      process.env.SHOP_PHONE || '+91 98765 43210',
      process.env.SHOP_EMAIL || 'shop@cctvshop.com',
      process.env.SHOP_GSTIN || '29AABCU9603R1ZX'
    );
  }

  // Seed sample products
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (productCount.count === 0) {
    const sampleProducts = [
      { name: 'Hikvision 2MP Dome Camera', description: 'Full HD 1080p indoor dome camera with IR night vision', base_price: 1800, gst_percentage: 18, hsn_code: '85258090', unit: 'pcs', stock_quantity: 25 },
      { name: 'CP Plus 2MP Bullet Camera', description: 'Outdoor bullet camera, IP67 weatherproof, 30m IR range', base_price: 1600, gst_percentage: 18, hsn_code: '85258090', unit: 'pcs', stock_quantity: 30 },
      { name: '4 Channel DVR Recorder', description: 'Hikvision 4CH DVR, H.265+, supports 1TB HDD', base_price: 3500, gst_percentage: 18, hsn_code: '84717090', unit: 'pcs', stock_quantity: 15 },
      { name: '8 Channel DVR Recorder', description: 'CP Plus 8CH Turbo DVR, 5MP Lite recording', base_price: 5200, gst_percentage: 18, hsn_code: '84717090', unit: 'pcs', stock_quantity: 10 },
      { name: '3+1 CCTV Cable (90m)', description: '3+1 copper CCTV coaxial cable roll with power wire', base_price: 1200, gst_percentage: 18, hsn_code: '85444290', unit: 'roll', stock_quantity: 50 },
      { name: 'SMPS 12V 5A Power Supply', description: 'Switching power supply for CCTV cameras', base_price: 350, gst_percentage: 18, hsn_code: '85044090', unit: 'pcs', stock_quantity: 40 },
      { name: '1TB Surveillance Hard Disk', description: 'Seagate SkyHawk 1TB HDD, optimized for CCTV', base_price: 4200, gst_percentage: 18, hsn_code: '84717031', unit: 'pcs', stock_quantity: 20 },
      { name: 'BNC Connector (Pack of 10)', description: 'BNC male connector for coaxial cable', base_price: 80, gst_percentage: 18, hsn_code: '85369090', unit: 'pack', stock_quantity: 100 },
    ];
    const insertProduct = db.prepare(`
      INSERT INTO products (name, description, base_price, gst_percentage, hsn_code, unit, stock_quantity)
      VALUES (@name, @description, @base_price, @gst_percentage, @hsn_code, @unit, @stock_quantity)
    `);
    sampleProducts.forEach(p => insertProduct.run(p));
    console.log('✅ Sample products seeded');
  }

  console.log('✅ Database initialized successfully');
}

module.exports = { db, initializeDatabase };
