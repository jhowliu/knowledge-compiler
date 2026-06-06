-- Make the source tier retrievable (#143): index raw_source_chunks for
-- full-text + vector search, mirroring knowledge_blocks. Knowledge stays the
-- canonical corpus; sources become searchable (knowledge-first in /search).

alter table raw_source_chunks
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('english', coalesce(heading, '') || ' ' || body_markdown)
  ) stored;

create index if not exists raw_source_chunks_search_idx
  on raw_source_chunks using gin (search_vector);

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'vector') then
    create extension if not exists vector;
  else
    raise notice 'pgvector not installed; skipping raw_source_chunks.embedding setup';
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute 'alter table raw_source_chunks add column if not exists embedding vector(1536)';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'raw_source_chunks'
      and column_name = 'embedding'
  ) then
    execute 'create index if not exists raw_source_chunks_embedding_idx on raw_source_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100)';
  end if;
end $$;
