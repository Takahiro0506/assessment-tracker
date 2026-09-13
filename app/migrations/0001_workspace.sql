CREATE TABLE IF NOT EXISTS workspaces (
  owner TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)),
  operation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS revisions (
  owner TEXT NOT NULL,
  revision INTEGER NOT NULL,
  data TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner, revision),
  UNIQUE(owner, operation_id)
);
CREATE TRIGGER IF NOT EXISTS workspace_insert_history AFTER INSERT ON workspaces BEGIN
  INSERT INTO revisions VALUES (NEW.owner,NEW.revision,NEW.data,NEW.operation_id,NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS workspace_update_history AFTER UPDATE ON workspaces BEGIN
  INSERT INTO revisions VALUES (NEW.owner,NEW.revision,NEW.data,NEW.operation_id,NEW.updated_at);
END;
