CREATE TABLE IF NOT EXISTS rt_users (
  email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rt_devices (
  token_hash TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  owner_email TEXT NOT NULL REFERENCES rt_users(email),
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  last_attempt_at TEXT,
  last_error_code TEXT,
  shortcut_version TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS rt_devices_owner ON rt_devices(owner_email, revoked_at);
CREATE TABLE IF NOT EXISTS rt_health_metrics (
  owner_email TEXT NOT NULL REFERENCES rt_users(email),
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_email, day, metric)
);
CREATE TABLE IF NOT EXISTS rt_calendar_events (
  owner_email TEXT NOT NULL REFERENCES rt_users(email),
  event_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  calendar TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_email, event_id)
);
CREATE INDEX IF NOT EXISTS rt_calendar_owner_start ON rt_calendar_events(owner_email, start_time);
CREATE TABLE IF NOT EXISTS rt_release_emails (
  email TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS rt_calendars (
  owner_email TEXT NOT NULL REFERENCES rt_users(email),
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (owner_email, name)
);
