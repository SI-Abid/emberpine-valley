-- Emberpine Valley player accounts (cross-device saves + recovery-code identity).
-- Apply with:  npx wrangler d1 migrations apply emberpine-accounts [--local|--remote]
--
-- One row per account. The save is an opaque JSON blob (same shape the client
-- already writes to its local 'save-v1'/'legacy-v1' store keys) — the server
-- never queries into it, so no normalization. Recovery codes are never stored
-- plaintext: code_lookup is a peppered SHA-256 for the indexed lookup, and
-- code_hash/code_salt is a slow PBKDF2 verify so a raw DB leak alone doesn't
-- hand out working codes.

CREATE TABLE players (
  id           TEXT PRIMARY KEY,          -- server-generated account id ('acct_...'), NOT the in-game S.me.id
  code_lookup  TEXT UNIQUE NOT NULL,      -- hex SHA-256(RECOVERY_PEPPER + normalized_code)
  code_hash    TEXT NOT NULL,             -- base64 PBKDF2-SHA256(code, code_salt)
  code_salt    TEXT NOT NULL,             -- base64 random 16 bytes
  name         TEXT,                      -- last known settler name; display/support only
  save_json    TEXT,                      -- opaque save-v1 blob
  legacy_json  TEXT,                      -- opaque legacy-v1 blob
  save_v       INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
