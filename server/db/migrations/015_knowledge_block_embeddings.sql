do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'vector') then
    create extension if not exists vector;
  else
    raise notice 'pgvector extension is not installed; skipping knowledge_blocks.embedding setup';
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute 'alter table knowledge_blocks add column if not exists embedding vector(1536)';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'knowledge_blocks'
      and column_name = 'embedding'
  ) then
    execute 'create index if not exists knowledge_blocks_embedding_idx on knowledge_blocks using ivfflat (embedding vector_cosine_ops) with (lists = 100)';
  end if;
end $$;
