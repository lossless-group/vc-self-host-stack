-- Organizer -> series -> instance for the 7x24 Exchange 2026 Fall Conference.
-- Facts from the official site, fetched 2026-10-25.
INSERT OR IGNORE INTO organizations (id, slug, complete_name, conventional_name, domains, source, first_seen_at)
  VALUES ('10faabd1-a851-4a16-bc2f-3d1ade751d4d', '7x24-exchange', '7x24 Exchange International', '7x24 Exchange', '["7x24exchange.org"]', 'https://conferences.7x24exchange.org/fall2026', '2026-10-25T21:42:19Z');
INSERT OR IGNORE INTO event_series (id, slug, name, organizer_org_id, cadence, website, source, first_seen_at)
  VALUES ('55dadd32-3652-4f8f-8d23-ceda0d6005f0', '7x24-exchange-conferences', '7x24 Exchange Conferences',
          (SELECT id FROM organizations WHERE slug = '7x24-exchange'), 'semiannual (Spring and Fall)', 'https://conferences.7x24exchange.org', 'https://conferences.7x24exchange.org/fall2026', '2026-10-25T21:42:19Z');
INSERT OR IGNORE INTO event_instances (id, series_id, slug, name, starts_on, ends_on, venue, city, website, artifacts_repo, source, first_seen_at)
  VALUES ('1cb255fb-93c2-44aa-9136-b29242a993e6', (SELECT id FROM event_series WHERE slug = '7x24-exchange-conferences'), '2026-10-7x24-exchange-fall',
          '7x24 Exchange Conferences 2026 Fall Conference', '2026-10-25', '2026-10-28', 'JW Marriott San Antonio Hill Country',
          'San Antonio, TX', 'https://conferences.7x24exchange.org/fall2026', 'event-hog/2026-10-7x24-exchange-fall', 'https://conferences.7x24exchange.org/fall2026', '2026-10-25T21:42:19Z');
