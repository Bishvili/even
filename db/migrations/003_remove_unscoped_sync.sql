-- Remove superseded unscoped synchronization tables.
-- Preconditions: confirm every legacy table exists and all three row counts are zero.
-- The current owner-scoped rt_* tables are not modified.
--
-- SELECT (SELECT COUNT(*) FROM sync_tokens) AS tokens,
--        (SELECT COUNT(*) FROM health_metrics) AS health,
--        (SELECT COUNT(*) FROM calendar_events) AS calendar;
--
-- Stop and migrate any nonzero records before applying.

DROP INDEX IF EXISTS idx_calendar_events_start;
DROP TABLE IF EXISTS sync_tokens;
DROP TABLE IF EXISTS health_metrics;
DROP TABLE IF EXISTS calendar_events;
