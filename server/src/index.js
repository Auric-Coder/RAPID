const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
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
const simulatorService = require('./services/simulatorService');
const websocketService = require('./services/websocketService');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable trust proxy for reverse proxy platforms like Render/Cloudflare so express-rate-limit
// and req.ip accurately read the X-Forwarded-For client IP.
app.set('trust proxy', 1);

// Phase 8: standard HTTP security headers. When serving the built frontend
// bundle in production, configure CSP to allow map tiles (OpenStreetMap/Carto)
// and inline styling used by Tailwind/Leaflet.
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

// Step 15 (performance): no compression existed anywhere in this server -
// covers both JSON API responses and the static client/dist bundle served
// below (including Step 11's code-split JS chunks). Every browser sends
// `Accept-Encoding: gzip, br` and decompresses transparently, so this is
// zero-risk on the client side; nothing here needs a client change.
// Default threshold (1024 bytes) is kept as-is: several of this API's
// responses are just a few bytes (e.g. an empty array), and compressing
// those would add gzip overhead for no benefit - the default correctly
// skips them.
app.use(compression());

// Enable CORS for the frontend. Phase 8 tightens this to an explicit allowlist;
// override with CORS_ORIGINS (comma-separated) for a non-default deploy.
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

// Phase 6: everything else under /api/* now requires a logged-in
// session (audit finding C2 — "zero access control" — addressed here).
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

// Cloud deployment: serve the built client from this same Express service
// when a production build is present (client/dist — built by `npm run
// build` in client/). Keeps client + API on one origin in production, so
// the Phase 6 httpOnly session cookie stays same-origin with zero auth
// code changes — no CORS/SameSite=None complexity from splitting them
// across two domains. Local dev is unaffected: no dist/ exists, so this
// block is skipped and Vite's dev server + proxy handles the client.
const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  // Anything not under /api falls through to the SPA shell so client-side
  // routing (React Router) handles it.
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Phase 8: generic error handler — without this, Express's default
// dev-mode handler returns a full stack trace (absolute file paths,
// framework internals) to the client on any unhandled error, which is
// exactly what this hardening phase exists to stop. Discovered via the
// CORS rejection above, which threw before any route body ran; applies
// to any other unhandled error the same way. Must be registered last —
// Express only routes to a 4-arg handler placed after everything else.
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
  console.log(`🚀 RAPID Command Server listening on port ${PORT}...`);
});

// Graceful shut down hook to clear loops
process.on('SIGINT', () => {
  console.log('\n🛑 Shutdown signal received.');
  simulatorService.stop();
  server.close(() => {
    console.log('💤 Server connection terminated. Clean exit.');
    process.exit(0);
  });
});
