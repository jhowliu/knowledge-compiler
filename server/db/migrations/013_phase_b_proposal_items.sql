alter table proposal_items
  add column source_spans jsonb,
  add column conflict_detected boolean not null default false,
  add column conflict_summary text,
  add column conflict_resolution text check (
    conflict_resolution in ('update', 'keep_both', 'needs_user_decision')
  ),
  add column eval_verdict text check (eval_verdict in ('pass', 'warn', 'fail')),
  add column incomplete_reasoning boolean not null default false;
