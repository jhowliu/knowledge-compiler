alter table agent_run_events
  add column category text,
  add column name text;

update agent_run_events
set category = case event_type
    when 'queued' then 'lifecycle'
    when 'retry_queued' then 'lifecycle'
    when 'retry_of' then 'lifecycle'
    when 'run_started' then 'lifecycle'
    when 'run_completed' then 'lifecycle'
    when 'run_failed' then 'lifecycle'
    when 'notes_loaded' then 'source'
    when 'raw_note_loaded' then 'source'
    when 'raw_source_loaded' then 'source'
    when 'tool_called' then 'tool'
    when 'tool_result' then 'tool'
    when 'classification_started' then 'indexing'
    when 'extraction_completed' then 'indexing'
    when 'react_loop_started' then 'indexing'
    when 'detection_completed' then 'indexing'
    when 'wiki_index_drafted' then 'indexing'
    when 'related_knowledge_found' then 'indexing'
    when 'related_notes_found' then 'indexing'
    when 'loop_exited' then 'indexing'
    when 'proposal_created' then 'proposal'
    when 'link_candidates_scored' then 'linking'
    when 'link_suggestion_created' then 'linking'
    else 'error'
  end,
  name = case event_type
    when 'queued' then 'queued'
    when 'retry_queued' then 'retry_queued'
    when 'retry_of' then 'retry_of'
    when 'run_started' then 'started'
    when 'run_completed' then 'completed'
    when 'run_failed' then 'failed'
    when 'notes_loaded' then 'notes_loaded'
    when 'raw_note_loaded' then 'raw_note_loaded'
    when 'raw_source_loaded' then 'raw_source_loaded'
    when 'tool_called' then 'called'
    when 'tool_result' then 'result'
    when 'classification_started' then 'classification_started'
    when 'extraction_completed' then 'extraction_completed'
    when 'react_loop_started' then 'react_loop_started'
    when 'detection_completed' then 'detected'
    when 'wiki_index_drafted' then 'drafted'
    when 'related_knowledge_found' then 'related_found'
    when 'related_notes_found' then 'related_found'
    when 'loop_exited' then 'loop_exited'
    when 'proposal_created' then 'created'
    when 'link_candidates_scored' then 'scored'
    when 'link_suggestion_created' then 'suggestion_created'
    else 'unknown'
  end;

alter table agent_run_events
  alter column category set not null,
  alter column name set not null;

alter table agent_runs
  add constraint agent_runs_status_check
  check (status in ('queued', 'running', 'completed', 'failed', 'cancelled'));

alter table agent_run_events
  add constraint agent_run_events_category_check
  check (category in ('lifecycle', 'source', 'tool', 'indexing', 'proposal', 'eval', 'linking', 'error'));

alter table agent_run_events
  drop column event_type;

create index agent_run_events_run_category_idx
  on agent_run_events (agent_run_id, category, created_at);
