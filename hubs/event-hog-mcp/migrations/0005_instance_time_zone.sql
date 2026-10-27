-- Each event instance keeps its own time zone, so timestamps in its workspace
-- read in local time (a Las Vegas event in Pacific, San Antonio in Central).
ALTER TABLE event_instances ADD COLUMN time_zone TEXT;
UPDATE event_instances SET time_zone = 'America/Chicago' WHERE slug = '2026-10-7x24-exchange-fall';
