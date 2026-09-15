const mavlinkAdapter = {
  /**
   * Parses JSON formatted MAVLink dialect packets from PX4/ArduPilot serial proxies or UDP streams.
   * Format references typical MAVLink Dialect:
   * {
   *   "sysid": 10,
   *   "compid": 1,
   *   "msgid": 33, // GLOBAL_POSITION_INT
   *   "payload": {
   *     "lat": 152993000, -- lat in 1e7 degrees
   *     "lon": 741240000, -- lon in 1e7 degrees
   *     "alt": 12500,     -- altitude in mm
   *     "vx": 120,        -- speed in cm/s
   *     "hdg": 18200      -- heading in cdeg
   *   },
   *   "battery_remaining": 88 // From SYS_STATUS msg
   * }
   */
  parse(payload) {
    let raw = payload;
    if (typeof payload === 'string') {
      try {
        raw = JSON.parse(payload);
      } catch (e) {
        throw new Error('MAVLink telemetry: Failed to parse packet');
      }
    }

    const sysid = raw.sysid !== undefined ? raw.sysid : (raw.system_id !== undefined ? raw.system_id : raw.systemId);
    const payloadObj = raw.payload || raw.data;

    if (sysid === undefined || !payloadObj) {
      throw new Error('MAVLink telemetry: Missing sysid or message payload');
    }

    const { lat, lon, lng, alt, vx, vy, hdg, heading, speed } = payloadObj;
    const resolvedLon = lon !== undefined ? lon : lng;
    const resolvedLat = lat !== undefined ? lat : 0;

    return {
      mavlinkSystemId: parseInt(sysid),
      hardwareId: `mavlink-sys-${sysid}`, // fallback hardware correlation ID
      // Handle both standard 1e7 MAVLink units and standard float decimal degrees
      latitude: Math.abs(resolvedLat) > 180 ? resolvedLat / 1e7 : resolvedLat,
      longitude: Math.abs(resolvedLon) > 180 ? resolvedLon / 1e7 : resolvedLon,
      altitude: alt ? (alt > 1000 ? alt / 1000 : alt) : 0.0,
      batteryLevel: raw.battery_remaining !== undefined ? parseInt(raw.battery_remaining) : (raw.battery !== undefined ? parseInt(raw.battery) : 100),
      speed: speed !== undefined ? speed : (vx ? (vx > 100 ? vx / 100 : vx) : 0.0),
      heading: heading !== undefined ? heading : (hdg ? (hdg > 360 ? hdg / 100 : hdg) : 0.0),
      status: raw.status || null
    };
  }
};

module.exports = mavlinkAdapter;
