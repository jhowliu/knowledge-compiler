create table source_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  name text not null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table source_folders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references source_projects(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  name text not null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table raw_sources
  add column project_id uuid references source_projects(id) on delete set null,
  add column folder_id uuid references source_folders(id) on delete set null;

with default_project as (
  insert into source_projects (name, metadata)
  values ('Default project', jsonb_build_object('system', 'default'))
  returning id
)
update raw_sources
set project_id = default_project.id
from default_project
where raw_sources.project_id is null;

create index source_projects_user_idx on source_projects (user_id, sort_order, created_at);
create index source_folders_project_idx on source_folders (project_id, sort_order, created_at);
create index raw_sources_project_idx on raw_sources (project_id, created_at desc);
create index raw_sources_folder_idx on raw_sources (folder_id, created_at desc);
