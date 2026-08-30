CREATE TABLE post_interviews ( id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id),
  original_title TEXT NOT NULL, original_body TEXT,
  questions_json TEXT NOT NULL, answers_json TEXT NOT NULL,
  synthesis_json TEXT, model TEXT, created_at TEXT NOT NULL );
CREATE INDEX idx_post_interviews_post ON post_interviews(post_id);
