CREATE TABLE group_runs(
 child_session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
 child_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 parent_session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 parent_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 tool_call_id TEXT NOT NULL,
 agent_id TEXT NOT NULL,
 UNIQUE(parent_task_id,tool_call_id)
);
CREATE INDEX group_parent ON group_runs(parent_session_id);
