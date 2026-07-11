-- Phase 2 seed data. Prices/structure are real (source: packages-data.jsx /
-- camping-data.jsx, "the official price sheet"), but names/taglines/descriptions
-- are provisional pending the Content Update Workbook confirmation (plan §14
-- item 3) -- review before launch. IDs are deterministic (not
-- crypto.randomUUID()) since this is a one-time bootstrap script, not a
-- runtime write path.

-- ============ Tours: 6 SKUs, 5.5km (B) and 7.5km (C) x 3 add-on tiers ============

INSERT INTO tours (id, slug, code, name, tagline, description, distance_km, duration_label, min_group, max_group, includes, badge, is_active, sort_order) VALUES
('tour-b1', 'classic-rush', 'B1', 'The Classic Rush', '5.5 km Rafting & Zipline', 'Our signature combo. The most-booked adventure on the river -- pure adrenaline, zero hassle.', 5.5, '~4 hrs', 2, 10, '["White-water rafting","Jungle zipline circuit","Lunch included","Round-trip hotel transfer"]', 'Bestseller', 1, 1),
('tour-b2', 'adventure-combo', 'B2', 'The Adventure Combo', '5.5 km Rafting, Zipline & Your Choice', 'Build your perfect day. Rafting and ziplining plus one wild add-on of your choice.', 5.5, '~5 hrs', 2, 10, '["White-water rafting","Jungle zipline circuit","Lunch included","Round-trip hotel transfer","Your choice: ATV (40 min) + fresh coconut OR Elephant trek (30 min)"]', 'Most Popular', 1, 2),
('tour-b3', 'full-option', 'B3', 'The Full Option', '5.5 km Rafting, ATV & Elephant Trekking', 'The whole jungle in one day. Nothing left out -- the ultimate bucket-list package.', 5.5, 'Full day', 2, 10, '["White-water rafting","Jungle zipline circuit","Lunch included","Round-trip hotel transfer","ATV (40 min) + fresh coconut AND Elephant trek (30 min)"]', 'Best Value', 1, 3),
('tour-c1', 'classic-rush-extended', 'C1', 'The Classic Rush -- Extended Run', '7.5 km Rafting & Zipline', 'Two extra kilometres of rapids. A longer, wilder ride for those who want the full adrenaline distance.', 7.5, '~4.5 hrs', 2, 10, '["White-water rafting","Jungle zipline circuit","Lunch included","Round-trip hotel transfer"]', NULL, 1, 4),
('tour-c2', 'adventure-combo-extended', 'C2', 'The Adventure Combo -- Extended Run', '7.5 km Rafting, Zipline & Your Choice', 'More river, more thrills, plus one wild add-on of your choice.', 7.5, '~5.5 hrs', 2, 10, '["White-water rafting","Jungle zipline circuit","Lunch included","Round-trip hotel transfer","Your choice: ATV (40 min) + fresh coconut OR Elephant trek (30 min)"]', NULL, 1, 5),
('tour-c3', 'full-option-extended', 'C3', 'The Full Option -- Extended Run', '7.5 km Rafting, ATV & Elephant Trekking', 'The complete day on the longer route. Rafting, zipline, ATV and elephants.', 7.5, 'Full day', 2, 10, '["White-water rafting","Jungle zipline circuit","Lunch included","Round-trip hotel transfer","ATV (40 min) + fresh coconut AND Elephant trek (30 min)"]', NULL, 1, 6);

-- Age-band pricing per the confirmed policy (plan §14): adult rate from age
-- 6, under 6 free and excluded from activity capacity. "Adult" price below
-- is the real price-sheet figure for each SKU.
INSERT INTO tour_rates (id, tour_id, min_age, max_age, label, price, counts_toward_capacity) VALUES
('rate-b1-infant', 'tour-b1', 0, 5, 'Under 6 (free, no activity)', 0, 0),
('rate-b1-adult',  'tour-b1', 6, NULL, 'Age 6+', 3000, 1),
('rate-b2-infant', 'tour-b2', 0, 5, 'Under 6 (free, no activity)', 0, 0),
('rate-b2-adult',  'tour-b2', 6, NULL, 'Age 6+', 3400, 1),
('rate-b3-infant', 'tour-b3', 0, 5, 'Under 6 (free, no activity)', 0, 0),
('rate-b3-adult',  'tour-b3', 6, NULL, 'Age 6+', 3800, 1),
('rate-c1-infant', 'tour-c1', 0, 5, 'Under 6 (free, no activity)', 0, 0),
('rate-c1-adult',  'tour-c1', 6, NULL, 'Age 6+', 3600, 1),
('rate-c2-infant', 'tour-c2', 0, 5, 'Under 6 (free, no activity)', 0, 0),
('rate-c2-adult',  'tour-c2', 6, NULL, 'Age 6+', 4000, 1),
('rate-c3-infant', 'tour-c3', 0, 5, 'Under 6 (free, no activity)', 0, 0),
('rate-c3-adult',  'tour-c3', 6, NULL, 'Age 6+', 4400, 1);

-- ============ Camping: 3 zones x 3 stay packages ============

INSERT INTO camp_zones (id, slug, name, tagline, description, sleeps_label, amenities, is_active, sort_order) VALUES
('zone-family', 'family', 'Family Zone', 'Spacious & playful', 'Roomy canvas tents with soft floor bedding, fairy lights and space for the kids to spread out.', 'Up to 4-5 guests', '["WiFi","Standing fan","Mini-fridge","Floor mattresses & bedding","String lights"]', 1, 1),
('zone-outdoor', 'outdoor', 'Outdoor Zone', 'Closest to the river', 'A-frame glamping tents right on the riverside lawn -- fall asleep to the sound of the rapids.', '2-3 guests', '["WiFi","Air cooler & fan","Mini-fridge","Proper bed & bedding","Riverside lawn"]', 1, 2),
('zone-private', 'private', 'Private Zone', 'Most comfort & privacy', 'Fully enclosed premium tents with air-conditioning, a smart TV and your own secluded riverside deck.', '2 guests', '["WiFi","Air-conditioning","Smart TV","Mini-fridge","Private deck"]', 1, 3);

INSERT INTO camp_rates (id, zone_id, stay_type, includes_rafting_km, price_weekday, price_weekend, min_nights, is_active) VALUES
('rate-family-dine',  'zone-family',  'Stay & Dine',       NULL, 999,  1299, 1, 1),
('rate-family-raft55','zone-family',  'Stay + Raft 5.5',   5.5,  1499, 1799, 1, 1),
('rate-family-raft75','zone-family',  'Stay + Raft 7.5',   7.5,  1899, 2199, 1, 1),
('rate-outdoor-dine',  'zone-outdoor', 'Stay & Dine',       NULL, 1099, 1399, 1, 1),
('rate-outdoor-raft55','zone-outdoor', 'Stay + Raft 5.5',   5.5,  1599, 1899, 1, 1),
('rate-outdoor-raft75','zone-outdoor', 'Stay + Raft 7.5',   7.5,  1999, 2299, 1, 1),
('rate-private-dine',  'zone-private', 'Stay & Dine',       NULL, 1199, 1499, 1, 1),
('rate-private-raft55','zone-private', 'Stay + Raft 5.5',   5.5,  1699, 1999, 1, 1),
('rate-private-raft75','zone-private', 'Stay + Raft 7.5',   7.5,  2099, 2399, 1, 1);

-- ============ Pickup zones (packages-data.jsx PICKUP table) ============

INSERT INTO pickup_zones (id, name, fee, earliest_pickup_time, is_active, sort_order) VALUES
('pickup-patong',   'Patong (Sai Kor / Beach Rd / Tritrang)', 0, '07:45', 1, 1),
('pickup-kata',     'Kata / Karon', 0, '07:30', 1, 2),
('pickup-kathu',    'Kathu', 0, '07:30', 1, 3),
('pickup-kalim',    'Kalim / Kamala / Surin', 0, '08:15', 1, 4),
('pickup-town',     'Phuket Town / Leam Hin', 0, '08:45', 1, 5),
('pickup-bangtao',  'Bangtao / Laguna', 0, '09:00', 1, 6),
('pickup-naiyang',  'Nai Yang / Airport / Mai Khao', 0, '09:15', 1, 7),
('pickup-naithon',  'Naithon / Layan', 200, '09:00', 1, 8),
('pickup-naiharn',  'Nai Harn / Rawai / Panwa / Ao Yon / Siray Bay', 300, '07:00', 1, 9),
('pickup-leamkrating', 'Leam Krating / Ao Por / Leam Yamu (private transfer, contact for pricing)', 0, '07:30', 1, 10);
