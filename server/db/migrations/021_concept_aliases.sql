create table if not exists concept_aliases (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references concepts(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  source text not null default 'llm',
  confidence text not null default 'medium',
  created_at timestamptz not null default now(),
  unique (concept_id, normalized_alias)
);

create index if not exists concept_aliases_lookup_idx
  on concept_aliases (normalized_alias);
