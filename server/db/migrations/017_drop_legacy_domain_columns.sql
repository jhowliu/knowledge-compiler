drop index if exists raw_notes_search_idx;
alter table raw_notes drop column if exists search_vector;
alter table raw_notes
  add column search_vector tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || body_markdown)
  ) stored;
create index raw_notes_search_idx on raw_notes using gin (search_vector);

drop index if exists raw_sources_search_idx;
alter table raw_sources drop column if exists search_vector;
alter table raw_sources
  add column search_vector tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || source_role || ' ' || body_markdown
    )
  ) stored;
create index raw_sources_search_idx on raw_sources using gin (search_vector);

drop index if exists compiled_notes_search_idx;
drop index if exists compiled_notes_user_type_idx;
alter table compiled_notes drop column if exists search_vector;
alter table compiled_notes
  add column search_vector tsvector generated always as (
    to_tsvector('english', title || ' ' || note_type || ' ' || body_markdown)
  ) stored;
create index compiled_notes_search_idx on compiled_notes using gin (search_vector);
create index compiled_notes_user_type_idx on compiled_notes (user_id, note_type, lower(title));

drop index if exists knowledge_sources_lookup_idx;
create index knowledge_sources_lookup_idx
  on knowledge_sources (user_id, knowledge_type, lower(title));

alter table raw_sources drop column if exists domain;
alter table raw_notes drop column if exists domain;
alter table compiled_notes drop column if exists domain;
alter table knowledge_sources drop column if exists domain;
alter table knowledge_blocks drop column if exists domain;

drop type if exists interview_domain;
