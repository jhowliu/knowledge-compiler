alter table note_links
  add column if not exists status text not null default 'approved',
  add column if not exists rationale text,
  add column if not exists created_by_agent_run_id uuid references agent_runs(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists note_links_unique_relation_idx
  on note_links (
    source_note_type,
    source_note_id,
    target_note_type,
    target_note_id,
    relation_type
  );

create index if not exists note_links_source_status_idx
  on note_links (source_note_type, source_note_id, status, updated_at desc);

create index if not exists note_links_target_status_idx
  on note_links (target_note_type, target_note_id, status, updated_at desc);
