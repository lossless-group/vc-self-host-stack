-- Who logged an interaction, by the address their CRM knows them by.
-- HubSpot attributes records and owners by email, so the logger's name alone
-- can't be mapped to a HubSpot user.
ALTER TABLE interactions ADD COLUMN logged_by_email TEXT;
