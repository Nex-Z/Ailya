CREATE TABLE core_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE permission_requests (
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 tool_call_id TEXT NOT NULL,
 tool TEXT NOT NULL,
 args TEXT NOT NULL,
 action TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','allowed','denied','cancelled','automatic')),
 created_at INTEGER NOT NULL,
 resolved_at INTEGER,
 UNIQUE(task_id,tool_call_id)
);
CREATE TABLE attachments (
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 message_id TEXT NOT NULL,
 name TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL,
 hash TEXT NOT NULL,
 bytes BLOB NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX attachment_owner ON attachments(session_id,message_id);
