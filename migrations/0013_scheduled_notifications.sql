-- Migration number: 0013 	 2026-07-15T00:00:00.000Z

-- Pre-arrival (T-1) and thank-you (T+1) automated notifications, plan §2:
-- "Pre-arrival automation (Cron, launch-scope not phase-10): T-1 day pickup-time
-- confirmation via email + (opt-in) WhatsApp template; T+1 day thank-you with
-- Google-review link. Both render from templates and are throttled/logged like
-- all notifications."
--
-- Deliberately NOT reusing bookings.last_email_sent_at/last_email_status: those
-- are the staff "Notify guest" button's record (dashboard/bookings/actions.ts).
-- A cron writing to them would silently overwrite the staff-facing record with
-- an unrelated event -- staff would see "email sent 2 minutes ago" and have no
-- way to tell it was an automated reminder rather than the confirmation they
-- clicked. These are separate facts and get separate columns, same reasoning as
-- waiver_acknowledged vs booking_participants (migration 0005).
--
-- *_sent_at doubles as the idempotency claim, not just a log: the cron claims a
-- booking with a guarded `UPDATE ... WHERE <col> IS NULL` (the same
-- fold-the-check-into-the-write pattern the capacity claims use, and for the
-- same reason -- D1 has no BEGIN/COMMIT, so a read-then-send-then-write would
-- let a retried or overlapping cron invocation double-send). A claimed row whose
-- send then fails keeps its timestamp and gets status='failed' rather than being
-- released: an unsent reminder is recoverable by a staff button-click and is
-- visible in the dashboard, whereas releasing the claim risks a retry storm
-- spamming a real guest. At-most-once, on purpose.
ALTER TABLE bookings ADD COLUMN pre_arrival_sent_at INTEGER;
ALTER TABLE bookings ADD COLUMN pre_arrival_status TEXT;
ALTER TABLE bookings ADD COLUMN thank_you_sent_at INTEGER;
ALTER TABLE bookings ADD COLUMN thank_you_status TEXT;
