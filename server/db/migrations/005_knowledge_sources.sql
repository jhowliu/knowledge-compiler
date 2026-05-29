create table knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  domain text not null,
  knowledge_type text not null,
  title text not null,
  status text not null default 'active',
  current_version_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  knowledge_source_id uuid not null references knowledge_sources(id) on delete cascade,
  compiled_note_id uuid references compiled_notes(id) on delete set null,
  proposal_id uuid references update_proposals(id) on delete set null,
  version_number integer not null,
  title text not null,
  body_markdown text not null default '',
  structured_data jsonb not null default '{}'::jsonb,
  change_summary text,
  created_at timestamptz not null default now(),
  unique (knowledge_source_id, version_number)
);

alter table knowledge_sources
  add constraint knowledge_sources_current_version_fk
  foreign key (current_version_id)
  references knowledge_versions(id)
  on delete set null;

create table knowledge_blocks (
  id uuid primary key default gen_random_uuid(),
  knowledge_source_id uuid not null references knowledge_sources(id) on delete cascade,
  knowledge_version_id uuid not null references knowledge_versions(id) on delete cascade,
  block_index integer not null,
  heading text,
  body_markdown text not null,
  token_estimate integer not null default 0,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(heading, '') || ' ' || body_markdown
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (knowledge_version_id, block_index)
);

create index knowledge_sources_lookup_idx on knowledge_sources (user_id, domain, knowledge_type, lower(title));
create index knowledge_sources_current_idx on knowledge_sources (user_id, status, updated_at desc);
create index knowledge_versions_source_idx on knowledge_versions (knowledge_source_id, version_number desc);
create index knowledge_blocks_active_idx on knowledge_blocks (knowledge_source_id, status, updated_at desc);
create index knowledge_blocks_search_idx on knowledge_blocks using gin (search_vector);

with inserted_sources as (
  insert into knowledge_sources (
    user_id,
    domain,
    knowledge_type,
    title,
    metadata,
    created_at,
    updated_at
  )
  select
    user_id,
    domain,
    note_type,
    title,
    jsonb_build_object('backfilledFrom', 'compiled_notes', 'compiledNoteId', id),
    created_at,
    updated_at
  from compiled_notes
  where status = 'active'
  returning id, metadata
),
inserted_versions as (
  insert into knowledge_versions (
    knowledge_source_id,
    compiled_note_id,
    proposal_id,
    version_number,
    title,
    body_markdown,
    structured_data,
    change_summary,
    created_at
  )
  select
    inserted_sources.id,
    compiled_notes.id,
    null,
    1,
    compiled_notes.title,
    compiled_notes.body_markdown,
    compiled_notes.structured_data,
    'Backfilled from compiled note.',
    compiled_notes.updated_at
  from inserted_sources
  join compiled_notes on compiled_notes.id = (inserted_sources.metadata ->> 'compiledNoteId')::uuid
  returning id, knowledge_source_id, body_markdown, title, created_at
)
update knowledge_sources
set current_version_id = inserted_versions.id
from inserted_versions
where knowledge_sources.id = inserted_versions.knowledge_source_id;

insert into knowledge_blocks (
  knowledge_source_id,
  knowledge_version_id,
  block_index,
  heading,
  body_markdown,
  token_estimate,
  metadata,
  created_at,
  updated_at
)
select
  knowledge_sources.id,
  knowledge_versions.id,
  0,
  knowledge_versions.title,
  knowledge_versions.body_markdown,
  greatest(1, ceil(length(knowledge_versions.body_markdown)::numeric / 4)::integer),
  jsonb_build_object('backfilledFrom', 'compiled_notes'),
  knowledge_versions.created_at,
  knowledge_versions.created_at
from knowledge_sources
join knowledge_versions on knowledge_versions.id = knowledge_sources.current_version_id
where not exists (
  select 1
  from knowledge_blocks
  where knowledge_blocks.knowledge_version_id = knowledge_versions.id
);
