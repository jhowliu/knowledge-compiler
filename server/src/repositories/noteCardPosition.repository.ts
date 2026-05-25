import { pool } from "../db/pool.js";
import type { NoteCardPosition } from "../domain/knowledge.js";

type NoteCardPositionRow = {
  id: string;
  user_id: string | null;
  board_key: string;
  note_id: string;
  x_position: string;
  y_position: string;
  created_at: Date;
  updated_at: Date;
};

function mapNoteCardPosition(row: NoteCardPositionRow): NoteCardPosition {
  return {
    id: row.id,
    userId: row.user_id,
    boardKey: row.board_key,
    noteId: row.note_id,
    x: Number(row.x_position),
    y: Number(row.y_position),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface NoteCardPositionRepository {
  listForBoard(boardKey: string): Promise<NoteCardPosition[]>;
  deleteForBoard(boardKey: string): Promise<number>;
  upsert(input: {
    userId?: string | null;
    boardKey: string;
    noteId: string;
    x: number;
    y: number;
  }): Promise<NoteCardPosition | null>;
}

export class PostgresNoteCardPositionRepository implements NoteCardPositionRepository {
  async listForBoard(boardKey: string) {
    const result = await pool.query<NoteCardPositionRow>(
      `
        select *
        from note_card_positions
        where board_key = $1
        order by updated_at desc
      `,
      [boardKey],
    );

    return result.rows.map(mapNoteCardPosition);
  }

  async upsert(input: {
    userId?: string | null;
    boardKey: string;
    noteId: string;
    x: number;
    y: number;
  }) {
    const result = await pool.query<NoteCardPositionRow>(
      `
        insert into note_card_positions (
          user_id,
          board_key,
          note_id,
          x_position,
          y_position
        )
        values ($1, $2, $3, $4, $5)
        on conflict (board_key, note_id)
        do update set x_position = excluded.x_position,
                      y_position = excluded.y_position,
                      updated_at = now()
        returning *
      `,
      [input.userId ?? null, input.boardKey, input.noteId, input.x, input.y],
    );

    return result.rows[0] ? mapNoteCardPosition(result.rows[0]) : null;
  }

  async deleteForBoard(boardKey: string) {
    const result = await pool.query(
      `
        delete from note_card_positions
        where board_key = $1
      `,
      [boardKey],
    );

    return result.rowCount ?? 0;
  }
}
