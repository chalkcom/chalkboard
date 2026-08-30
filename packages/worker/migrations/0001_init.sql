CREATE TABLE users ( id TEXT PRIMARY KEY, external_id TEXT UNIQUE, email TEXT, name TEXT,
  account_id TEXT, account_name TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','staff')),
  source TEXT NOT NULL DEFAULT 'sso', external_ref TEXT UNIQUE,
  created_at TEXT NOT NULL, last_seen_at TEXT );
CREATE INDEX idx_users_email ON users(email);
CREATE TABLE boards ( id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  description TEXT, is_public INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL );
CREATE TABLE posts ( id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id),
  title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','planned','in_progress','complete','closed')),
  slug TEXT NOT NULL UNIQUE, author_id TEXT REFERENCES users(id),
  vote_count INTEGER NOT NULL DEFAULT 0, vote_offset INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0,
  merged_into_id TEXT REFERENCES posts(id), source TEXT NOT NULL DEFAULT 'board',
  topic TEXT, locale TEXT, external_ref TEXT UNIQUE,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status_changed_at TEXT, deleted_at TEXT );
CREATE INDEX idx_posts_board_status ON posts(board_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_posts_topic ON posts(topic) WHERE deleted_at IS NULL AND merged_into_id IS NULL;
CREATE INDEX idx_posts_top ON posts(vote_count DESC, id);
CREATE INDEX idx_posts_new ON posts(created_at DESC, id);
CREATE INDEX idx_posts_merged ON posts(merged_into_id);
CREATE TABLE votes ( post_id TEXT NOT NULL REFERENCES posts(id), user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, PRIMARY KEY (post_id, user_id) );
CREATE INDEX idx_votes_user ON votes(user_id);
CREATE TABLE comments ( id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id),
  parent_id TEXT REFERENCES comments(id), author_id TEXT REFERENCES users(id), body TEXT NOT NULL,
  is_team INTEGER NOT NULL DEFAULT 0, external_ref TEXT UNIQUE,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT );
CREATE INDEX idx_comments_post ON comments(post_id, created_at);
CREATE TABLE tags ( id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, color TEXT,
  is_private INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL );
CREATE TABLE post_tags ( post_id TEXT NOT NULL REFERENCES posts(id), tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (post_id, tag_id) );
CREATE INDEX idx_post_tags_tag ON post_tags(tag_id);
CREATE TABLE events ( id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, source TEXT, topic TEXT,
  post_id TEXT, user_id TEXT, session_id TEXT, url TEXT, created_at TEXT NOT NULL );
CREATE INDEX idx_events_type_time ON events(type, created_at);
CREATE TABLE config ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
CREATE VIRTUAL TABLE posts_fts USING fts5(post_id UNINDEXED, title, body, tokenize='porter unicode61');
CREATE TRIGGER posts_fts_ai AFTER INSERT ON posts BEGIN
  INSERT INTO posts_fts(post_id, title, body) VALUES (new.id, new.title, new.body); END;
CREATE TRIGGER posts_fts_au AFTER UPDATE OF title, body ON posts BEGIN
  DELETE FROM posts_fts WHERE post_id = old.id;
  INSERT INTO posts_fts(post_id, title, body) VALUES (new.id, new.title, new.body); END;
CREATE TRIGGER posts_fts_ad AFTER DELETE ON posts BEGIN
  DELETE FROM posts_fts WHERE post_id = old.id; END;
