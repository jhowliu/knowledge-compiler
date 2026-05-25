import { pool } from "../db/pool.js";
import type {
  ProposalItem,
  ProposalStatus,
  ProposalWithItems,
  UpdateProposal,
} from "../domain/knowledge.js";
import type { DraftUpdateProposal } from "../domain/compiler.js";

type ProposalRow = {
  id: string;
  user_id: string | null;
  raw_note_id: string | null;
  detected_domain: string | null;
  detected_knowledge_type: string | null;
  impact_level: number;
  confidence: "low" | "medium" | "high";
  status: ProposalStatus;
  rationale: string | null;
  created_at: Date;
  updated_at: Date;
};

type ProposalItemRow = {
  id: string;
  proposal_id: string;
  action_type: string;
  target_type: string | null;
  target_id: string | null;
  payload: Record<string, unknown>;
  rationale: string | null;
  status: ProposalStatus;
  created_at: Date;
};

function mapProposal(row: ProposalRow): UpdateProposal {
  return {
    id: row.id,
    userId: row.user_id,
    rawNoteId: row.raw_note_id,
    detectedDomain: row.detected_domain,
    detectedKnowledgeType: row.detected_knowledge_type,
    impactLevel: row.impact_level,
    confidence: row.confidence,
    status: row.status,
    rationale: row.rationale,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProposalItem(row: ProposalItemRow): ProposalItem {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    actionType: row.action_type,
    targetType: row.target_type,
    targetId: row.target_id,
    payload: row.payload,
    rationale: row.rationale,
    status: row.status,
    createdAt: row.created_at,
  };
}

export interface ProposalRepository {
  create(input: {
    userId?: string | null;
    rawNoteId: string;
    draft: DraftUpdateProposal;
  }): Promise<ProposalWithItems>;
  getById(id: string): Promise<ProposalWithItems | null>;
  listByRawNote(rawNoteId: string): Promise<ProposalWithItems[]>;
  listRecent(limit: number): Promise<ProposalWithItems[]>;
  setStatus(id: string, status: ProposalStatus): Promise<UpdateProposal>;
  setItemStatus(proposalId: string, status: ProposalStatus): Promise<void>;
  recordDecision(input: {
    proposalId: string;
    userId?: string | null;
    decision: ProposalStatus;
    comment?: string | null;
  }): Promise<void>;
}

export class PostgresProposalRepository implements ProposalRepository {
  async create(input: { userId?: string | null; rawNoteId: string; draft: DraftUpdateProposal }) {
    const proposalResult = await pool.query<ProposalRow>(
      `
        insert into update_proposals (
          user_id,
          raw_note_id,
          detected_domain,
          detected_knowledge_type,
          impact_level,
          confidence,
          rationale
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning *
      `,
      [
        input.userId ?? null,
        input.rawNoteId,
        input.draft.detectedDomain,
        input.draft.detectedKnowledgeType,
        input.draft.impactLevel,
        input.draft.confidence,
        input.draft.rationale,
      ],
    );

    const proposal = mapProposal(proposalResult.rows[0]);
    const items: ProposalItem[] = [];

    for (const item of input.draft.items) {
      const itemResult = await pool.query<ProposalItemRow>(
        `
          insert into proposal_items (
            proposal_id,
            action_type,
            target_type,
            payload,
            rationale
          )
          values ($1, $2, $3, $4, $5)
          returning *
        `,
        [proposal.id, item.actionType, item.targetType, item.payload, item.rationale],
      );
      items.push(mapProposalItem(itemResult.rows[0]));
    }

    return { ...proposal, items };
  }

  async getById(id: string) {
    const proposalResult = await pool.query<ProposalRow>(
      "select * from update_proposals where id = $1",
      [id],
    );

    if (!proposalResult.rows[0]) {
      return null;
    }

    const itemResult = await pool.query<ProposalItemRow>(
      `
        select *
        from proposal_items
        where proposal_id = $1
        order by created_at asc
      `,
      [id],
    );

    return {
      ...mapProposal(proposalResult.rows[0]),
      items: itemResult.rows.map(mapProposalItem),
    };
  }

  async listRecent(limit: number) {
    const proposalResult = await pool.query<ProposalRow>(
      `
        select *
        from update_proposals
        order by created_at desc
        limit $1
      `,
      [limit],
    );

    const proposals: ProposalWithItems[] = [];
    for (const row of proposalResult.rows) {
      const proposal = await this.getById(row.id);
      if (proposal) {
        proposals.push(proposal);
      }
    }

    return proposals;
  }

  async listByRawNote(rawNoteId: string) {
    const proposalResult = await pool.query<ProposalRow>(
      `
        select *
        from update_proposals
        where raw_note_id = $1
        order by created_at desc
      `,
      [rawNoteId],
    );

    const proposals: ProposalWithItems[] = [];
    for (const row of proposalResult.rows) {
      const proposal = await this.getById(row.id);
      if (proposal) {
        proposals.push(proposal);
      }
    }

    return proposals;
  }

  async setStatus(id: string, status: ProposalStatus) {
    const result = await pool.query<ProposalRow>(
      `
        update update_proposals
        set status = $2,
            updated_at = now()
        where id = $1
        returning *
      `,
      [id, status],
    );

    return mapProposal(result.rows[0]);
  }

  async setItemStatus(proposalId: string, status: ProposalStatus) {
    await pool.query(
      `
        update proposal_items
        set status = $2
        where proposal_id = $1
      `,
      [proposalId, status],
    );
  }

  async recordDecision(input: {
    proposalId: string;
    userId?: string | null;
    decision: ProposalStatus;
    comment?: string | null;
  }) {
    await pool.query(
      `
        insert into approval_decisions (proposal_id, user_id, decision, comment)
        values ($1, $2, $3, $4)
      `,
      [input.proposalId, input.userId ?? null, input.decision, input.comment ?? null],
    );
  }
}
