CREATE TABLE plugins (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, source TEXT NOT NULL, enabled INTEGER NOT NULL,
 active_version TEXT, error TEXT, updated_at INTEGER NOT NULL
);
CREATE TABLE plugin_versions (
 id TEXT PRIMARY KEY, plugin_id TEXT NOT NULL, source TEXT NOT NULL, hash TEXT NOT NULL, version TEXT NOT NULL,
 entries TEXT NOT NULL, tools TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE plugin_files (
 version_id TEXT NOT NULL REFERENCES plugin_versions(id) ON DELETE CASCADE,
 path TEXT NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(version_id,path)
);
CREATE TABLE task_plugins (
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 plugin_id TEXT NOT NULL, version_id TEXT NOT NULL REFERENCES plugin_versions(id),
 PRIMARY KEY(task_id,plugin_id)
);
CREATE TABLE plugin_jobs (
 id TEXT PRIMARY KEY, plugin_id TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL,
 input TEXT NOT NULL, error TEXT, started_at INTEGER NOT NULL, finished_at INTEGER
);
