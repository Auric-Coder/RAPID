const db = require('../../config/database');

const videoStreamer = {
  /**
   * Mounts a camera livestream URL to a registered drone callsign/ID
   */
  async mountStream(droneId, streamUrl) {
    const drone = await db.drones.get(droneId);
    if (!drone) {
      throw new Error(`Drone ${droneId} not found`);
    }

    console.log(`Video Ingest: Mounted livestream URL on ${drone.call_sign}: ${streamUrl}`);
    
    return await db.drones.update(droneId, {
      stream_url: streamUrl
    });
  },

  /**
   * Placeholder interface for WebRTC signaling (ICE candidates, SDP offers)
   * used when establishing low-latency streams from live drone cameras.
   */
  handleSignaling(droneId, sdpOffer) {
    console.log(`WebRTC Signaling: Received SDP Offer for drone ${droneId}`);
    
    // Future WebRTC server integrations (e.g. Kurento, Janus, or Mediasoup)
    // would parse this offer, spin up a channel, and return an SDP answer.
    return {
      sdpAnswer: "v=0\no=- 0 0 IN IP4 127.0.0.1\ns=RAPID-WebRTC-Session...",
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
      ]
    };
  }
};

module.exports = videoStreamer;
