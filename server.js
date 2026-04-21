require('dotenv').config();
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const connectDB    = require('./backend/config/db');

// Routes
const authRoutes       = require('./backend/routes/auth');
const groupRoutes      = require('./backend/routes/groups');
const expenseRoutes    = require('./backend/routes/expenses');
const settlementRoutes = require('./backend/routes/settlements');
const userRoutes       = require('./backend/routes/users');

const app = express();

// ── Security headers ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'"],
      scriptSrcAttr:  ["'unsafe-inline'"],
      styleSrc:       ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
      fontSrc:        ["'self'", 'fonts.gstatic.com'],
      imgSrc:         ["'self'", 'data:'],
      connectSrc:     ["'self'"],
    },
  },
}));

// ── CORS ──────────────────────────────────────────────────
// Allow the configured CLIENT_URL or any origin in development
const allowedOrigins = process.env.CLIENT_URL
  ? [process.env.CLIENT_URL]
  : ['http://localhost:5000', 'http://127.0.0.1:5000'];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return cb(null, true);
    }
    cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
}));

app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many auth attempts. Try again in 15 minutes.' },
}));

// ── Body & cookie parsing ─────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ── Request logging ───────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ── API routes ────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/groups',       groupRoutes);
app.use('/api/expenses',     expenseRoutes);
app.use('/api/settlements',  settlementRoutes);
app.use('/api/users',        userRoutes);

// ── Health check ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV, ts: new Date().toISOString() });
});

// ── Serve frontend ────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'frontend'), {
  etag:         process.env.NODE_ENV === 'production',
  lastModified: process.env.NODE_ENV === 'production',
  setHeaders(res) {
    if (process.env.NODE_ENV !== 'production') {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ── Global error handler ──────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err.message);
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message,
  });
});

// ── Process-level safety nets ─────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
  process.exit(1);
});

// ── Boot ──────────────────────────────────────────────────
(async () => {
  await connectDB();
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`\n🚀  SplitEase  →  http://localhost:${PORT}`);
    console.log(`    Env        :  ${process.env.NODE_ENV || 'development'}`);
    console.log(`    DB         :  MongoDB Atlas connected\n`);
  });
})();
