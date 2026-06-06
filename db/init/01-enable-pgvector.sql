-- Runs once when the Postgres data volume is first initialized
-- (docker-entrypoint-initdb.d). Ensures the pgvector extension exists before
-- migrations run, so knowledge_blocks.embedding and vector search are available.
CREATE EXTENSION IF NOT EXISTS vector;
