import { query, transaction } from "../db/postgres.js";
import type {
  CreateRawSourceChunkInput,
  CreateRawSourceInput,
  RawSource,
  RawSourceChunk,
  RawSourceRole,
  SourceChunkSearchResult,
  RawSourceWithChunks,
  UpdateRawSourceInput,
} from "../domain/rawSource.js";

type RawSourceRow = {
  id: string;
  user_id: string | null;
  domain: string | null;
  subtype: string | null;
  source_type: string;
  source_role: RawSourceRole;
  title: string | null;
  body_markdown: string;
  metadata: Record<string, unknown>;
  extracted_data: unknown;
  created_at: Date;
  updated_at: Date;
};

type RawSourceChunkRow = {
  id: string;
  raw_source_id: string;
  chunk_index: number;
  heading: string | null;
  body_markdown: string;
  token_estimate: number;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export interface RawSourceRepository {
  create(input: CreateRawSourceInput, chunks: CreateRawSourceChunkInput[]): Promise<RawSourceWithChunks>;
  getById(id: string): Promise<RawSourceWithChunks | null>;
  listRecent(limit: number): Promise<RawSourceWithChunks[]>;
  update(
    id: string,
    input: UpdateRawSourceInput,
    chunks: CreateRawSourceChunkInput[],
  ): Promise<RawSourceWithChunks | null>;
  updateExtraction(id: string, extractedData: unknown): Promise<RawSourceWithChunks>;
  delete(id: string): Promise<boolean>;
  searchRawSourceChunks(input: {
    query: string;
    limit: number;
  }): Promise<SourceChunkSearchResult[]>;
}

function mapRawSource(row: RawSourceRow): RawSource {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
    subtype: row.subtype,
    sourceType: row.source_type,
    sourceRole: row.source_role,
    title: row.title,
    bodyMarkdown: row.body_markdown,
    metadata: row.metadata,
    extractedData: row.extracted_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRawSourceChunk(row: RawSourceChunkRow): RawSourceChunk {
  return {
    id: row.id,
    rawSourceId: row.raw_source_id,
    chunkIndex: row.chunk_index,
    heading: row.heading,
    bodyMarkdown: row.body_markdown,
    tokenEstimate: row.token_estimate,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export class PostgresRawSourceRepository implements RawSourceRepository {
  async create(input: CreateRawSourceInput, chunks: CreateRawSourceChunkInput[]) {
    return transaction(async (transactionQuery) => {
      const sourceResult = await transactionQuery<RawSourceRow>(
        `
          insert into raw_sources (
            user_id,
            subtype,
            source_type,
            source_role,
            title,
            body_markdown,
            metadata
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          returning *
        `,
        [
          input.userId ?? null,
          input.subtype ?? null,
          input.sourceType ?? "markdown",
          input.sourceRole ?? "personal_note",
          input.title ?? null,
          input.bodyMarkdown,
          input.metadata ?? {},
        ],
      );
      const sourceId = sourceResult.rows[0].id;
      const savedChunks = await insertChunks(transactionQuery, sourceId, chunks);
      return { ...mapRawSource(sourceResult.rows[0]), chunks: savedChunks };
    });
  }

  async getById(id: string) {
    const sourceResult = await query<RawSourceRow>(
      `
        select * from raw_sources where id = $1
      `,
      [id],
    );
    if (!sourceResult.rows[0]) {
      return null;
    }

    return {
      ...mapRawSource(sourceResult.rows[0]),
      chunks: await listChunks(id),
    };
  }

  async listRecent(limit: number) {
    const sourceResult = await query<RawSourceRow>(
      `
        select * from raw_sources
        order by created_at desc
        limit $1
      `,
      [limit],
    );

    const sources: RawSourceWithChunks[] = [];
    for (const row of sourceResult.rows) {
      sources.push({
        ...mapRawSource(row),
        chunks: await listChunks(row.id),
      });
    }
    return sources;
  }

  async update(id: string, input: UpdateRawSourceInput, chunks: CreateRawSourceChunkInput[]) {
    return transaction(async (transactionQuery) => {
      const currentResult = await transactionQuery<RawSourceRow>(
        "select * from raw_sources where id = $1",
        [id],
      );

      if (!currentResult.rows[0]) {
        return null;
      }

      const current = mapRawSource(currentResult.rows[0]);
      const sourceResult = await transactionQuery<RawSourceRow>(
        `
          update raw_sources
          set subtype = $2,
              source_type = $3,
              source_role = $4,
              title = $5,
              body_markdown = $6,
              metadata = $7,
              extracted_data = '{}'::jsonb,
              updated_at = now()
          where id = $1
          returning *
        `,
        [
          id,
          Object.hasOwn(input, "subtype") ? (input.subtype ?? null) : current.subtype,
          input.sourceType ?? "markdown",
          input.sourceRole ?? "personal_note",
          input.title ?? null,
          input.bodyMarkdown,
          input.metadata ?? {},
        ],
      );

      if (!sourceResult.rows[0]) {
        return null;
      }

      await transactionQuery("delete from raw_source_chunks where raw_source_id = $1", [id]);
      const savedChunks = await insertChunks(transactionQuery, id, chunks);
      return {
        ...mapRawSource(sourceResult.rows[0]),
        chunks: savedChunks,
      };
    });
  }

  async updateExtraction(id: string, extractedData: unknown) {
    const sourceResult = await query<RawSourceRow>(
      `
        update raw_sources
        set extracted_data = $2,
            updated_at = now()
        where id = $1
        returning *
      `,
      [id, extractedData],
    );

    if (!sourceResult.rows[0]) {
      throw new Error("Raw source not found");
    }

    return {
      ...mapRawSource(sourceResult.rows[0]),
      chunks: await listChunks(id),
    };
  }

  async delete(id: string) {
    const result = await query("delete from raw_sources where id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async searchRawSourceChunks(input: {
    query: string;
    limit: number;
  }): Promise<SourceChunkSearchResult[]> {
    const result = await query<SourceChunkSearchRow>(
      `
        with query as (
          select plainto_tsquery('english', $1) as ts_query
        ),
        fts_ranked as (
          select rsc.id,
            row_number() over (
              order by ts_rank(rsc.search_vector, query.ts_query) desc, rsc.created_at desc
            ) as rank_position
          from raw_source_chunks rsc
          cross join query
          where rsc.search_vector @@ query.ts_query
        ),
        merged as (
          select id, sum(1.0 / (60 + rank_position))::real as rank
          from fts_ranked
          group by id
        )
        select
          rsc.id as chunk_id,
          rsc.raw_source_id,
          rs.title,
          rsc.heading,
          rsc.body_markdown,
          rs.source_role,
          rsc.created_at,
          merged.rank
        from merged
        join raw_source_chunks rsc on rsc.id = merged.id
        join raw_sources rs on rs.id = rsc.raw_source_id
        order by merged.rank desc, rsc.created_at desc
        limit $2
      `,
      [input.query, input.limit],
    );

    return result.rows.map((row) => ({
      chunkId: row.chunk_id,
      rawSourceId: row.raw_source_id,
      title: row.title,
      heading: row.heading,
      bodyMarkdown: row.body_markdown,
      sourceRole: row.source_role,
      rank: row.rank,
      createdAt: row.created_at,
    }));
  }
}

type SourceChunkSearchRow = {
  chunk_id: string;
  raw_source_id: string;
  title: string | null;
  heading: string | null;
  body_markdown: string;
  source_role: string;
  created_at: Date;
  rank: number;
};


async function listChunks(rawSourceId: string) {
  const chunkResult = await query<RawSourceChunkRow>(
    `
      select *
      from raw_source_chunks
      where raw_source_id = $1
      order by chunk_index asc
    `,
    [rawSourceId],
  );
  return chunkResult.rows.map(mapRawSourceChunk);
}

async function insertChunks(
  executor: typeof query,
  rawSourceId: string,
  chunks: CreateRawSourceChunkInput[],
) {
  const savedChunks: RawSourceChunk[] = [];
  for (const chunk of chunks) {
    const chunkResult = await executor<RawSourceChunkRow>(
      `
        insert into raw_source_chunks (
          raw_source_id,
          chunk_index,
          heading,
          body_markdown,
          token_estimate,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6)
        returning *
      `,
      [
        rawSourceId,
        chunk.chunkIndex,
        chunk.heading ?? null,
        chunk.bodyMarkdown,
        chunk.tokenEstimate,
        chunk.metadata ?? {},
      ],
    );
    savedChunks.push(mapRawSourceChunk(chunkResult.rows[0]));
  }
  return savedChunks;
}
