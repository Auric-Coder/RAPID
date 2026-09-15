-- Seed file for RAPID Command Center
-- Center location: Goa, India (approx Lat 15.2993, Lng 74.1240)

-- Populate mock profiles (users)
-- (Note: These IDs will reference actual Auth IDs in practice, but mock UUIDs work for dev testing)
INSERT INTO profiles (id, full_name, role, status) VALUES
('b2308e2f-5326-4ee1-b75f-b52b8b9f1d01', 'Inspector Vikram Singh', 'dispatcher', 'active'),
('b2308e2f-5326-4ee1-b75f-b52b8b9f1d02', 'Officer Ananya Fernandes', 'operator', 'active'),
('b2308e2f-5326-4ee1-b75f-b52b8b9f1d03', 'Dr. Ramesh Sawant', 'responder', 'offline')
ON CONFLICT (id) DO UPDATE 
SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, status = EXCLUDED.status;

-- Populate 5 drones with bases spread around Goa
INSERT INTO drones (id, call_sign, model, status, battery_level, latitude, longitude, altitude, speed, heading, base_latitude, base_longitude, hardware_id, mavlink_system_id, stream_url) VALUES
(
    'a3407e2f-5326-4ee1-b75f-a12b8b9f1d01', 
    'Rakshak-01', 
    'DJI Matrice 300 RTK', 
    'Standby', 
    100, 
    15.4909, -- Panaji (North Goa Capital)
    73.8278, 
    0.0, 
    0.0, 
    0.0, 
    15.4909, 
    73.8278,
    'esp32-mac-rakshak1',
    10,
    'https://multiplatform-f.akamaihd.net/i/multi/will/apple/loopmenu/manifest.m3u8'
),
(
    'a3407e2f-5326-4ee1-b75f-a12b8b9f1d02', 
    'Rakshak-02', 
    'PX4 Custom Hexacopter', 
    'Standby', 
    94, 
    15.2736, -- Margao (South Goa Hub)
    73.9582, 
    0.0, 
    0.0, 
    0.0, 
    15.2736, 
    73.9582,
    'esp32-mac-rakshak2',
    20,
    'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8'
),
(
    'a3407e2f-5326-4ee1-b75f-a12b8b9f1d03', 
    'Rakshak-03', 
    'ArduPilot Quadcopter', 
    'Standby', 
    80, 
    15.3995, -- Vasco Da Gama (Airport/Port)
    73.8118, 
    0.0, 
    0.0, 
    0.0, 
    15.3995, 
    73.8118,
    'esp32-mac-rakshak3',
    30,
    null
),
(
    'a3407e2f-5326-4ee1-b75f-a12b8b9f1d04', 
    'Rakshak-04', 
    'DJI Inspire 3', 
    'Standby', 
    100, 
    15.5907, -- Mapusa (North Goa Market Town)
    73.8122, 
    0.0, 
    0.0, 
    0.0, 
    15.5907, 
    73.8122,
    'esp32-mac-rakshak4',
    40,
    null
),
(
    'a3407e2f-5326-4ee1-b75f-a12b8b9f1d05', 
    'Rakshak-05', 
    'Custom ESP32 Searcher', 
    'maintenance', 
    15, 
    15.4018, -- Ponda (Central Goa Hub)
    74.0124, 
    0.0, 
    0.0, 
    0.0, 
    15.4018, 
    74.0124,
    'esp32-mac-rakshak5',
    50,
    null
)
ON CONFLICT (id) DO UPDATE 
SET call_sign = EXCLUDED.call_sign, model = EXCLUDED.model, status = EXCLUDED.status, 
    battery_level = EXCLUDED.battery_level, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
    base_latitude = EXCLUDED.base_latitude, base_longitude = EXCLUDED.base_longitude, hardware_id = EXCLUDED.hardware_id;
