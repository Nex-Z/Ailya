CREATE TABLE resources(id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,data TEXT NOT NULL,enabled INTEGER NOT NULL,next_run INTEGER,updated_at INTEGER NOT NULL);
CREATE UNIQUE INDEX resource_name ON resources(kind,name COLLATE NOCASE);
CREATE TABLE schedule_runs(id TEXT PRIMARY KEY,resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL,name TEXT NOT NULL,due_at INTEGER NOT NULL,status TEXT NOT NULL,session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,error TEXT,UNIQUE(resource_id,due_at));
CREATE INDEX schedule_due ON resources(kind,enabled,next_run);
