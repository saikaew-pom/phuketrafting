-- Availability seed: the recurring schedule (session_templates) and the
-- physical camp inventory (camp_units). Both tables existed since Phase 1-2
-- with ZERO rows and nothing to populate them, which is why a fresh database
-- had no bookable departures at all and the public widget correctly reported
-- "No open dates in the next 90 days".
--
-- This seeds CONFIG, not data: session_templates says "we run 09:00 daily",
-- and lib/session-generator.ts materializes that into real tour_sessions on a
-- rolling 120-day window (daily cron). Seeding ~90 days of session rows
-- directly would have expired silently and looked like a fresh bug later.
--
-- ============================================================================
-- ⚠️  THE NUMBERS BELOW ARE PROVISIONAL AND MUST BE CONFIRMED BY THE CLIENT
--     BEFORE THE PHASE 9 DNS CUTOVER. They are plausible defaults for a test
--     site, not the real operation. Specifically:
--       * departure times (09:00 / 13:30)
--       * per-departure capacities
--       * the number and names of camp tents
--     All of it is staff-editable in the dashboard, so correcting it is a data
--     change, never a deploy.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Session templates: weekday (0=Sunday .. 6=Saturday) x start_time x capacity.
--
-- Shape, and the reasoning so it can be argued with:
--   * Daily. Thai adventure tourism runs 7 days a week; a business that
--     doesn't simply deactivates the weekday it doesn't want.
--   * Full-day tours (B3 / C3, duration_label "Full day") get the MORNING slot
--     only -- a full-day trip cannot also depart at 13:30.
--   * Half-day tours (~4 to ~5.5 hrs) get morning and afternoon.
--   * Capacity 24 on the 5.5 km runs (B) and 16 on the 7.5 km Extended runs
--     (C): the longer route turns over fewer guests per day. Both comfortably
--     exceed tours.max_group (10), so a single large booking always fits.
--
-- ⚠️ MODELLING CAVEAT -- read before trusting these in production:
--    These are PER-TOUR departures, so B1 and B2 each hold 24 seats at 09:00
--    independently: 48 guests on a river that may only float 24. The schema
--    anticipated exactly this -- session_templates.tour_id is commented
--    "NULL = shared river session across tours" -- but tour_sessions requires
--    a tour_id to be bookable, so shared sessions are not implemented and the
--    generator skips NULL-tour templates. If these six SKUs really share one
--    pool of rafts and guides (they almost certainly do), per-tour capacity
--    can oversell the real resource, and that needs a schema decision, not a
--    bigger number here.
-- ---------------------------------------------------------------------------

DELETE FROM session_templates;

-- B1 The Classic Rush (5.5 km, ~4 hrs) -- morning + afternoon
INSERT INTO session_templates (id, tour_id, weekday, start_time, capacity) VALUES
('tpl-b1-0-0900','tour-b1',0,'09:00',24),
('tpl-b1-1-0900','tour-b1',1,'09:00',24),
('tpl-b1-2-0900','tour-b1',2,'09:00',24),
('tpl-b1-3-0900','tour-b1',3,'09:00',24),
('tpl-b1-4-0900','tour-b1',4,'09:00',24),
('tpl-b1-5-0900','tour-b1',5,'09:00',24),
('tpl-b1-6-0900','tour-b1',6,'09:00',24),
('tpl-b1-0-1330','tour-b1',0,'13:30',24),
('tpl-b1-1-1330','tour-b1',1,'13:30',24),
('tpl-b1-2-1330','tour-b1',2,'13:30',24),
('tpl-b1-3-1330','tour-b1',3,'13:30',24),
('tpl-b1-4-1330','tour-b1',4,'13:30',24),
('tpl-b1-5-1330','tour-b1',5,'13:30',24),
('tpl-b1-6-1330','tour-b1',6,'13:30',24);

-- B2 The Adventure Combo (5.5 km, ~5 hrs) -- morning + afternoon
INSERT INTO session_templates (id, tour_id, weekday, start_time, capacity) VALUES
('tpl-b2-0-0900','tour-b2',0,'09:00',24),
('tpl-b2-1-0900','tour-b2',1,'09:00',24),
('tpl-b2-2-0900','tour-b2',2,'09:00',24),
('tpl-b2-3-0900','tour-b2',3,'09:00',24),
('tpl-b2-4-0900','tour-b2',4,'09:00',24),
('tpl-b2-5-0900','tour-b2',5,'09:00',24),
('tpl-b2-6-0900','tour-b2',6,'09:00',24),
('tpl-b2-0-1330','tour-b2',0,'13:30',24),
('tpl-b2-1-1330','tour-b2',1,'13:30',24),
('tpl-b2-2-1330','tour-b2',2,'13:30',24),
('tpl-b2-3-1330','tour-b2',3,'13:30',24),
('tpl-b2-4-1330','tour-b2',4,'13:30',24),
('tpl-b2-5-1330','tour-b2',5,'13:30',24),
('tpl-b2-6-1330','tour-b2',6,'13:30',24);

-- B3 The Full Option (5.5 km, FULL DAY) -- morning only
INSERT INTO session_templates (id, tour_id, weekday, start_time, capacity) VALUES
('tpl-b3-0-0900','tour-b3',0,'09:00',24),
('tpl-b3-1-0900','tour-b3',1,'09:00',24),
('tpl-b3-2-0900','tour-b3',2,'09:00',24),
('tpl-b3-3-0900','tour-b3',3,'09:00',24),
('tpl-b3-4-0900','tour-b3',4,'09:00',24),
('tpl-b3-5-0900','tour-b3',5,'09:00',24),
('tpl-b3-6-0900','tour-b3',6,'09:00',24);

-- C1 The Classic Rush -- Extended Run (7.5 km, ~4.5 hrs) -- morning + afternoon
INSERT INTO session_templates (id, tour_id, weekday, start_time, capacity) VALUES
('tpl-c1-0-0900','tour-c1',0,'09:00',16),
('tpl-c1-1-0900','tour-c1',1,'09:00',16),
('tpl-c1-2-0900','tour-c1',2,'09:00',16),
('tpl-c1-3-0900','tour-c1',3,'09:00',16),
('tpl-c1-4-0900','tour-c1',4,'09:00',16),
('tpl-c1-5-0900','tour-c1',5,'09:00',16),
('tpl-c1-6-0900','tour-c1',6,'09:00',16),
('tpl-c1-0-1330','tour-c1',0,'13:30',16),
('tpl-c1-1-1330','tour-c1',1,'13:30',16),
('tpl-c1-2-1330','tour-c1',2,'13:30',16),
('tpl-c1-3-1330','tour-c1',3,'13:30',16),
('tpl-c1-4-1330','tour-c1',4,'13:30',16),
('tpl-c1-5-1330','tour-c1',5,'13:30',16),
('tpl-c1-6-1330','tour-c1',6,'13:30',16);

-- C2 The Adventure Combo -- Extended Run (7.5 km, ~5.5 hrs) -- morning only
-- (a 5.5 hr trip leaving at 13:30 finishes after dark on the river)
INSERT INTO session_templates (id, tour_id, weekday, start_time, capacity) VALUES
('tpl-c2-0-0900','tour-c2',0,'09:00',16),
('tpl-c2-1-0900','tour-c2',1,'09:00',16),
('tpl-c2-2-0900','tour-c2',2,'09:00',16),
('tpl-c2-3-0900','tour-c2',3,'09:00',16),
('tpl-c2-4-0900','tour-c2',4,'09:00',16),
('tpl-c2-5-0900','tour-c2',5,'09:00',16),
('tpl-c2-6-0900','tour-c2',6,'09:00',16);

-- C3 The Full Option -- Extended Run (7.5 km, FULL DAY) -- morning only
INSERT INTO session_templates (id, tour_id, weekday, start_time, capacity) VALUES
('tpl-c3-0-0900','tour-c3',0,'09:00',16),
('tpl-c3-1-0900','tour-c3',1,'09:00',16),
('tpl-c3-2-0900','tour-c3',2,'09:00',16),
('tpl-c3-3-0900','tour-c3',3,'09:00',16),
('tpl-c3-4-0900','tour-c3',4,'09:00',16),
('tpl-c3-5-0900','tour-c3',5,'09:00',16),
('tpl-c3-6-0900','tour-c3',6,'09:00',16);

-- ---------------------------------------------------------------------------
-- Camp units: the PHYSICAL tents that get booked. camp_zones and camp_rates
-- were seeded in Phase 2, but camp_units -- the thing listAvailableCampUnits
-- actually reads -- has always been empty, so the live camp widget could never
-- complete a booking. That was tracked as a production blocker.
--
-- ⚠️ TENT COUNTS AND NAMES ARE INVENTED. This is the item the plan doc says
--    "cannot be invented -- guessing the count directly causes overselling or
--    lost revenue", and that is still true for the real site: too many tents
--    oversells the camp, too few silently loses bookings. They are seeded here
--    ONLY because this is a pre-launch test site and an empty table makes the
--    camp flow untestable. THE CLIENT MUST CONFIRM, per zone: how many real
--    tents, and what each is called (the names print on the day-sheet and are
--    what OTA rooms map to in Phase 5b).
--
-- occupancy follows each zone's own sleeps_label, which IS real:
--    Family Zone  "Up to 4-5 guests" -> 5
--    Outdoor Zone "2-3 guests"       -> 3
--    Private Zone "2 guests"         -> 2
--
-- ical_export_token is deliberately left NULL: it's a capability token (anyone
-- holding it can read that unit's bookings), so Phase 5b must mint real random
-- ones rather than inherit anything predictable from a committed seed file.
-- ---------------------------------------------------------------------------

-- NOT "DELETE FROM camp_units" first, unlike the templates above. Two
-- reasons, and both bite precisely because the banner says these counts get
-- corrected later:
--   * bookings.camp_unit_id is a FK to this table, so once a single camp
--     booking exists the DELETE fails outright -- the seed would break exactly
--     when someone re-ran it to fix the numbers.
--   * even without bookings it would silently drop any unit staff had added.
-- ON CONFLICT DO NOTHING makes re-running a safe no-op. Correcting the real
-- counts is therefore an EDIT (dashboard or SQL), not a re-run of this file:
-- adding a tent means adding a row, removing one means is_active = 0, never a
-- DELETE (history references it).
INSERT INTO camp_units (id, zone_id, name, occupancy) VALUES
('unit-family-1','zone-family','Family Tent 1',5),
('unit-family-2','zone-family','Family Tent 2',5),
('unit-family-3','zone-family','Family Tent 3',5),
('unit-family-4','zone-family','Family Tent 4',5),

('unit-outdoor-1','zone-outdoor','Outdoor Tent 1',3),
('unit-outdoor-2','zone-outdoor','Outdoor Tent 2',3),
('unit-outdoor-3','zone-outdoor','Outdoor Tent 3',3),
('unit-outdoor-4','zone-outdoor','Outdoor Tent 4',3),
('unit-outdoor-5','zone-outdoor','Outdoor Tent 5',3),
('unit-outdoor-6','zone-outdoor','Outdoor Tent 6',3),

('unit-private-1','zone-private','Private Tent 1',2),
('unit-private-2','zone-private','Private Tent 2',2),
('unit-private-3','zone-private','Private Tent 3',2)
ON CONFLICT(id) DO NOTHING;
