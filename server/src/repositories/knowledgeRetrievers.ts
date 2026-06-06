import { env } from "../config/env.js";
import { query } from "../db/postgres.js";
import type {
  RetrievalCandidate,
  RetrievalCandidateSet,
  RetrievalQuery,
  RetrievalSource,
  Retriever,
} from "../services/retrieval/retrieval.types.js";

type RetrievalCandidateRow = {
  block_id: string;
  rank_position: number | string;
  score: number | string | null;
};

export type Bm25SupportStatus =
  | { enabled: true }
  | { enabled: false; reason: "missing_pg_search_extension" | "missing_bm25_index" };

function vectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toString()).join(",")}]`;
}

function candidateSet(input: {
  source: RetrievalSource;
  status?: RetrievalCandidateSet["status"];
  reason?: string;
  candidates?: RetrievalCandidate[];
}): RetrievalCandidateSet {
  return {
    source: input.source,
    status: input.status ?? "enabled",
    reason: input.reason,
    candidates: input.candidates ?? [],
  };
}

function mapRetrievalCandidate(source: RetrievalSource, row: RetrievalCandidateRow): RetrievalCandidate {
  const candidate: RetrievalCandidate = {
    blockId: row.block_id,
    source,
    rankPosition: Number(row.rank_position),
  };
  if (row.score !== null) {
    return { ...candidate, score: Number(row.score) };
  }
  return candidate;
}

export class PostgresFtsRetriever implements Retriever {
  readonly source = "fts" as const;

  async search(input: RetrievalQuery): Promise<RetrievalCandidateSet> {
    const result = await query<RetrievalCandidateRow>(
      `
        with query as (
          select plainto_tsquery('english', $1) as ts_query
        )
        select
          knowledge_blocks.id as block_id,
          row_number() over (
            order by ts_rank(knowledge_blocks.search_vector, query.ts_query) desc,
                     knowledge_blocks.updated_at desc
          ) as rank_position,
          ts_rank(knowledge_blocks.search_vector, query.ts_query) as score
        from knowledge_blocks
        cross join query
        where knowledge_blocks.search_vector @@ query.ts_query
      `,
      [input.query],
    );

    return candidateSet({
      source: this.source,
      candidates: result.rows.map((row) => mapRetrievalCandidate(this.source, row)),
    });
  }
}

export class PostgresConceptRetriever implements Retriever {
  readonly source = "concept" as const;

  async search(input: RetrievalQuery): Promise<RetrievalCandidateSet> {
    if (!input.resolvedConceptIds?.length) {
      return candidateSet({
        source: this.source,
        status: "disabled",
        reason: "no_resolved_concepts",
      });
    }

    const result = await query<RetrievalCandidateRow>(
      `
        with concept_matches as (
          select
            knowledge_blocks.id as block_id,
            max(
              case concept_index.confidence
                when 'high' then 3
                when 'medium' then 2
                else 1
              end
            ) as score,
            max(knowledge_blocks.updated_at) as updated_at
          from knowledge_blocks
          join knowledge_versions on knowledge_versions.id = knowledge_blocks.knowledge_version_id
          join concept_index
            on concept_index.target_type = 'compiled_note'
           and concept_index.target_id = knowledge_versions.compiled_note_id
          where knowledge_versions.compiled_note_id is not null
            and concept_index.concept_id = any($1::uuid[])
          group by knowledge_blocks.id
        )
        select
          block_id,
          row_number() over (
            order by score desc,
                     updated_at desc
          ) as rank_position,
          score
        from concept_matches
      `,
      [input.resolvedConceptIds],
    );

    return candidateSet({
      source: this.source,
      candidates: result.rows.map((row) => mapRetrievalCandidate(this.source, row)),
    });
  }
}

export class PostgresPgVectorRetriever implements Retriever {
  readonly source = "vector" as const;

  constructor(private readonly hasEmbeddingSupport: () => Promise<boolean>) {}

  async search(input: RetrievalQuery): Promise<RetrievalCandidateSet> {
    if (!input.queryEmbedding?.length) {
      return candidateSet({
        source: this.source,
        status: "disabled",
        reason: "missing_query_embedding",
      });
    }
    if (!(await this.hasEmbeddingSupport())) {
      return candidateSet({
        source: this.source,
        status: "disabled",
        reason: "missing_embedding_column",
      });
    }

    const result = await query<RetrievalCandidateRow>(
      `
        with query as (
          select $1::vector as query_embedding
        )
        select
          knowledge_blocks.id as block_id,
          row_number() over (
            order by knowledge_blocks.embedding <=> query.query_embedding,
                     knowledge_blocks.updated_at desc
          ) as rank_position,
          knowledge_blocks.embedding <=> query.query_embedding as score
        from knowledge_blocks
        cross join query
        where knowledge_blocks.embedding is not null
          and (knowledge_blocks.embedding <=> query.query_embedding) < $2::float8
      `,
      [vectorLiteral(input.queryEmbedding), env.VECTOR_MAX_DISTANCE],
    );

    return candidateSet({
      source: this.source,
      candidates: result.rows.map((row) => mapRetrievalCandidate(this.source, row)),
    });
  }
}

export class PostgresBm25Retriever implements Retriever {
  readonly source = "bm25" as const;

  constructor(private readonly getBm25Support: () => Promise<Bm25SupportStatus>) {}

  async search(input: RetrievalQuery): Promise<RetrievalCandidateSet> {
    const support = await this.getBm25Support();
    if (!support.enabled) {
      return candidateSet({
        source: this.source,
        status: "disabled",
        reason: support.reason,
      });
    }

    const candidateLimit = Math.max(input.limit * 8, 50);
    const result = await query<RetrievalCandidateRow>(
      `
        with bm25_matches as (
          select
            knowledge_blocks.id as block_id,
            pdb.score(knowledge_blocks.id) as score,
            knowledge_blocks.updated_at
          from knowledge_blocks
          where knowledge_blocks.heading ||| $1
             or knowledge_blocks.body_markdown ||| $1
          order by score desc, knowledge_blocks.updated_at desc
          limit $2
        )
        select
          block_id,
          row_number() over (
            order by score desc,
                     updated_at desc
          ) as rank_position,
          score
        from bm25_matches
      `,
      [input.query, candidateLimit],
    );

    return candidateSet({
      source: this.source,
      candidates: result.rows.map((row) => mapRetrievalCandidate(this.source, row)),
    });
  }
}
