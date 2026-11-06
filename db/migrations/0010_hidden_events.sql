-- Events a person removed from the app, so the next sync doesn't bring them back. Holds only the event's ID and start.
CREATE TABLE IF NOT EXISTS health_hidden_events (
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  event_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  PRIMARY KEY (owner_email, event_id)
);
