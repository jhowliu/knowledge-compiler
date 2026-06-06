do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_search') then
    create extension if not exists pg_search;
  else
    raise notice 'pg_search extension is not installed; skipping knowledge_blocks BM25 setup';
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_search') then
    execute '
      create index if not exists knowledge_blocks_bm25_idx
      on knowledge_blocks
      using bm25 (id, heading, body_markdown, status, updated_at)
      with (key_field = ''id'')
    ';
  end if;
end $$;
