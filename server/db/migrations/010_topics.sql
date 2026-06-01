create table topics (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id) on delete cascade,
  name       text not null,
  color      text,
  created_at timestamptz not null default now()
);

create unique index topics_user_name_unique_idx
  on topics (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table source_topics (
  source_id  uuid not null references raw_sources(id) on delete cascade,
  topic_id   uuid not null references topics(id) on delete cascade,
  primary key (source_id, topic_id)
);

create table block_topics (
  block_id   uuid not null references knowledge_blocks(id) on delete cascade,
  topic_id   uuid not null references topics(id) on delete cascade,
  confidence text not null default 'high' check (confidence in ('high', 'medium', 'low')),
  source     text not null default 'user' check (source in ('user', 'llm')),
  primary key (block_id, topic_id)
);

-- migrate existing domain values to topic rows
insert into topics (user_id, name)
select user_id, min(domain) as name
from (
  select user_id, domain from raw_sources where domain is not null
  union
  select user_id, domain from compiled_notes where domain is not null
  union
  select user_id, domain from knowledge_sources where domain is not null
) existing_domains
group by user_id, lower(domain)
on conflict do nothing;

insert into source_topics (source_id, topic_id)
select rs.id, t.id
from raw_sources rs
join topics t
  on t.user_id is not distinct from rs.user_id
 and lower(t.name) = lower(rs.domain)
where rs.domain is not null;

insert into block_topics (block_id, topic_id, confidence, source)
select kb.id, t.id, 'high', 'user'
from knowledge_blocks kb
join knowledge_sources ks on ks.id = kb.knowledge_source_id
join topics t
  on t.user_id is not distinct from ks.user_id
 and lower(t.name) = lower(ks.domain)
where ks.domain is not null
on conflict do nothing;

-- compiled_notes.domain is NOT NULL in migration 001; make nullable now
-- (raw_sources.domain was already nullable; knowledge_blocks has no domain column)
alter table compiled_notes alter column domain drop not null;
alter table knowledge_sources alter column domain drop not null;

create index topics_user_idx on topics (user_id, created_at);
create index source_topics_source_idx on source_topics (source_id);
create index source_topics_topic_idx on source_topics (topic_id);
create index block_topics_block_idx on block_topics (block_id);
create index block_topics_topic_idx on block_topics (topic_id);
