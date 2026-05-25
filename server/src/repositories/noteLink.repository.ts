import { query } from "../db/postgres.js";
import type { Confidence, NoteLink, NoteLinkStatus } from "../domain/knowledge.js";

type NoteLinkRow = {
  id: string;
  user_id: string | null;
  source_note_type: string;
  source_note_id: string;
  source_title: string | null;
  target_note_type: string;
  target_note_id: string;
  target_title: string | null;
  relation_type: string;
  confidence: Confidence;
  status: NoteLinkStatus;
  rationale: string | null;
  created_by_agent_run_id: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapNoteLink(row: NoteLinkRow): NoteLink {
  return {
    id: row.id,
    userId: row.user_id,
    sourceNoteType: row.source_note_type,
    sourceNoteId: row.source_note_id,
    sourceTitle: row.source_title,
    targetNoteType: row.target_note_type,
    targetNoteId: row.target_note_id,
    targetTitle: row.target_title,
    relationType: row.relation_type,
    confidence: row.confidence,
    status: row.status,
    rationale: row.rationale,
    createdByAgentRunId: row.created_by_agent_run_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const noteLinkSelect = `
  select
    note_links.*,
    source_compiled.title as source_title,
    target_compiled.title as target_title
  from note_links
  left join compiled_notes source_compiled on note_links.source_note_type = 'compiled_note'
    and source_compiled.id = note_links.source_note_id
  left join compiled_notes target_compiled on note_links.target_note_type = 'compiled_note'
    and target_compiled.id = note_links.target_note_id
`;

export interface NoteLinkRepository {
  createManual(input: {
    userId?: string | null;
    sourceNoteType: string;
    sourceNoteId: string;
    targetNoteType: string;
    targetNoteId: string;
    relationType: string;
    confidence: Confidence;
    rationale?: string | null;
  }): Promise<NoteLink | null>;
  createSuggestion(input: {
    userId?: string | null;
    sourceNoteType: string;
    sourceNoteId: string;
    targetNoteType: string;
    targetNoteId: string;
    relationType: string;
    confidence: Confidence;
    rationale?: string | null;
    createdByAgentRunId?: string | null;
  }): Promise<NoteLink | null>;
  listForGraph(input: { statuses: NoteLinkStatus[]; limit: number }): Promise<NoteLink[]>;
  listForNote(input: {
    noteType: string;
    noteId: string;
    statuses: NoteLinkStatus[];
    limit: number;
  }): Promise<NoteLink[]>;
  updateRelation(input: {
    id: string;
    relationType: string;
    confidence?: Confidence;
    rationale?: string | null;
  }): Promise<NoteLink | null>;
  setStatus(id: string, status: NoteLinkStatus): Promise<NoteLink | null>;
}

export class PostgresNoteLinkRepository implements NoteLinkRepository {
  async createManual(input: {
    userId?: string | null;
    sourceNoteType: string;
    sourceNoteId: string;
    targetNoteType: string;
    targetNoteId: string;
    relationType: string;
    confidence: Confidence;
    rationale?: string | null;
  }) {
    return this.createLink({ ...input, status: "approved", preserveRejected: false });
  }

  async createSuggestion(input: {
    userId?: string | null;
    sourceNoteType: string;
    sourceNoteId: string;
    targetNoteType: string;
    targetNoteId: string;
    relationType: string;
    confidence: Confidence;
    rationale?: string | null;
    createdByAgentRunId?: string | null;
  }) {
    return this.createLink({ ...input, status: "pending", preserveRejected: true });
  }

  private async createLink(input: {
    userId?: string | null;
    sourceNoteType: string;
    sourceNoteId: string;
    targetNoteType: string;
    targetNoteId: string;
    relationType: string;
    confidence: Confidence;
    status: NoteLinkStatus;
    rationale?: string | null;
    createdByAgentRunId?: string | null;
    preserveRejected: boolean;
  }) {
    if (input.sourceNoteType === input.targetNoteType && input.sourceNoteId === input.targetNoteId) {
      return null;
    }

    const result = await query<NoteLinkRow>(
      `
        with upserted as (
          insert into note_links (
            user_id,
            source_note_type,
            source_note_id,
            target_note_type,
            target_note_id,
            relation_type,
            confidence,
            status,
            rationale,
            created_by_agent_run_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          on conflict (
            source_note_type,
            source_note_id,
            target_note_type,
            target_note_id,
            relation_type
          )
          do update set confidence = excluded.confidence,
                        rationale = excluded.rationale,
                        status = case
                          when $11::boolean and note_links.status = 'rejected' then note_links.status
                          else excluded.status
                        end,
                        updated_at = now()
          returning *
        )
        select
          upserted.*,
          source_compiled.title as source_title,
          target_compiled.title as target_title
        from upserted
        left join compiled_notes source_compiled on upserted.source_note_type = 'compiled_note'
          and source_compiled.id = upserted.source_note_id
        left join compiled_notes target_compiled on upserted.target_note_type = 'compiled_note'
          and target_compiled.id = upserted.target_note_id
      `,
      [
        input.userId ?? null,
        input.sourceNoteType,
        input.sourceNoteId,
        input.targetNoteType,
        input.targetNoteId,
        input.relationType,
        input.confidence,
        input.status,
        input.rationale ?? null,
        input.createdByAgentRunId ?? null,
        input.preserveRejected,
      ],
    );

    return result.rows[0] ? mapNoteLink(result.rows[0]) : null;
  }

  async listForGraph(input: { statuses: NoteLinkStatus[]; limit: number }) {
    const result = await query<NoteLinkRow>(
      `
        ${noteLinkSelect}
        where note_links.status = any($1::text[])
        order by case note_links.status when 'approved' then 0 else 1 end,
                 note_links.updated_at desc
        limit $2
      `,
      [input.statuses, input.limit],
    );

    return result.rows.map(mapNoteLink);
  }

  async listForNote(input: {
    noteType: string;
    noteId: string;
    statuses: NoteLinkStatus[];
    limit: number;
  }) {
    const result = await query<NoteLinkRow>(
      `
        ${noteLinkSelect}
        where note_links.status = any($1::text[])
          and (
            (note_links.source_note_type = $2 and note_links.source_note_id = $3)
            or
            (note_links.target_note_type = $2 and note_links.target_note_id = $3)
          )
        order by case note_links.status when 'approved' then 0 else 1 end,
                 note_links.updated_at desc
        limit $4
      `,
      [input.statuses, input.noteType, input.noteId, input.limit],
    );

    return result.rows.map(mapNoteLink);
  }

  async updateRelation(input: {
    id: string;
    relationType: string;
    confidence?: Confidence;
    rationale?: string | null;
  }) {
    const result = await query<NoteLinkRow>(
      `
        with updated as (
          update note_links
          set relation_type = $2,
              confidence = coalesce($3, confidence),
              rationale = coalesce($4, rationale),
              updated_at = now()
          where id = $1
          returning *
        )
        select
          updated.*,
          source_compiled.title as source_title,
          target_compiled.title as target_title
        from updated
        left join compiled_notes source_compiled on updated.source_note_type = 'compiled_note'
          and source_compiled.id = updated.source_note_id
        left join compiled_notes target_compiled on updated.target_note_type = 'compiled_note'
          and target_compiled.id = updated.target_note_id
      `,
      [input.id, input.relationType, input.confidence ?? null, input.rationale ?? null],
    );

    return result.rows[0] ? mapNoteLink(result.rows[0]) : null;
  }

  async setStatus(id: string, status: NoteLinkStatus) {
    const result = await query<NoteLinkRow>(
      `
        with updated as (
          update note_links
          set status = $2,
              updated_at = now()
          where id = $1
          returning *
        )
        select
          updated.*,
          source_compiled.title as source_title,
          target_compiled.title as target_title
        from updated
        left join compiled_notes source_compiled on updated.source_note_type = 'compiled_note'
          and source_compiled.id = updated.source_note_id
        left join compiled_notes target_compiled on updated.target_note_type = 'compiled_note'
          and target_compiled.id = updated.target_note_id
      `,
      [id, status],
    );

    return result.rows[0] ? mapNoteLink(result.rows[0]) : null;
  }
}
