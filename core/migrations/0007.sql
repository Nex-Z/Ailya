ALTER TABLE permission_requests ADD COLUMN scope TEXT NOT NULL DEFAULT 'once' CHECK(scope IN ('once','session'));
CREATE TABLE session_permission_grants (
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 signature TEXT NOT NULL,
 request_id TEXT NOT NULL REFERENCES permission_requests(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(session_id,signature)
);
