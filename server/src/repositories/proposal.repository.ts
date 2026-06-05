import { query } from "../db/postgres.js";
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
  raw_source_id: string | null;
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
  source_spans: unknown;
  conflict_detected: boolean;
  conflict_summary: string | null;
  conflict_resolution: string | null;
  eval_verdict: "pass" | "warn" | "fail" | null;
  incomplete_reasoning: boolean;
  created_at: Date;
};

function mapProposal(row: ProposalRow): UpdateProposal {
  return {
    id: row.id,
    userId: row.user_id,
    rawSourceId: row.raw_source_id,
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
    sourceSpans: row.source_spans,
    conflictDetected: row.conflict_detected,
    conflictSummary: row.conflict_summary,
    conflictResolution: row.conflict_resolution,
    evalVerdict: row.eval_verdict,
    incompleteReasoning: row.incomplete_reasoning,
    createdAt: row.created_at,
  };
}

export interface ProposalRepository {
  create(input: {
    userId?: string | null;
    rawSourceId?: string | null;
    draft: DraftUpdateProposal;
  }): Promise<ProposalWithItems>;
  getById(id: string): Promise<ProposalWithItems | null>;
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
  async create(input: {
    userId?: string | null;
    rawSourceId?: string | null;
    draft: DraftUpdateProposal;
  }) {
    const proposalResult = await query<ProposalRow>(
      `
        insert into update_proposals (
          user_id,
          raw_source_id,
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
        input.rawSourceId ?? null,
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
      const payload = normalizeProposalItemPayload(item.payload, {
        actionType: item.actionType,
        rawSourceId: input.rawSourceId ?? null,
      });
      const itemResult = await query<ProposalItemRow>(
        `
          insert into proposal_items (
            proposal_id,
            action_type,
            target_type,
            payload,
            rationale,
            source_spans,
            conflict_detected,
            conflict_summary,
            conflict_resolution,
            eval_verdict,
            incomplete_reasoning
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          returning *
        `,
        [
          proposal.id,
          item.actionType,
          item.targetType,
          payload,
          item.rationale,
          item.sourceSpans ?? null,
          item.conflictDetected ?? false,
          item.conflictSummary ?? null,
          item.conflictResolution ?? null,
          item.evalVerdict ?? null,
          item.incompleteReasoning ?? false,
        ],
      );
      items.push(mapProposalItem(itemResult.rows[0]));
    }

    return { ...proposal, items };
  }

  async getById(id: string) {
    const proposalResult = await query<ProposalRow>(
      "select * from update_proposals where id = $1",
      [id],
    );

    if (!proposalResult.rows[0]) {
      return null;
    }

    const itemResult = await query<ProposalItemRow>(
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
    const proposalResult = await query<ProposalRow>(
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

  async setStatus(id: string, status: ProposalStatus) {
    const result = await query<ProposalRow>(
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
    await query(
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
    await query(
      `
        insert into approval_decisions (proposal_id, user_id, decision, comment)
        values ($1, $2, $3, $4)
      `,
      [input.proposalId, input.userId ?? null, input.decision, input.comment ?? null],
    );
  }
}

function normalizeProposalItemPayload(
  payload: Record<string, unknown>,
  context: { actionType: string; rawSourceId: string | null },
) {
  if (context.actionType !== "keep_source_searchable") {
    return payload;
  }

  return {
    ...payload,
    rawSourceId: typeof payload.rawSourceId === "string" && payload.rawSourceId.trim()
      ? payload.rawSourceId
      : context.rawSourceId,
  };
}
