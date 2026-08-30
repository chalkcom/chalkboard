-- Demo data for a fresh Chalkboard install. Apply after migrations:
--   wrangler d1 execute feedback --remote --file=./seed.sql
-- or locally via `pnpm db:seed`. Idempotent (INSERT OR IGNORE), so
-- re-running is safe. (Skip in production; it only makes the board look
-- lived-in.)

INSERT OR IGNORE INTO users (id, external_id, email, name, role, source, created_at) VALUES
  ('seeduser00000001', 'seed-tessa',  'tessa@demo.example',  'Tessa M.',  'member', 'sso', '2026-05-04T09:12:00.000Z'),
  ('seeduser00000002', 'seed-arun',   'arun@demo.example',   'Arun P.',   'member', 'sso', '2026-05-11T14:03:00.000Z'),
  ('seeduser00000003', 'seed-lena',   'lena@demo.example',   'Lena K.',   'member', 'sso', '2026-05-20T18:44:00.000Z'),
  ('seeduser00000004', 'seed-marco',  'marco@demo.example',  'Marco R.',  'member', 'sso', '2026-06-02T08:20:00.000Z'),
  ('seeduser00000005', 'seed-staff',  'team@demo.example',   'The Team',  'staff',  'sso', '2026-05-01T00:00:00.000Z');

INSERT OR IGNORE INTO posts (id, board_id, title, body, status, slug, author_id, vote_count, vote_offset, comment_count, source, topic, created_at, updated_at, status_changed_at) VALUES
  ('seedpost00000001', 'b0000000feature0', 'Export orders as CSV',
   'We reconcile in a spreadsheet every Monday. A one-click **CSV export** of the order list (with the current filters applied) would save us an hour a week.',
   'in_progress', 'export-orders-as-csv', 'seeduser00000001', 4, 0, 2, 'board', 'reports', '2026-05-04T09:15:00.000Z', '2026-06-20T10:00:00.000Z', '2026-06-20T10:00:00.000Z'),
  ('seedpost00000002', 'b0000000feature0', 'Dark mode for the dashboard',
   'Working evening shifts, the white dashboard is blinding. Please add a dark theme toggle.',
   'planned', 'dark-mode-for-the-dashboard', 'seeduser00000002', 3, 0, 1, 'board', NULL, '2026-05-11T14:10:00.000Z', '2026-06-01T09:00:00.000Z', '2026-06-01T09:00:00.000Z'),
  ('seedpost00000003', 'b0000000feature0', 'Bulk edit menu items',
   'Updating prices item by item is painful. Let me select multiple items and change price/category/availability at once.',
   'open', 'bulk-edit-menu-items', 'seeduser00000003', 5, 2, 1, 'embed', 'menu', '2026-05-20T18:50:00.000Z', '2026-05-20T18:50:00.000Z', NULL),
  ('seedpost00000004', 'b0000000feature0', 'Table QR codes with per-table context',
   'Generate QR codes per table so orders arrive tagged with the table number.',
   'complete', 'table-qr-codes-with-per-table-context', 'seeduser00000004', 6, 3, 1, 'board', 'ordering', '2026-05-25T11:00:00.000Z', '2026-07-15T16:30:00.000Z', '2026-07-15T16:30:00.000Z'),
  ('seedpost00000005', 'b0000000feature0', 'Weekly sales email digest',
   'A Monday morning email with last week''s totals, top items and busiest hours.',
   'under_review', 'weekly-sales-email-digest', 'seeduser00000001', 2, 0, 0, 'board', 'reports', '2026-06-08T07:45:00.000Z', '2026-06-12T12:00:00.000Z', '2026-06-12T12:00:00.000Z'),
  ('seedpost00000006', 'b0000000feature0', 'Integrate with Xero',
   'Push daily totals into Xero automatically. We currently re-key everything.',
   'open', 'integrate-with-xero', 'seeduser00000002', 3, 1, 0, 'embed', 'integrations', '2026-06-15T13:30:00.000Z', '2026-06-15T13:30:00.000Z', NULL),
  ('seedpost00000007', 'b0000000feature0', 'Customer-facing order status page',
   'A link customers can open to see "preparing → ready" without asking staff.',
   'open', 'customer-facing-order-status-page', 'seeduser00000003', 1, 0, 0, 'board', 'ordering', '2026-07-01T10:20:00.000Z', '2026-07-01T10:20:00.000Z', NULL),
  ('seedpost00000008', 'b0000000feature0', 'Printable allergen matrix',
   'Environmental health asked for an allergen table per menu. Generating it from item data would be a lifesaver.',
   'closed', 'printable-allergen-matrix', 'seeduser00000004', 1, 0, 1, 'board', 'menu', '2026-06-20T09:05:00.000Z', '2026-07-02T09:00:00.000Z', '2026-07-02T09:00:00.000Z');

INSERT OR IGNORE INTO votes (post_id, user_id, created_at) VALUES
  ('seedpost00000001', 'seeduser00000001', '2026-05-04T09:15:01.000Z'),
  ('seedpost00000001', 'seeduser00000002', '2026-05-05T10:00:00.000Z'),
  ('seedpost00000001', 'seeduser00000003', '2026-05-06T11:00:00.000Z'),
  ('seedpost00000001', 'seeduser00000004', '2026-05-07T12:00:00.000Z'),
  ('seedpost00000002', 'seeduser00000002', '2026-05-11T14:10:01.000Z'),
  ('seedpost00000002', 'seeduser00000003', '2026-05-12T09:00:00.000Z'),
  ('seedpost00000002', 'seeduser00000004', '2026-05-13T09:30:00.000Z'),
  ('seedpost00000003', 'seeduser00000001', '2026-05-21T08:00:00.000Z'),
  ('seedpost00000003', 'seeduser00000003', '2026-05-20T18:50:01.000Z'),
  ('seedpost00000003', 'seeduser00000004', '2026-05-22T19:00:00.000Z'),
  ('seedpost00000004', 'seeduser00000001', '2026-05-26T09:00:00.000Z'),
  ('seedpost00000004', 'seeduser00000002', '2026-05-27T09:00:00.000Z'),
  ('seedpost00000004', 'seeduser00000004', '2026-05-25T11:00:01.000Z'),
  ('seedpost00000005', 'seeduser00000001', '2026-06-08T07:45:01.000Z'),
  ('seedpost00000005', 'seeduser00000003', '2026-06-09T08:00:00.000Z'),
  ('seedpost00000006', 'seeduser00000002', '2026-06-15T13:30:01.000Z'),
  ('seedpost00000006', 'seeduser00000001', '2026-06-16T10:00:00.000Z'),
  ('seedpost00000007', 'seeduser00000003', '2026-07-01T10:20:01.000Z'),
  ('seedpost00000008', 'seeduser00000004', '2026-06-20T09:05:01.000Z');

INSERT OR IGNORE INTO comments (id, post_id, parent_id, author_id, body, is_team, created_at, updated_at) VALUES
  ('seedcmnt00000001', 'seedpost00000001', NULL, 'seeduser00000005',
   'Started on this — first cut exports the filtered list with totals. Anything else you need in the file?', 1,
   '2026-06-20T10:05:00.000Z', '2026-06-20T10:05:00.000Z'),
  ('seedcmnt00000002', 'seedpost00000001', 'seedcmnt00000001', 'seeduser00000001',
   'Payment method per order would be perfect for reconciliation.', 0,
   '2026-06-20T12:30:00.000Z', '2026-06-20T12:30:00.000Z'),
  ('seedcmnt00000003', 'seedpost00000002', NULL, 'seeduser00000005',
   'Scheduled for next quarter alongside the design refresh.', 1,
   '2026-06-01T09:05:00.000Z', '2026-06-01T09:05:00.000Z'),
  ('seedcmnt00000004', 'seedpost00000003', NULL, 'seeduser00000004',
   'Also useful for 86-ing items during a rush.', 0,
   '2026-05-23T20:10:00.000Z', '2026-05-23T20:10:00.000Z'),
  ('seedcmnt00000005', 'seedpost00000004', NULL, 'seeduser00000005',
   'Shipped! Print your codes from Settings → Tables.', 1,
   '2026-07-15T16:35:00.000Z', '2026-07-15T16:35:00.000Z'),
  ('seedcmnt00000006', 'seedpost00000008', NULL, 'seeduser00000005',
   'Closing in favour of the compliance pack we announced — allergen matrix is included there.', 1,
   '2026-07-02T09:01:00.000Z', '2026-07-02T09:01:00.000Z');

INSERT OR IGNORE INTO tags (id, name, color, is_private, created_at) VALUES
  ('seedtag000000001', 'quick win', '#10b981', 0, '2026-05-01T00:00:00.000Z'),
  ('seedtag000000002', 'needs design', '#f59e0b', 0, '2026-05-01T00:00:00.000Z'),
  ('seedtag000000003', 'churn risk', '#ef4444', 1, '2026-05-01T00:00:00.000Z');

INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES
  ('seedpost00000001', 'seedtag000000001'),
  ('seedpost00000002', 'seedtag000000002'),
  ('seedpost00000003', 'seedtag000000002'),
  ('seedpost00000006', 'seedtag000000003');
