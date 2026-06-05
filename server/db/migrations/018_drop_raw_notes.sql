-- Source-first cleanup (#123): drop the legacy raw_notes layer.
--
-- Prerequisite: migration 017 has backfilled a raw_source (and chunk) for every
-- raw_note and set raw_notes.raw_source_id. Run this only after that backfill is
-- validated in the target database — it is irreversible.

-- 1. Repoint legacy evidence links from raw notes to their raw source.
update evidence_links
set source_type = 'raw_source',
    source_id = raw_notes.raw_source_id
from raw_notes
where evidence_links.source_type = 'raw_note'
  and evidence_links.source_id = raw_notes.id
  and raw_notes.raw_source_id is not null;

-- Any evidence link still pointing at a raw note (no backfilled source) is dropped.
delete from evidence_links
where source_type = 'raw_note';

-- 2. Repoint legacy concept-index entries from raw notes to raw sources.
--    Drop entries that would collide with an existing raw_source entry first
--    (concept_index is unique on concept_id, target_type, target_id, relation_type).
delete from concept_index ci
using raw_notes
where ci.target_type = 'raw_note'
  and ci.target_id = raw_notes.id
  and raw_notes.raw_source_id is not null
  and exists (
    select 1
    from concept_index other
    where other.concept_id = ci.concept_id
      and other.target_type = 'raw_source'
      and other.target_id = raw_notes.raw_source_id
      and other.relation_type = ci.relation_type
  );

update concept_index
set target_type = 'raw_source',
    target_id = raw_notes.raw_source_id
from raw_notes
where concept_index.target_type = 'raw_note'
  and concept_index.target_id = raw_notes.id
  and raw_notes.raw_source_id is not null;

delete from concept_index
where target_type = 'raw_note';

-- 3. Drop the proposal -> raw_note foreign key column (proposals are source-backed).
alter table update_proposals
  drop column if exists raw_note_id;

-- 4. Drop the legacy raw_notes table.
drop table if exists raw_notes;
