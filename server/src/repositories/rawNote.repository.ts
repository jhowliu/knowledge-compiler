import { pool } from "../db/pool.js";
import type { CreateRawNoteInput, RawNote } from "../domain/rawNote.js";

type RawNoteRow = {
  id: string;
  user_id: string | null;
  domain: string | null;
  source_type: string;
  title: string | null;
  body_markdown: string;
  extracted_data: unknown;
  created_at: Date;
};

export interface RawNoteRepository {
  create(input: CreateRawNoteInput): Promise<RawNote>;
  listRecent(limit: number): Promise<RawNote[]>;
}

function mapRawNote(row: RawNoteRow): RawNote {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
    sourceType: row.source_type,
    title: row.title,
    bodyMarkdown: row.body_markdown,
    extractedData: row.extracted_data,
    createdAt: row.created_at,
  };
}

export class PostgresRawNoteRepository implements RawNoteRepository {
  async create(input: CreateRawNoteInput) {
    const result = await pool.query<RawNoteRow>(
      `
        insert into raw_notes (
          user_id,
          domain,
          source_type,
          title,
          body_markdown
        )
        values ($1, $2, $3, $4, $5)
        returning *
      `,
      [
        input.userId ?? null,
        input.domain ?? null,
        input.sourceType ?? "manual",
        input.title ?? null,
        input.bodyMarkdown,
      ],
    );

    return mapRawNote(result.rows[0]);
  }

  async listRecent(limit: number) {
    const result = await pool.query<RawNoteRow>(
      `
        select *
        from raw_notes
        order by created_at desc
        limit $1
      `,
      [limit],
    );

    return result.rows.map(mapRawNote);
  }
}
