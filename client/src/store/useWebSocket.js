/**
 * RAPID v1.3 — WebSocket Connection Hook
 *
 * Manages WebSocket connection lifecycle. Falls back to HTTP polling
 * when WebSocket is unavailable.
 */
import { useEffect, useRef } from 'react';
import useRapidStore from './rapidStore';

const WS_RECONNECT_DELAY = 3000;
const HTTP_POLL_INTERVAL = 1500;

export default function useWebSocket() {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const pollTimer = useRef(null);
  const tickTimer = useRef(null);
  const fetchData = useRapidStore(s => s.fetchData);
  const fetchGeoConfig = useRapidStore(s => s.fetchGeoConfig);
  const handleWsMessage = useRapidStore(s => s.handleWsMessage);
  const setWsConnected = useRapidStore(s => s.setWsConnected);
  const tick = useRapidStore(s => s.tick);

  useEffect(() => {
    let mounted = true;

    // ── 1-Second Real-Time Ticker ──
    // Drives current clock time, flight duration, and recording duration
    tick();
    tickTimer.current = setInterval(() => {
      if (mounted) tick();
    }, 1000);

    function connect() {
      if (!mounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      // In dev mode (Vite running on any dev port, e.g. 3000, 5173, etc.),
      // target Express on port 5000. In production/direct mode, use current host.
      const isDevServer = window.location.port && window.location.port !== '5000';
      const wsPort = isDevServer ? 5000 : window.location.port;
      const wsUrl = `${protocol}://${window.location.hostname}${wsPort ? ':' + wsPort : ''}/ws`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mounted) return;
          console.log('🔌 RAPID WebSocket: Connected');
          setWsConnected(true);
          // Stop HTTP polling when WS is active
          if (pollTimer.current) {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
          }
        };

        ws.onmessage = (event) => {
          if (!mounted) return;
          try {
            const msg = JSON.parse(event.data);
            handleWsMessage(msg);
          } catch (e) {
            console.warn('WS parse error:', e);
          }
        };

        ws.onclose = () => {
          if (!mounted) return;
          console.log('🔌 RAPID WebSocket: Disconnected — falling back to HTTP polling');
          setWsConnected(false);
          wsRef.current = null;
          startPolling();
          // Attempt reconnect
          reconnectTimer.current = setTimeout(connect, WS_RECONNECT_DELAY);
        };

        ws.onerror = () => {
          // onclose will fire after onerror
          ws.close();
        };
      } catch (e) {
        // WebSocket not available — use HTTP polling
        console.log('🔌 RAPID WebSocket: Not available — using HTTP polling');
        startPolling();
      }
    }

    function startPolling() {
      if (pollTimer.current) return;
      fetchData(); // Initial fetch
      pollTimer.current = setInterval(fetchData, HTTP_POLL_INTERVAL);
    }

    // Start with an initial data fetch, then try WebSocket
    fetchGeoConfig();
    fetchData();
    connect();

    return () => {
      mounted = false;
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (tickTimer.current) clearInterval(tickTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
