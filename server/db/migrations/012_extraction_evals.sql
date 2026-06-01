create table extraction_evals (
  id               uuid primary key default gen_random_uuid(),
  agent_run_id     uuid not null references agent_runs(id) on delete cascade,
  source_id        uuid not null references raw_sources(id) on delete cascade,
  verdict          text not null check (verdict in ('pass', 'warn', 'fail')),
  coverage_score   numeric(4, 3),
  grounding_score  numeric(4, 3),
  warnings         jsonb,
  raw_judge_output jsonb,
  created_at       timestamptz not null default now()
);

create index extraction_evals_agent_run_idx on extraction_evals (agent_run_id);
create index extraction_evals_source_idx on extraction_evals (source_id);
