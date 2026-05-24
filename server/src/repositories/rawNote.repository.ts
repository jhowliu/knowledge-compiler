import { pool } from "../db/pool.js";
import type { CreateRawNoteInput, RawNote, UpdateRawNoteInput } from "../domain/rawNote.js";

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
  getById(id: string): Promise<RawNote | null>;
  listRecent(limit: number): Promise<RawNote[]>;
  update(id: string, input: UpdateRawNoteInput): Promise<RawNote | null>;
  delete(id: string): Promise<boolean>;
  updateExtraction(id: string, extractedData: unknown, domain: string | null): Promise<RawNote>;
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

  async getById(id: string) {
    const result = await pool.query<RawNoteRow>(
      `
        select *
        from raw_notes
        where id = $1
      `,
      [id],
    );

    return result.rows[0] ? mapRawNote(result.rows[0]) : null;
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

  async update(id: string, input: UpdateRawNoteInput) {
    const result = await pool.query<RawNoteRow>(
      `
        update raw_notes
        set domain = $2,
            title = $3,
            body_markdown = $4,
            extracted_data = '{}'::jsonb
        where id = $1
        returning *
      `,
      [id, input.domain ?? null, input.title ?? null, input.bodyMarkdown],
    );

    return result.rows[0] ? mapRawNote(result.rows[0]) : null;
  }

  async delete(id: string) {
    const result = await pool.query(
      `
        delete from raw_notes
        where id = $1
      `,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async updateExtraction(id: string, extractedData: unknown, domain: string | null) {
    const result = await pool.query<RawNoteRow>(
      `
        update raw_notes
        set extracted_data = $2,
            domain = coalesce($3, domain)
        where id = $1
        returning *
      `,
      [id, extractedData, domain],
    );

    return mapRawNote(result.rows[0]);
  }
}
