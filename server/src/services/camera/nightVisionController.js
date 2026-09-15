/**
 * RAPID Camera — Night Vision Controller
 *
 * Server-side source of truth for whether night vision should be
 * active right now. The client already computed this identically
 * (Dashboard's old isNightVisionActive()) purely for its own cosmetic
 * filter — this formalizes the same rule as a service so evidence
 * records (snapshots) can be tagged with the mode that was actually
 * active at capture time, not just whatever the viewing client
 * happened to show.
 */
const NIGHT_START_HOUR = 19;
const NIGHT_END_HOUR = 6;

function isNightByClock(date = new Date()) {
  const hour = date.getHours();
  return hour < NIGHT_END_HOUR || hour >= NIGHT_START_HOUR;
}

/**
 * @param {string} cameraMode - 'auto' | 'day' | 'night'
 * @param {Date} [date]
 * @returns {boolean}
 */
function isNightVisionActive(cameraMode, date = new Date()) {
  if (cameraMode === 'night') return true;
  if (cameraMode === 'day') return false;
  return isNightByClock(date);
}

module.exports = { isNightVisionActive, isNightByClock };
