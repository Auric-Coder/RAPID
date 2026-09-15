const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const incidentRoutes = require('./routes/incidents');
const droneRoutes = require('./routes/drones');
const metricRoutes = require('./routes/metrics');
const demoRoutes = require('./routes/demo');
const missionRoutes = require('./routes/missions');
const fleetRoutes = require('./routes/fleet');
const geoRoutes = require('./routes/geo');
const rlRoutes = require('./routes/rl');
const citizenRoutes = require('./routes/citizen');
const evidenceRoutes = require('./routes/evidence');
const communicationRoutes = require('./routes/communication');
const airspaceRoutes = require('./routes/airspace');
const surveillanceRoutes = require('./routes/surveillance');
const securityRoutes = require('./routes/security');
const agentsRoutes = require('./routes/agents');
const simulatorService = require('./services/simulatorService');
const websocketService = require('./services/websocketService');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable trust proxy for reverse proxy platforms like Render/Cloudflare so express-rate-limit
// and req.ip accurately read the X-Forwarded-For client IP.
app.set('trust proxy', 1);

// CSP allows map tiles (OpenStreetMap/Carto) and inline styling used by Leaflet.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"],
      fontSrc: ["'self'", "https:", "data:"]
    }
  }
}));

// CORS allowlist; override with CORS_ORIGINS (comma-separated) for a non-default deploy.
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : DEFAULT_ALLOWED_ORIGINS;

app.use(cors({
  origin: (origin, callback) => {
    // No Origin header (same-origin, curl, server-to-server) — always allow.
    if (!origin) return callback(null, true);

    // Exact match in configured allowlist
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Allow *.onrender.com subdomains automatically for Render deployments
    if (/^https:\/\/[a-zA-Z0-9-]+\.onrender\.com$/.test(origin)) return callback(null, true);

    // Allow LAN / private network IPs (e.g. 192.168.x.x, 10.x.x.x) for local multi-device testing
    if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    callback(new Error(`CORS: origin "${origin}" is not allowed.`));
  },
  credentials: true
}));

// Parse incoming payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Log requests
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint — stays public (used by uptime checks, not sensitive)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', database: require('./config/database').isSupabase ? 'supabase' : 'in-memory' });
});

// Public routes (each has its own auth story, or — for /api/auth — must
// be reachable while logged out): mounted BEFORE the global auth gate.
app.use('/api/auth', authRoutes);
app.use('/api/v1/citizen', citizenRoutes);

// Everything under /api/* requires a logged-in session.
app.use('/api', requireAuth);

// Bind API route structures
app.use('/api/incidents', incidentRoutes);
app.use('/api/drones', droneRoutes);
app.use('/api/metrics', metricRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/missions', missionRoutes);
app.use('/api/fleet', fleetRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/rl', rlRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/communication', communicationRoutes);
app.use('/api/airspace', airspaceRoutes);
app.use('/api/surveillance', surveillanceRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/agents', agentsRoutes);

// Serves the built client from the same Express process in production.
// Skipped in local dev (no dist/ exists; Vite dev server + proxy handles the client).
const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  // Anything not under /api falls through to the SPA shell.
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Generic error handler — prevents Express's dev handler from returning
// stack traces to the client. Must be registered last.
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Cross-origin request blocked.' });
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error.' });
});

// Start telemetry background simulation
simulatorService.start();

// Spin up HTTP Server listener (shared with the WebSocket upgrade handler)
const server = http.createServer(app);
websocketService.init(server);

server.listen(PORT, () => {
  console.log(`RAPID Command Server listening on port ${PORT}.`);
});

process.on('SIGINT', () => {
  console.log('Shutdown signal received.');
  simulatorService.stop();
  server.close(() => {
    console.log('Server stopped. Clean exit.');
    process.exit(0);
  });
});
