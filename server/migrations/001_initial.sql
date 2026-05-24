create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table raw_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  domain text,
  source_type text not null default 'manual',
  title text,
  body_markdown text not null,
  extracted_data jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(domain, '') || ' ' || body_markdown
    )
  ) stored,
  created_at timestamptz not null default now()
);

create table compiled_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  domain text not null,
  note_type text not null,
  title text not null,
  body_markdown text not null default '',
  structured_data jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  search_vector tsvector generated always as (
    to_tsvector(
      'english',
      title || ' ' || domain || ' ' || note_type || ' ' || body_markdown
    )
  ) stored,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table note_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  source_note_type text not null,
  source_note_id uuid not null,
  target_note_type text not null,
  target_note_id uuid not null,
  relation_type text not null,
  confidence text not null default 'medium',
  created_at timestamptz not null default now()
);

create table concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  concept_type text not null,
  created_at timestamptz not null default now(),
  unique (user_id, normalized_name, concept_type)
);

create table concept_index (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  concept_id uuid not null references concepts(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  relation_type text not null,
  confidence text not null default 'medium',
  source text not null default 'llm',
  created_at timestamptz not null default now(),
  unique (concept_id, target_type, target_id, relation_type)
);

create table update_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  raw_note_id uuid references raw_notes(id) on delete set null,
  detected_domain text,
  detected_knowledge_type text,
  impact_level integer not null default 0,
  confidence text not null default 'medium',
  status text not null default 'pending',
  rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references update_proposals(id) on delete cascade,
  action_type text not null,
  target_type text,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  rationale text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table approval_decisions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references update_proposals(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  decision text not null,
  comment text,
  created_at timestamptz not null default now()
);

create table evidence_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  confidence text not null default 'medium',
  impact_level integer not null default 0,
  approval_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  domain text not null,
  category text,
  title text not null,
  description text not null default '',
  status text not null default 'active',
  evidence_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table review_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  domain text not null,
  title text not null,
  description text not null default '',
  status text not null default 'open',
  due_at timestamptz,
  source_type text,
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table readiness_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  domain text not null,
  area text not null,
  status text not null,
  rationale text,
  last_evidence_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, domain, area)
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  run_type text not null,
  status text not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table agent_run_events (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references agent_runs(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  session_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_key)
);

create table agent_messages (
  id uuid primary key default gen_random_uuid(),
  agent_session_id uuid not null references agent_sessions(id) on delete cascade,
  sequence_number integer not null,
  role text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (agent_session_id, sequence_number)
);

create table tool_calls (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid references agent_runs(id) on delete cascade,
  tool_name text not null,
  arguments jsonb not null default '{}'::jsonb,
  result jsonb,
  status text not null default 'started',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index raw_notes_user_created_idx on raw_notes (user_id, created_at desc);
create index raw_notes_search_idx on raw_notes using gin (search_vector);
create index compiled_notes_user_type_idx on compiled_notes (user_id, domain, note_type);
create index compiled_notes_search_idx on compiled_notes using gin (search_vector);
create index concepts_lookup_idx on concepts (user_id, normalized_name, concept_type);
create index concept_index_target_idx on concept_index (target_type, target_id);
create index update_proposals_status_idx on update_proposals (user_id, status, created_at desc);
create index review_tasks_status_idx on review_tasks (user_id, status, created_at desc);
create index readiness_items_lookup_idx on readiness_items (user_id, domain, status);
