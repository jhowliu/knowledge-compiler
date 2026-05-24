import { pool } from "../db/pool.js";

export type RawNote = {
  id: string;
  userId: string | null;
  domain: string | null;
  sourceType: string;
  title: string | null;
  bodyMarkdown: string;
  extractedData: unknown;
  createdAt: Date;
};

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

export async function createRawNote(input: {
  userId?: string | null;
  domain?: string | null;
  sourceType?: string;
  title?: string | null;
  bodyMarkdown: string;
}) {
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

export async function listRawNotes() {
  const result = await pool.query<RawNoteRow>(`
    select *
    from raw_notes
    order by created_at desc
    limit 50
  `);

  return result.rows.map(mapRawNote);
}
