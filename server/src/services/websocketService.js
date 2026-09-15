/**
 * RAPID — WebSocket Broadcast Service
 *
 * Provides real-time push to connected clients.
 * Replaces HTTP polling for drone telemetry, incidents, and stats.
 */
const WebSocket = require('ws');

let wss = null;

const websocketService = {
  /**
   * Initialise WebSocket server on an existing HTTP server.
   * @param {http.Server} server - The HTTP server to attach to
   */
  init(server) {
    wss = new WebSocket.Server({ server, path: '/ws' });

    wss.on('connection', (ws) => {
      console.log('WebSocket: Client connected. Total clients:', wss.clients.size);

      ws.on('close', () => {
        console.log('WebSocket: Client disconnected. Total clients:', wss.clients.size);
      });

      ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
      });
    });

    console.log('WebSocket Server: Initialised on /ws');
  },

  /**
   * Broadcast a message to all connected clients.
   * @param {string} type - Message type (e.g. 'drone_update', 'incident_created')
   * @param {object} payload - Message payload
   */
  broadcast(type, payload) {
    if (!wss) return;
    const msg = JSON.stringify({ type, payload });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  },

  /**
   * Broadcast a drone telemetry update.
   */
  broadcastDroneUpdate(drone) {
    this.broadcast('drone_update', drone);
  },

  /**
   * Broadcast an incident state change.
   */
  broadcastIncidentUpdate(incident) {
    this.broadcast('incident_update', incident);
  },

  /**
   * Broadcast a new incident creation.
   */
  broadcastIncidentCreated(incident) {
    this.broadcast('incident_created', incident);
  },

  /**
   * Broadcast fleet stats update.
   */
  broadcastStats(stats) {
    this.broadcast('stats_update', stats);
  },

  /**
   * Get current connection count.
   */
  getClientCount() {
    return wss ? wss.clients.size : 0;
  }
};

module.exports = websocketService;
