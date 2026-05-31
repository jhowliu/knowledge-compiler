import { query, transaction } from "../db/postgres.js";
import type {
  CreateRawSourceChunkInput,
  CreateRawSourceInput,
  RawSource,
  RawSourceChunk,
  RawSourceRole,
  RawSourceWithChunks,
  UpdateRawSourceInput,
} from "../domain/rawSource.js";

type RawSourceRow = {
  id: string;
  user_id: string | null;
  domain: string | null;
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
  updateExtraction(id: string, extractedData: unknown, domain: string | null): Promise<RawSourceWithChunks>;
  delete(id: string): Promise<boolean>;
}

function mapRawSource(row: RawSourceRow): RawSource {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
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
            domain,
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
          input.domain ?? null,
          input.sourceType ?? "markdown",
          input.sourceRole ?? "personal_note",
          input.title ?? null,
          input.bodyMarkdown,
          input.metadata ?? {},
        ],
      );
      const source = mapRawSource(sourceResult.rows[0]);
      const savedChunks = await insertChunks(transactionQuery, source.id, chunks);
      return { ...source, chunks: savedChunks };
    });
  }

  async getById(id: string) {
    const sourceResult = await query<RawSourceRow>("select * from raw_sources where id = $1", [id]);
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
        select *
        from raw_sources
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
      const sourceResult = await transactionQuery<RawSourceRow>(
        `
          update raw_sources
          set domain = $2,
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
          input.domain ?? null,
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

  async updateExtraction(id: string, extractedData: unknown, domain: string | null) {
    const sourceResult = await query<RawSourceRow>(
      `
        update raw_sources
        set extracted_data = $2,
            domain = coalesce($3, domain),
            updated_at = now()
        where id = $1
        returning *
      `,
      [id, extractedData, domain],
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
}

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
