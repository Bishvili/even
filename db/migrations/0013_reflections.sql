-- Weekly reflections, synced the way check-ins are. A deleted one keeps only its ID and time, so other devices can remove it.
CREATE TABLE IF NOT EXISTS health_reflections (
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  id TEXT NOT NULL,
  ts TEXT NOT NULL,
  answers TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (owner_email, id)
);
