const db = require('../../config/database');
const esp32Adapter = require('./esp32Adapter');
const mavlinkAdapter = require('./mavlinkAdapter');

const telemetryGateway = {
  /**
   * Main telemetry entry point. Can parse different protocol formats
   * @param {string} sourceType - 'esp32' | 'mavlink' | 'generic'
   * @param {Object} rawPayload - The incoming HTTP body or socket message
   */
  async handleIngest(sourceType, rawPayload) {
    let parsedPacket = null;

    switch (sourceType) {
      case 'esp32':
        parsedPacket = esp32Adapter.parse(rawPayload);
        break;
      case 'mavlink':
        parsedPacket = mavlinkAdapter.parse(rawPayload);
        break;
      case 'generic':
      default:
        parsedPacket = {
          hardwareId: rawPayload.hardware_id,
          latitude: parseFloat(rawPayload.latitude),
          longitude: parseFloat(rawPayload.longitude),
          altitude: parseFloat(rawPayload.altitude || 0),
          batteryLevel: parseInt(rawPayload.battery_level || 100),
          speed: parseFloat(rawPayload.speed || 0),
          heading: parseFloat(rawPayload.heading || 0),
          status: rawPayload.status
        };
        break;
    }

    if (!parsedPacket || !parsedPacket.hardwareId) {
      throw new Error('Invalid telemetry payload: Missing hardware identifiers');
    }

    // Find the drone that matches this hardware ID
    const drones = await db.drones.list();
    const targetDrone = drones.find(
      d => d.hardware_id === parsedPacket.hardwareId || (parsedPacket.mavlinkSystemId && d.mavlink_system_id === parsedPacket.mavlinkSystemId)
    );

    if (!targetDrone) {
      throw new Error(`No drone registered with hardware ID: ${parsedPacket.hardwareId}`);
    }

    console.log(`Ingestion Gateway: Telemetry received for drone ${targetDrone.call_sign} (Source: ${sourceType.toUpperCase()})`);

    // Prepare updates
    const updates = {
      latitude: parsedPacket.latitude,
      longitude: parsedPacket.longitude,
      altitude: parsedPacket.altitude,
      battery_level: parsedPacket.batteryLevel,
      speed: parsedPacket.speed,
      heading: parsedPacket.heading,
      is_hardware_active: true // Lock out simulation ticks for this drone
    };

    if (parsedPacket.status) {
      updates.status = parsedPacket.status;
    }

    // Update database state
    await db.drones.update(targetDrone.id, updates);

    // Save telemetry log
    await db.telemetry.create({
      drone_id: targetDrone.id,
      latitude: parsedPacket.latitude,
      longitude: parsedPacket.longitude,
      altitude: parsedPacket.altitude,
      battery_level: parsedPacket.batteryLevel
    });

    return {
      success: true,
      droneId: targetDrone.id,
      callSign: targetDrone.call_sign,
      coordinates: [parsedPacket.latitude, parsedPacket.longitude]
    };
  }
};

module.exports = telemetryGateway;
