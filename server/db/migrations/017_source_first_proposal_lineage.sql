alter table update_proposals
  add column raw_source_id uuid references raw_sources(id) on delete set null;

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
    source_role,
    title,
    body_markdown,
    jsonb_build_object('legacyRawNoteId', id, 'backfilledBy', '017_source_first_proposal_lineage'),
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
  raw_sources.id,
  0,
  raw_sources.title,
  raw_sources.body_markdown,
  greatest(1, ceil(length(raw_sources.body_markdown)::numeric / 4)::integer),
  jsonb_build_object('backfilledFrom', 'raw_notes', 'backfilledBy', '017_source_first_proposal_lineage')
from raw_sources
where not exists (
  select 1
  from raw_source_chunks
  where raw_source_chunks.raw_source_id = raw_sources.id
);

update raw_sources
set extracted_data = case
  when raw_sources.extracted_data = '{}'::jsonb then raw_notes.extracted_data
  else raw_sources.extracted_data || jsonb_build_object('legacyRawNoteExtractedData', raw_notes.extracted_data)
end
from raw_notes
where raw_notes.raw_source_id = raw_sources.id
  and raw_notes.extracted_data <> '{}'::jsonb
  and not (raw_sources.extracted_data @> raw_notes.extracted_data);

update update_proposals
set raw_source_id = raw_notes.raw_source_id
from raw_notes
where update_proposals.raw_source_id is null
  and update_proposals.raw_note_id = raw_notes.id
  and raw_notes.raw_source_id is not null;

update update_proposals
set raw_source_id = (proposal_items.payload ->> 'rawSourceId')::uuid
from proposal_items
where update_proposals.raw_source_id is null
  and proposal_items.proposal_id = update_proposals.id
  and proposal_items.action_type = 'keep_source_searchable'
  and proposal_items.payload ->> 'rawSourceId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from raw_sources
    where raw_sources.id = (proposal_items.payload ->> 'rawSourceId')::uuid
  );

update proposal_items
set payload = jsonb_set(
  proposal_items.payload,
  '{rawSourceId}',
  to_jsonb(update_proposals.raw_source_id::text),
  true
)
from update_proposals
where proposal_items.proposal_id = update_proposals.id
  and proposal_items.action_type = 'keep_source_searchable'
  and update_proposals.raw_source_id is not null
  and nullif(proposal_items.payload ->> 'rawSourceId', '') is null;

update proposal_items
set payload = jsonb_set(
  proposal_items.payload,
  '{rawNoteId}',
  to_jsonb(update_proposals.raw_note_id::text),
  true
)
from update_proposals
where proposal_items.proposal_id = update_proposals.id
  and proposal_items.action_type = 'keep_source_searchable'
  and update_proposals.raw_note_id is not null
  and nullif(proposal_items.payload ->> 'rawNoteId', '') is null;

create index update_proposals_raw_source_idx
  on update_proposals (raw_source_id, created_at desc);
