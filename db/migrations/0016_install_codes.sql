-- One-time codes that carry a sign-in from Safari to the Home Screen app. Only a hash is kept, and each lasts 30 minutes.
CREATE TABLE IF NOT EXISTS health_install_codes (
  code_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
