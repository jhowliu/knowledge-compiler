-- Runs once when the Postgres data volume is first initialized.
-- (docker-entrypoint-initdb.d). Enables retrieval extensions when the selected
-- Postgres image ships them. Migrations also probe capabilities, so local setup
-- remains readable if someone points the app at a plain Postgres instance.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
  ELSE
    RAISE NOTICE 'vector extension is not available; vector search will be disabled';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_search') THEN
    CREATE EXTENSION IF NOT EXISTS pg_search;
  ELSE
    RAISE NOTICE 'pg_search extension is not available; BM25 search will be disabled';
  END IF;
END $$;
