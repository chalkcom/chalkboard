CREATE TABLE knowledge ( id TEXT PRIMARY KEY, source TEXT NOT NULL, url TEXT, title TEXT,
  chunk TEXT NOT NULL, updated_at TEXT NOT NULL );
CREATE INDEX idx_knowledge_source ON knowledge(source);
CREATE VIRTUAL TABLE knowledge_fts USING fts5(knowledge_id UNINDEXED, title, chunk, tokenize='porter unicode61');
CREATE TRIGGER knowledge_fts_ai AFTER INSERT ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_id, title, chunk) VALUES (new.id, new.title, new.chunk); END;
CREATE TRIGGER knowledge_fts_au AFTER UPDATE OF title, chunk ON knowledge BEGIN
  DELETE FROM knowledge_fts WHERE knowledge_id = old.id;
  INSERT INTO knowledge_fts(knowledge_id, title, chunk) VALUES (new.id, new.title, new.chunk); END;
CREATE TRIGGER knowledge_fts_ad AFTER DELETE ON knowledge BEGIN
  DELETE FROM knowledge_fts WHERE knowledge_id = old.id; END;
