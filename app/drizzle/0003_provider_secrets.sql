CREATE TABLE IF NOT EXISTS provider_secrets (
  owner_email TEXT NOT NULL,
  provider TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  last_four TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_email, provider)
);
