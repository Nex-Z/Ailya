CREATE TABLE skill_packages (
 resource_id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
 version INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
 manual INTEGER NOT NULL, hash TEXT NOT NULL
);
CREATE UNIQUE INDEX skill_package_name ON skill_packages(name);
CREATE TABLE skill_files (
 resource_id TEXT NOT NULL REFERENCES skill_packages(resource_id) ON DELETE CASCADE,
 path TEXT NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(resource_id,path)
);
CREATE TABLE task_skills (
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, resource_id TEXT NOT NULL,
 version INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
 manual INTEGER NOT NULL, hash TEXT NOT NULL, PRIMARY KEY(task_id,resource_id)
);
CREATE TABLE task_skill_files (
 task_id TEXT NOT NULL, resource_id TEXT NOT NULL, path TEXT NOT NULL, bytes BLOB NOT NULL,
 PRIMARY KEY(task_id,resource_id,path),
 FOREIGN KEY(task_id,resource_id) REFERENCES task_skills(task_id,resource_id) ON DELETE CASCADE
);
