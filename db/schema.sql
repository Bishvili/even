CREATE TABLE IF NOT EXISTS sync_tokens(hash TEXT PRIMARY KEY,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS health_metrics(day TEXT NOT NULL,metric TEXT NOT NULL,value REAL NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(day,metric));
CREATE TABLE IF NOT EXISTS calendar_events(id TEXT PRIMARY KEY,start_time TEXT NOT NULL,end_time TEXT NOT NULL,title TEXT NOT NULL,category TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_time);
