CREATE TABLE question_batches(
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 owner_session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 tool_call_id TEXT NOT NULL,
 data TEXT NOT NULL,
 UNIQUE(task_id,tool_call_id)
);
CREATE INDEX questions_owner ON question_batches(owner_session_id);
