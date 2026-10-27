-- Sources are a flat list: drop user-defined topics and the project/folder
-- tree that organized them.
drop table if exists block_topics;
drop table if exists source_topics;
drop table if exists topics;

alter table raw_sources
  drop column if exists folder_id,
  drop column if exists project_id;

drop table if exists source_folders;
drop table if exists source_projects;
