PRAGMA foreign_keys=OFF;
CREATE TABLE pods_next (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  language TEXT NOT NULL,
  learning_path TEXT,
  pod_type TEXT NOT NULL DEFAULT 'study',
  capacity INTEGER NOT NULL DEFAULT 6 CHECK((pod_type = 'study' AND capacity = 6) OR (pod_type = 'one_to_one' AND capacity = 2) OR (pod_type = 'commons' AND capacity > 0)),
  invitation_code TEXT UNIQUE,
  created_at TEXT NOT NULL
);
INSERT INTO pods_next(id,mode,language,learning_path,pod_type,capacity,invitation_code,created_at)
  SELECT id,mode,language,learning_path,pod_type,capacity,invitation_code,created_at FROM pods;
DROP TABLE pods;
ALTER TABLE pods_next RENAME TO pods;
PRAGMA foreign_keys=ON;
