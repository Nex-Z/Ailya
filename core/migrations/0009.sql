CREATE TABLE memories (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, topic TEXT NOT NULL, content TEXT NOT NULL,
 scope TEXT NOT NULL, scope_id TEXT NOT NULL, status TEXT NOT NULL,
 origin TEXT NOT NULL, version INTEGER NOT NULL, content_hash TEXT NOT NULL,
 expires_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX memories_scope ON memories(scope,scope_id,status);
CREATE TABLE memory_sources (
 memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL, message_id TEXT NOT NULL, source_hash TEXT NOT NULL,
 PRIMARY KEY(memory_id,session_id,message_id)
);
CREATE TABLE memory_suppressions (
 scope_key TEXT NOT NULL, source_hash TEXT NOT NULL,
 PRIMARY KEY(scope_key,source_hash)
);
CREATE TABLE memory_deletions (memory_id TEXT PRIMARY KEY, deleted_at INTEGER NOT NULL);
CREATE TABLE memory_audit (
 id INTEGER PRIMARY KEY, memory_id TEXT NOT NULL, version INTEGER NOT NULL,
 action TEXT NOT NULL, actor TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE memory_uses (
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
 version INTEGER NOT NULL, PRIMARY KEY(session_id,memory_id)
);
CREATE TABLE memory_index_jobs (
 memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
 version INTEGER NOT NULL, revision TEXT NOT NULL, status TEXT NOT NULL,
 error TEXT, updated_at INTEGER NOT NULL
);
