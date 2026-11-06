-- Where an event's type came from: you, rule, title or calendar. A type a person chose stays through every sync.
ALTER TABLE health_calendar_events ADD COLUMN category_from TEXT;
-- A type a person chose for every event with a title. The title is stored normalized, with the words they saw beside it.
CREATE TABLE IF NOT EXISTS health_title_rules (
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  title TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_email, title)
);
