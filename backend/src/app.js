import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Import and trigger environment variable validation & DB init
import { validateEnvironment } from './config/env.js';
import { initializeDatabase, getHealthStatus } from './config/db.js';

validateEnvironment();

// Routes imports
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import incidentRoutes from './routes/incident.routes.js';
import reportRoutes, { handleLegacyReportDownload } from './routes/report.routes.js';
import alertRoutes from './routes/alert.routes.js';
import monitoringRoutes from './routes/monitoring.routes.js';
import policeRoutes from './routes/police.routes.js';
import evidenceRoutes from './routes/evidence.routes.js';

// Sockets and Middleware imports
import { setupLiveTracking } from './sockets/liveTracking.js';
import { errorHandler } from './middleware/errorHandler.js';
import { AIService } from './services/aiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const rootEnv = path.resolve(__dirname, '../../.env');
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
}
const backendEnv = path.resolve(__dirname, '../.env');
if (fs.existsSync(backendEnv)) {
  dotenv.config({ path: backendEnv });
}

// ── Dynamic & Explicit CORS Configuration ─────────────────────────────────────
const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5174'
];

const envOrigins = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const allowedOrigins = [...defaultAllowedOrigins, ...envOrigins];

/**
 * Checks whether an incoming origin is permitted.
 * Permits configured domains, localhost, and deployed frontend subdomains.
 */
export const isOriginAllowed = (origin) => {
  if (!origin) return true; // Server-to-server, mobile app webviews, curl
  if (allowedOrigins.includes('*')) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (
      host.endsWith('.vercel.app') ||
      host.endsWith('.onrender.com') ||
      host.endsWith('.netlify.app') ||
      host.endsWith('.pages.dev')
    ) return true;
  } catch (e) {}
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
};

const standardAllowedHeaders = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
  'X-Internal-Secret',
  'Cache-Control',
  'cache-control',
  'Pragma',
  'pragma',
  'Expires',
  'Origin',
  'X-Health-Check'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: standardAllowedHeaders
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, isOriginAllowed(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// Universal CORS headers & Preflight response handler
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    const reqHeaders = req.headers['access-control-request-headers'];
    if (reqHeaders) {
      res.setHeader('Access-Control-Allow-Headers', reqHeaders);
    } else {
      res.setHeader('Access-Control-Allow-Headers', standardAllowedHeaders.join(', '));
    }
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Enable CORS with preflight handling and JSON parsing
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  res.on('finish', () => {
    console.log(`[RESPONSE] ${req.method} ${req.url} -> ${res.statusCode}`);
  });
  next();
});

// Dynamic on-demand report generation for legacy URLs so ephemeral disk wipe never causes 404s
app.get('/uploads/reports/:filename', handleLegacyReportDownload);

// Protect audio evidence files from direct unauthenticated static access (require short-lived signed links)
app.use('/uploads/evidence', (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'Direct access forbidden. Evidence audio must be accessed through short-lived signed links.',
    error: 'Forbidden'
  });
});

// Serve local uploads folder statically for public assets/reports
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Save socket.io instance to context
app.set('io', io);

// Mount routes matching requirements
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', alertRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/police', policeRoutes);
app.use('/api/evidence', evidenceRoutes);

// Root service status endpoint
app.get('/', (req, res) => {
  const { dbMode, dbModeDescription } = getHealthStatus();
  res.status(200).json({
    success: true,
    status: 'ONLINE',
    service: 'ARIA Personal Safety Backend Server',
    version: '2.0.0',
    dbMode,
    dbModeDescription,
    healthEndpoint: '/api/health',
    timestamp: new Date().toISOString()
  });
});

// Base route for health checks
app.get('/health', (req, res) => {
  const { dbMode, dbModeDescription } = getHealthStatus();
  res.status(200).json({
    success: true,
    status: 'ONLINE',
    service: 'ARIA Backend Server',
    dbMode,
    dbModeDescription,
  });
});

app.get('/api/health', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { dbMode, dbModeDescription } = getHealthStatus();
  const ai = await AIService.checkHealth();
  res.status(200).json({ success: true, status: 'ONLINE', service: 'ARIA Backend Server', dbMode, dbModeDescription, ai });
});

app.get('/api/ping', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ success: true, status: 'ONLINE', timestamp: new Date().toISOString() });
});

// Setup socket connection handlers
setupLiveTracking(io);

// Global Error Handler Middleware
app.use(errorHandler);

// Boot sequence: Initialize database first, then start listener
async function boot() {
  await initializeDatabase();
  
  server.listen(PORT, () => {
    const activeUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
    console.log(`\n==========================================`);
    console.log(`🚀 ARIA Backend Server is running live on:`);
    console.log(`   Base URL: ${activeUrl}`);
    console.log(`==========================================\n`);
  });
}

boot();

export default app;
