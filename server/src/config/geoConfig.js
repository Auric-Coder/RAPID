/**
 * RAPID — Centralized Geographic Configuration
 *
 * v1.3 Phase 1: Restructured into a hierarchical seed source —
 * Nation -> State -> District -> Base — consumed by database.js
 * to build the nations/states/districts/bases collections, and by
 * routes/geo.js to serve them to the client (which no longer keeps
 * its own duplicate copy of this data).
 *
 * latitude  = north/south component (positive = north of equator)
 * longitude = east/west component  (positive = east of prime meridian)
 */

// ============================================================
// OPERATING AREAS
// One entry per state currently in service. Adding a new state
// (or district/base within one) is purely additive here — nothing
// else needs to hardcode new geography.
// ============================================================
const OPERATING_AREAS = [
  {
    stateCode: 'GA',
    stateName: 'Goa',
    bounds: { north: 15.812, south: 14.893, east: 74.345, west: 73.680 },
    mapCenter: { latitude: 15.3995, longitude: 73.8800 },
    mapZoom: 11,
    districts: [
      {
        name: 'North Goa',
        headquarters: { latitude: 15.4909, longitude: 73.8278 },
        bases: [
          { baseCode: 'GA-NG-PNJ', name: 'Panaji RAPID Station 1', callSign: 'Rakshak-01', latitude: 15.4909, longitude: 73.8278, coverage: 2500 },
          { baseCode: 'GA-NG-MPS', name: 'Mapusa RAPID Station 4', callSign: 'Rakshak-04', latitude: 15.5907, longitude: 73.8122, coverage: 2500 },
          { baseCode: 'GA-NG-PND', name: 'Ponda RAPID Station 5',  callSign: 'Rakshak-05', latitude: 15.4018, longitude: 74.0124, coverage: 2500 }
        ]
      },
      {
        name: 'South Goa',
        headquarters: { latitude: 15.2736, longitude: 73.9582 },
        bases: [
          { baseCode: 'GA-SG-MRG', name: 'Margao RAPID Station 2', callSign: 'Rakshak-02', latitude: 15.2736, longitude: 73.9582, coverage: 2500 },
          { baseCode: 'GA-SG-VSC', name: 'Vasco RAPID Station 3',  callSign: 'Rakshak-03', latitude: 15.3995, longitude: 73.8118, coverage: 2500 }
        ]
      }
    ],
    // Reference-only markers (not drone bases) — Goa legacy overlay
    policeStations: [
      { name: 'Panaji Police Division HQ',         latitude: 15.4920, longitude: 73.8260 },
      { name: 'Margao Police Station',              latitude: 15.2750, longitude: 73.9550 },
      { name: 'Vasco Harbour Police Station',       latitude: 15.3980, longitude: 73.8120 },
      { name: 'Mapusa Town Police Command',         latitude: 15.5930, longitude: 73.8140 },
      { name: 'Ponda Sub-District Police Station',  latitude: 15.4020, longitude: 74.0150 }
    ],
    noFlyZones: [
      {
        name: 'Dabolim Airport Restricted Airspace',
        type: 'airport_protection',
        restrictionLevel: 'absolute',
        polygon: [
          { latitude: 15.3850, longitude: 73.8250 },
          { latitude: 15.3920, longitude: 73.8450 },
          { latitude: 15.3720, longitude: 73.8550 },
          { latitude: 15.3620, longitude: 73.8320 }
        ]
      },
      {
        name: 'Raj Bhavan High Security Zone',
        type: 'restricted',
        restrictionLevel: 'absolute',
        polygon: [
          { latitude: 15.4550, longitude: 73.7900 },
          { latitude: 15.4650, longitude: 73.8050 },
          { latitude: 15.4450, longitude: 73.8150 },
          { latitude: 15.4350, longitude: 73.7950 }
        ]
      }
    ],
    // Fictional demo protected zones for surveillance/patrol missions
    // (Phase 5) — not tied to any real specific facility, just a real
    // area within Goa's operating bounds to patrol against.
    surveillanceZones: [
      {
        name: 'Demo Patrol Zone — Goa Coastal Belt',
        type: 'protected_area',
        restrictionLevel: 'advisory',
        polygon: [
          { latitude: 15.5700, longitude: 73.7300 },
          { latitude: 15.6000, longitude: 73.7300 },
          { latitude: 15.6000, longitude: 73.7700 },
          { latitude: 15.5700, longitude: 73.7700 }
        ]
      }
    ],
    // Curated real-ish Goa locations for random incident generation.
    demoLocations: [
      { name: 'Calangute Beach Area',        latitude: 15.5441, longitude: 73.7523 },
      { name: 'Baga Beach Road',             latitude: 15.5566, longitude: 73.7512 },
      { name: 'Anjuna Flea Market Area',     latitude: 15.5726, longitude: 73.7405 },
      { name: 'Panaji City Centre',          latitude: 15.4989, longitude: 73.8278 },
      { name: 'Panaji Patto Colony',         latitude: 15.4922, longitude: 73.8386 },
      { name: 'Margao Market Square',        latitude: 15.2764, longitude: 73.9577 },
      { name: 'Colva Beach Road',            latitude: 15.2794, longitude: 73.9133 },
      { name: 'Vasco Da Gama Railway Area',  latitude: 15.3997, longitude: 73.8147 },
      { name: 'Mapusa Friday Market',        latitude: 15.5961, longitude: 73.8131 },
      { name: 'Ponda Bus Stand Area',        latitude: 15.4037, longitude: 74.0059 },
      { name: 'Old Goa Heritage Zone',       latitude: 15.5007, longitude: 73.9118 },
      { name: 'Candolim Tourist Area',       latitude: 15.5186, longitude: 73.7625 },
      { name: 'Morjim Beach North',          latitude: 15.6378, longitude: 73.7341 },
      { name: 'Vagator Cliff Road',          latitude: 15.5994, longitude: 73.7432 },
      { name: 'Curchorem Town Centre',       latitude: 15.1709, longitude: 74.1076 },
      { name: 'Quepem Main Road',            latitude: 15.2123, longitude: 74.0763 },
      { name: 'Bicholim Market',             latitude: 15.5999, longitude: 73.9555 },
      { name: 'Pernem Town Square',          latitude: 15.7191, longitude: 73.7960 },
      { name: 'Sanguem Rural Area',          latitude: 15.2293, longitude: 74.1521 },
      { name: 'Arambol Beach Road',          latitude: 15.6839, longitude: 73.7108 }
    ]
  },
  {
    stateCode: 'PB',
    stateName: 'Punjab',
    bounds: { north: 31.42, south: 31.15, east: 75.85, west: 75.30 },
    mapCenter: { latitude: 31.2900, longitude: 75.6500 },
    mapZoom: 11,
    // Real Punjab Police stations. Coordinates are locality-level
    // approximations (same precision standard as the Goa demo data
    // above), anchored to verified city/landmark coordinates — not
    // rooftop-accurate, but correctly placed within each locality.
    districts: [
      {
        name: 'Jalandhar',
        headquarters: { latitude: 31.3260, longitude: 75.5762 },
        bases: [
          { baseCode: 'PB-JL-D01', name: 'Div. No. 1 Police Station (Industrial Area)', callSign: 'Rakshak-PB-01', latitude: 31.3476, longitude: 75.5715, coverage: 2500 },
          { baseCode: 'PB-JL-D02', name: 'Div. No. 2 Police Station (Patel Chowk)',      callSign: 'Rakshak-PB-02', latitude: 31.3220, longitude: 75.5680, coverage: 2500 },
          { baseCode: 'PB-JL-D03', name: 'Div. No. 3 Police Station (Bajwa Colony)',     callSign: 'Rakshak-PB-03', latitude: 31.3180, longitude: 75.5620, coverage: 2500 },
          { baseCode: 'PB-JL-D04', name: 'Div. No. 4 Police Station (Quilla Mohalla)',   callSign: 'Rakshak-PB-04', latitude: 31.3230, longitude: 75.5790, coverage: 2500 },
          { baseCode: 'PB-JL-D05', name: 'Div. No. 5 Police Station (Basti Sheikh)',     callSign: 'Rakshak-PB-05', latitude: 31.3300, longitude: 75.6050, coverage: 2500 },
          { baseCode: 'PB-JL-D06', name: 'Div. No. 6 Police Station (Model Town)',       callSign: 'Rakshak-PB-06', latitude: 31.3160, longitude: 75.5670, coverage: 2500 },
          { baseCode: 'PB-JL-D07', name: 'Div. No. 7 Police Station (Urban Estate)',     callSign: 'Rakshak-PB-07', latitude: 31.3050, longitude: 75.5670, coverage: 2500 },
          { baseCode: 'PB-JL-D08', name: 'Div. No. 8 Police Station (Bulandpur Road)',   callSign: 'Rakshak-PB-08', latitude: 31.2950, longitude: 75.5850, coverage: 2500 },
          { baseCode: 'PB-JL-NBD', name: 'Navi Baradari Police Station',                 callSign: 'Rakshak-PB-09', latitude: 31.3280, longitude: 75.5830, coverage: 2500 },
          { baseCode: 'PB-JL-RMD', name: 'Rama Mandi Police Station',                    callSign: 'Rakshak-PB-10', latitude: 31.3550, longitude: 75.5670, coverage: 2500 },
          { baseCode: 'PB-JL-BGC', name: 'Bhargo Camp Police Station',                   callSign: 'Rakshak-PB-11', latitude: 31.3300, longitude: 75.5920, coverage: 2500 },
          { baseCode: 'PB-JL-BBK', name: 'Basti Bawa Khel Police Station',               callSign: 'Rakshak-PB-12', latitude: 31.3260, longitude: 75.5580, coverage: 2500 },
          { baseCode: 'PB-JL-CNT', name: 'Jalandhar Cantt Police Station',               callSign: 'Rakshak-PB-13', latitude: 31.2980, longitude: 75.6150, coverage: 2500 },
          { baseCode: 'PB-JL-SDR', name: 'Sadar Police Station Jalandhar',               callSign: 'Rakshak-PB-14', latitude: 31.3050, longitude: 75.6100, coverage: 2500 }
        ]
      },
      {
        // Phagwara is administratively a sub-division of Kapurthala district.
        name: 'Kapurthala',
        headquarters: { latitude: 31.3800, longitude: 75.3800 },
        bases: [
          { baseCode: 'PB-KP-PHC', name: 'City Phagwara Police Station',  callSign: 'Rakshak-PB-15', latitude: 31.2200, longitude: 75.7700, coverage: 2500 },
          { baseCode: 'PB-KP-PHS', name: 'Sadar Phagwara Police Station', callSign: 'Rakshak-PB-16', latitude: 31.2280, longitude: 75.7830, coverage: 2500 },
          { baseCode: 'PB-KP-STN', name: 'Satnampura Police Station',     callSign: 'Rakshak-PB-17', latitude: 31.2150, longitude: 75.7600, coverage: 2500 }
        ]
      }
    ],
    policeStations: [],
    noFlyZones: [],
    // Fictional demo protected zone — a real area within the Punjab
    // operating bounds, not tied to any specific real facility or
    // border installation.
    surveillanceZones: [
      {
        name: 'Demo Patrol Zone — Punjab Perimeter Belt',
        type: 'protected_area',
        restrictionLevel: 'advisory',
        polygon: [
          { latitude: 31.3300, longitude: 75.4500 },
          { latitude: 31.3600, longitude: 75.4500 },
          { latitude: 31.3600, longitude: 75.5000 },
          { latitude: 31.3300, longitude: 75.5000 }
        ]
      }
    ],
    demoLocations: [
      { name: 'GT Road Jalandhar',                   latitude: 31.3280, longitude: 75.5900 },
      { name: 'Model Town Jalandhar',                latitude: 31.3160, longitude: 75.5670 },
      { name: 'PAP Chowk Jalandhar',                 latitude: 31.2980, longitude: 75.6050 },
      { name: 'Jalandhar Bus Stand Area',             latitude: 31.3230, longitude: 75.5950 },
      { name: 'Focal Point Industrial Area Jalandhar', latitude: 31.3550, longitude: 75.5850 },
      { name: 'Jalandhar Cantt Market',               latitude: 31.2960, longitude: 75.6180 },
      { name: 'Lovely Professional University Gate',  latitude: 31.2559, longitude: 75.7048 },
      { name: 'Phagwara Junction Railway Station',    latitude: 31.2170, longitude: 75.7650 },
      { name: 'Phagwara Bus Stand Area',              latitude: 31.2230, longitude: 75.7720 },
      { name: 'Kapurthala Road Phagwara',             latitude: 31.2300, longitude: 75.7500 }
    ]
  }
];

const NATION = { code: 'IN', name: 'India' };

// ============================================================
// INCIDENT TEMPLATES (per category, for random generation)
// Shared across all operating areas — category content doesn't
// depend on which state the incident is generated in.
// ============================================================
const INCIDENT_TEMPLATES = {
  theft: {
    titles: [
      'Theft Reported at {location}',
      'Bag Snatch Incident at {location}',
      'Vehicle Break-In Near {location}'
    ],
    descriptions: [
      'A theft has been reported by a citizen. Suspect fled on foot after snatching property.',
      'Multiple witnesses report a bag snatch near the main road. Suspect description unknown.',
      'A vehicle break-in was reported. Valuables stolen from parked car. No injury reported.'
    ]
  },
  assault: {
    titles: [
      'Assault Reported at {location}',
      'Physical Altercation at {location}',
      'Brawl Reported Near {location}'
    ],
    descriptions: [
      'Citizens report a physical altercation between multiple individuals. Medical assistance may be required.',
      'An assault has been reported near the area. Victim sustained minor injuries. Suspect still on scene.',
      'A brawl has broken out between groups. Police intervention required immediately.'
    ]
  },
  fire: {
    titles: [
      'Fire Reported Near {location}',
      'Smoke Sighted at {location}',
      'Structure Fire Alert at {location}'
    ],
    descriptions: [
      'Smoke reported near a commercial building. Citizens advised to maintain distance. Fire services alerted.',
      'A fire has broken out in the area. Possible electrical fault. Evacuation may be necessary.',
      'Structure fire reported. Multiple calls received. Fire brigade dispatched. Drone surveillance requested.'
    ]
  },
  traffic: {
    titles: [
      'Vehicle Collision at {location}',
      'Road Accident Reported Near {location}',
      'Traffic Obstruction at {location}'
    ],
    descriptions: [
      'A vehicle collision has been reported at an intersection. Road partially blocked. Minor injuries reported.',
      'Road accident involving two vehicles. One occupant trapped. Emergency services dispatched.',
      'Major traffic obstruction reported. A disabled vehicle is blocking traffic. Tow service required.'
    ]
  },
  medical: {
    titles: [
      'Medical Emergency at {location}',
      'Unconscious Person Reported Near {location}',
      'Cardiac Event Reported at {location}'
    ],
    descriptions: [
      'A medical emergency has been reported in a public area. Patient is conscious but unresponsive to queries.',
      'An unconscious person has been found by a citizen. Ambulance dispatched. Drone requested for coordination.',
      'Possible cardiac event reported. Patient requires immediate medical attention. EMS alerted.'
    ]
  },
  trespass: {
    titles: [
      'Trespass Reported at {location}',
      'Unauthorized Entry Near {location}',
      'Suspicious Activity at {location}'
    ],
    descriptions: [
      'Unauthorized individuals have been spotted in a restricted area. Security response required.',
      'A trespass incident has been reported. Suspicious persons seen entering private property.',
      'Suspicious activity reported near a gated community. Possible trespass in progress.'
    ]
  },
  other: {
    titles: [
      'Police Assistance Required at {location}',
      'Disturbance Reported Near {location}',
      'Public Safety Concern at {location}'
    ],
    descriptions: [
      'A citizen has called for police assistance. Nature of emergency is unclear. Drone reconnaissance requested.',
      'A public disturbance has been reported in the area. Officers requested to assess situation.',
      'A public safety concern has been reported. Details are being gathered. Drone dispatched for visual assessment.'
    ]
  }
};

// Severity weights for random selection (biased toward medium/high for demo realism)
const SEVERITY_POOL = ['low', 'medium', 'medium', 'high', 'high', 'critical'];

// ============================================================
// UTILITY: Find which operating area (if any) contains a coordinate
// ============================================================
function findOperatingArea(latitude, longitude) {
  return OPERATING_AREAS.find(area =>
    latitude  >= area.bounds.south &&
    latitude  <= area.bounds.north &&
    longitude >= area.bounds.west  &&
    longitude <= area.bounds.east
  ) || null;
}

function isWithinAnyOperatingArea(latitude, longitude) {
  return !!findOperatingArea(latitude, longitude);
}

function getOperatingArea(stateCode) {
  return OPERATING_AREAS.find(a => a.stateCode === stateCode) || null;
}

module.exports = {
  NATION,
  OPERATING_AREAS,
  INCIDENT_TEMPLATES,
  SEVERITY_POOL,
  findOperatingArea,
  isWithinAnyOperatingArea,
  getOperatingArea
};
