CREATE TABLE context_summaries (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 cutoff INTEGER NOT NULL, source_hash TEXT NOT NULL, profile TEXT NOT NULL,
 summary TEXT NOT NULL, before_tokens INTEGER NOT NULL, after_tokens INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX summary_session ON context_summaries(session_id,created_at);
CREATE TABLE context_segments (
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 source_hash TEXT NOT NULL, profile TEXT NOT NULL, summary TEXT NOT NULL,
 PRIMARY KEY(session_id,source_hash,profile)
);
CREATE TABLE context_jobs (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 mode TEXT NOT NULL, status TEXT NOT NULL, cutoff INTEGER NOT NULL, source_hash TEXT NOT NULL,
 profile TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL, finished_at INTEGER
);
CREATE TABLE context_requests (
 id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES context_jobs(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, request TEXT NOT NULL, response TEXT, UNIQUE(job_id,ordinal)
);
