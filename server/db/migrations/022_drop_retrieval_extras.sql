-- Retrieval is plain Postgres full-text + concept ranking. Drop the optional
-- pgvector embeddings and ParadeDB BM25 index added by migrations 015/019/020.
drop index if exists knowledge_blocks_bm25_idx;
drop index if exists knowledge_blocks_embedding_idx;
drop index if exists raw_source_chunks_embedding_idx;

alter table knowledge_blocks drop column if exists embedding;
alter table raw_source_chunks drop column if exists embedding;

drop extension if exists pg_search;
drop extension if exists vector;
