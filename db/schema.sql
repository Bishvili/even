CREATE TABLE IF NOT EXISTS health_users (
  email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT,
  sync_off TEXT,
  look TEXT
);
CREATE TABLE IF NOT EXISTS health_devices (
  token_hash TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  last_attempt_at TEXT,
  last_seen_at TEXT,
  last_error_code TEXT,
  shortcut_version TEXT,
  revoked_at TEXT,
  last_upload_counts TEXT
);
CREATE INDEX IF NOT EXISTS health_devices_owner ON health_devices(owner_email, revoked_at);
CREATE TABLE IF NOT EXISTS health_metrics (
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_email, day, metric)
);
CREATE TABLE IF NOT EXISTS health_title_rules (
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  title TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_email, title)
);
CREATE TABLE IF NOT EXISTS health_hidden_days (
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  day TEXT NOT NULL,
  PRIMARY KEY (owner_email, day)
);
CREATE TABLE IF NOT EXISTS health_calendar_events (
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  event_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  calendar TEXT,
  updated_at TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  category_from TEXT,
  PRIMARY KEY (owner_email, event_id)
);
CREATE INDEX IF NOT EXISTS health_calendar_owner_start ON health_calendar_events(owner_email, start_time);
CREATE TABLE IF NOT EXISTS health_release_emails (
  email TEXT PRIMARY KEY,
  display_name TEXT,
  welcomed_at TEXT
);
CREATE TABLE IF NOT EXISTS health_calendars (
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  category TEXT,
  PRIMARY KEY (owner_email, name)
);
CREATE TABLE IF NOT EXISTS health_push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  device_id TEXT NOT NULL,
  mode TEXT,
  sync_at TEXT,
  last_sync_prompt_day TEXT,
  stress_times TEXT,
  last_stress_at TEXT,
  schedule TEXT,
  last_schedule_at TEXT,
  last_check_in_at TEXT,
  time_zone TEXT NOT NULL,
  last_push_status INTEGER,
  p256dh TEXT,
  auth TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS health_approved_emails (
  email TEXT PRIMARY KEY,
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS health_alarms (
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  position INTEGER NOT NULL,
  time_min INTEGER NOT NULL,
  days TEXT NOT NULL,
  enabled INTEGER,
  label TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner_email,position)
);
CREATE TABLE IF NOT EXISTS health_reflections (
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  id TEXT NOT NULL,
  ts TEXT NOT NULL,
  answers TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (owner_email, id)
);
CREATE TABLE IF NOT EXISTS health_moods (
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  id TEXT NOT NULL,
  ts TEXT NOT NULL,
  score INTEGER,
  energy INTEGER,
  stress INTEGER,
  tags TEXT,
  note TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY(owner_email,id)
);
CREATE TABLE IF NOT EXISTS health_names (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  set_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS health_push_owner ON health_push_subscriptions(owner_email);
CREATE INDEX IF NOT EXISTS health_push_device ON health_push_subscriptions(device_id);
CREATE TABLE health_signin_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL,
  image TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE TABLE health_signin_sessions (
  id TEXT PRIMARY KEY,
  expiresAt TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES health_signin_users(id) ON DELETE CASCADE
);
CREATE INDEX health_signin_sessions_user ON health_signin_sessions(userId);
CREATE TABLE health_signin_accounts (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES health_signin_users(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX health_signin_accounts_user ON health_signin_accounts(userId);
CREATE TABLE health_signin_verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX health_signin_verifications_identifier ON health_signin_verifications(identifier);
CREATE TABLE health_service (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS health_moods_changes ON health_moods(owner_email,updated_at);
