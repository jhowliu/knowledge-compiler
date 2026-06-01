alter table agent_runs
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index agent_runs_indexer_prompt_version_idx
  on agent_runs ((metadata ->> 'indexer_prompt_version'));
