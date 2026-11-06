-- Breathing sessions, suggestions marked done, check-in timing and hand-added data, as simple records. A deleted one keeps only its key, so other devices can remove it.
CREATE TABLE IF NOT EXISTS health_shared (
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  data TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (owner_email, kind, key)
);
