const esp32Adapter = {
  /**
   * Parses JSON strings or binary buffers received from ESP32 clients.
   * Typical ESP32 post body:
   * {
   *   "mac": "24:6F:28:7A:B4:10",
   *   "lat": 15.2993,
   *   "lng": 74.1240,
   *   "alt": 12.5,
   *   "bat": 87,
   *   "spd": 4.5,
   *   "hdg": 182
   * }
   */
  parse(payload) {
    let raw = payload;
    if (typeof payload === 'string') {
      try {
        raw = JSON.parse(payload);
      } catch (e) {
        throw new Error('ESP32 telemetry: Failed to parse JSON string');
      }
    }

    const mac = raw.mac || raw.hardware_id || raw.hardwareId;
    const lat = raw.lat !== undefined ? raw.lat : raw.latitude;
    const lng = raw.lng !== undefined ? raw.lng : raw.longitude;

    if (!mac || lat === undefined || lng === undefined) {
      throw new Error('ESP32 telemetry: Missing mandatory mac/lat/lng parameters');
    }

    const bat = raw.bat !== undefined ? raw.bat : (raw.battery !== undefined ? raw.battery : raw.battery_level);

    return {
      hardwareId: mac,
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      altitude: parseFloat(raw.alt || raw.altitude || 0.0),
      batteryLevel: parseInt(bat !== undefined ? bat : 100),
      speed: parseFloat(raw.spd || raw.speed || 0.0),
      heading: parseFloat(raw.hdg || raw.heading || 0.0),
      status: raw.status || null
    };
  }
};

module.exports = esp32Adapter;
