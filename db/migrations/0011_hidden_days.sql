-- Health days a person hid in the app. Their measures stay in place, so they can be shown again.
CREATE TABLE IF NOT EXISTS health_hidden_days (
  owner_email TEXT NOT NULL REFERENCES health_users(email),
  day TEXT NOT NULL,
  PRIMARY KEY (owner_email, day)
);
