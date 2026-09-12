CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  source TEXT,
  stage TEXT,
  name TEXT,
  email TEXT,
  org TEXT,
  title TEXT,
  phone TEXT,
  segment TEXT,
  answers_json TEXT,
  score_pct INTEGER,
  tier TEXT,
  kvkk_ok INTEGER,
  news_ok INTEGER,
  lang TEXT,
  country TEXT,
  path TEXT
);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
