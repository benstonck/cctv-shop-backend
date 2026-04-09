require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./database');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const billingRoutes = require('./routes/billing');
const pdfRoutes = require('./routes/pdf');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT;

// ─── Middleware ───────────────────────────────────────────────────────────────
// app.use(cors({
//   origin: process.env.FRONTEND_URL || 'http://localhost:3000',
//   credentials: true,
// }));

// app.use(
//   cors({
//     origin: [
//       'http://localhost:3000',
//       'https://cctv-shop-fe.vercel.app', // your main domain
//       'https://cctv-shop-33htqhrdv-benston.vercel.app' // preview domain
//     ],
//     credentials: true,
//   })
// );

// ─── Middleware ─────────────────────────────────────────────

// ✅ CORS
app.use(cors());

// ✅ Handle preflight
app.options("*", cors());

// ✅ Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ VERY IMPORTANT (this line missing in your code)
app.options("*", cors());


// Serve uploaded images statically
// app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ✅ Serve uploaded images
const uploadsPath = path.join(process.cwd(), 'uploads');app.use('/uploads', express.static(uploadsPath));
console.log("Uploads path:", uploadsPath);
// ✅ serve static files
app.use('/uploads', express.static(uploadsPath));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'CCTV Shop API is running!', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large. Max size is 5MB.' });
  }
  res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
initializeDatabase();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 CCTV Shop API running on port ${PORT}`);
  console.log(`📦 API Endpoints:`);
  console.log(`   POST   /api/auth/login`);
  console.log(`   GET    /api/products`);
  console.log(`   POST   /api/products`);
  console.log(`   GET    /api/billing`);
  console.log(`   POST   /api/billing`);
  console.log(`   GET    /api/pdf/:invoiceId`);
  console.log(`   GET    /api/settings\n`);
});
