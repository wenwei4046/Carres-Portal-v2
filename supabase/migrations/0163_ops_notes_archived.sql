-- Migration 0163 — ops_notes.archived (Google-Keep-style archive)
-- Keep notes can be archived (hidden from the main list) instead of deleted.
alter table ops_notes add column if not exists archived boolean not null default false;
create index if not exists ops_notes_archived_idx on ops_notes (author_id, archived, pinned desc, updated_at desc);
