import { query } from "../db/postgres.js";
import type { CreateRawNoteInput, RawNote, UpdateRawNoteInput } from "../domain/rawNote.js";

type RawNoteRow = {
  id: string;
  user_id: string | null;
  raw_source_id: string | null;
  source_type: string;
  source_role: "reference" | "personal_note";
  title: string | null;
  body_markdown: string;
  extracted_data: unknown;
  created_at: Date;
};

export interface RawNoteRepository {
  create(input: CreateRawNoteInput): Promise<RawNote>;
  getById(id: string): Promise<RawNote | null>;
  getByRawSourceId(rawSourceId: string): Promise<RawNote | null>;
  listRecent(limit: number): Promise<RawNote[]>;
  update(id: string, input: UpdateRawNoteInput): Promise<RawNote | null>;
  delete(id: string): Promise<boolean>;
  updateExtraction(id: string, extractedData: unknown): Promise<RawNote>;
}

function mapRawNote(row: RawNoteRow): RawNote {
  return {
    id: row.id,
    userId: row.user_id,
    rawSourceId: row.raw_source_id,
    sourceType: row.source_type,
    sourceRole: row.source_role,
    title: row.title,
    bodyMarkdown: row.body_markdown,
    extractedData: row.extracted_data,
    createdAt: row.created_at,
  };
}

export class PostgresRawNoteRepository implements RawNoteRepository {
  async create(input: CreateRawNoteInput) {
    const result = await query<RawNoteRow>(
      `
        insert into raw_notes (
          user_id,
          raw_source_id,
          source_type,
          source_role,
          title,
          body_markdown
        )
        values ($1, $2, $3, $4, $5, $6)
        returning *
      `,
      [
        input.userId ?? null,
        input.rawSourceId ?? null,
        input.sourceType ?? "manual",
        input.sourceRole ?? "personal_note",
        input.title ?? null,
        input.bodyMarkdown,
      ],
    );

    return mapRawNote(result.rows[0]);
  }

  async getById(id: string) {
    const result = await query<RawNoteRow>(
      `
        select *
        from raw_notes
        where id = $1
      `,
      [id],
    );

    return result.rows[0] ? mapRawNote(result.rows[0]) : null;
  }

  async getByRawSourceId(rawSourceId: string) {
    const result = await query<RawNoteRow>(
      `
        select *
        from raw_notes
        where raw_source_id = $1
        order by created_at desc
        limit 1
      `,
      [rawSourceId],
    );

    return result.rows[0] ? mapRawNote(result.rows[0]) : null;
  }

  async listRecent(limit: number) {
    const result = await query<RawNoteRow>(
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
    const result = await query<RawNoteRow>(
      `
        update raw_notes
        set source_type = $2,
            source_role = $3,
            title = $4,
            body_markdown = $5,
            extracted_data = '{}'::jsonb
        where id = $1
        returning *
      `,
      [
        id,
        input.sourceType ?? "manual",
        input.sourceRole ?? "personal_note",
        input.title ?? null,
        input.bodyMarkdown,
      ],
    );

    return result.rows[0] ? mapRawNote(result.rows[0]) : null;
  }

  async delete(id: string) {
    const result = await query(
      `
        delete from raw_notes
        where id = $1
      `,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async updateExtraction(id: string, extractedData: unknown) {
    const result = await query<RawNoteRow>(
      `
        update raw_notes
        set extracted_data = $2
        where id = $1
        returning *
      `,
      [id, extractedData],
    );

    return mapRawNote(result.rows[0]);
  }
}
