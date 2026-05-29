create table raw_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  domain text,
  source_type text not null default 'markdown',
  source_role text not null default 'personal_note',
  title text,
  body_markdown text not null,
  metadata jsonb not null default '{}'::jsonb,
  extracted_data jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(domain, '') || ' ' || source_role || ' ' || body_markdown
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raw_sources_source_role_check check (source_role in ('reference', 'personal_note'))
);

create table raw_source_chunks (
  id uuid primary key default gen_random_uuid(),
  raw_source_id uuid not null references raw_sources(id) on delete cascade,
  chunk_index integer not null,
  heading text,
  body_markdown text not null,
  token_estimate integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (raw_source_id, chunk_index)
);

alter table raw_notes
  add column raw_source_id uuid references raw_sources(id) on delete set null,
  add column source_role text not null default 'personal_note',
  add constraint raw_notes_source_role_check check (source_role in ('reference', 'personal_note'));

with created_sources as (
  insert into raw_sources (
    user_id,
    domain,
    source_type,
    source_role,
    title,
    body_markdown,
    metadata,
    extracted_data,
    created_at,
    updated_at
  )
  select
    user_id,
    domain,
    source_type,
    'personal_note',
    title,
    body_markdown,
    jsonb_build_object('legacyRawNoteId', id),
    extracted_data,
    created_at,
    created_at
  from raw_notes
  where raw_source_id is null
  returning id, metadata
)
update raw_notes
set raw_source_id = created_sources.id
from created_sources
where created_sources.metadata ->> 'legacyRawNoteId' = raw_notes.id::text;

insert into raw_source_chunks (
  raw_source_id,
  chunk_index,
  heading,
  body_markdown,
  token_estimate,
  metadata
)
select
  id,
  0,
  title,
  body_markdown,
  greatest(1, ceil(length(body_markdown)::numeric / 4)::integer),
  jsonb_build_object('backfilledFrom', 'raw_notes')
from raw_sources
where not exists (
  select 1
  from raw_source_chunks
  where raw_source_chunks.raw_source_id = raw_sources.id
);

create index raw_sources_user_created_idx on raw_sources (user_id, created_at desc);
create index raw_sources_role_idx on raw_sources (user_id, source_role, created_at desc);
create index raw_sources_search_idx on raw_sources using gin (search_vector);
create index raw_source_chunks_source_idx on raw_source_chunks (raw_source_id, chunk_index);
create index raw_notes_raw_source_idx on raw_notes (raw_source_id);
