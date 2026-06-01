import { query } from "../db/postgres.js";
import type {
  GetBlockHistoryOutput,
  GetBlockOutput,
  LookupConceptsOutput,
  SearchBlocksOutput,
} from "@knowledge-compiler/agent-contracts";

type BlockRow = {
  id: string;
  knowledge_source_id: string;
  knowledge_version_id: string;
  title: string;
  heading: string | null;
  body_markdown: string;
  status: string;
};

type EvidenceRow = {
  id: string;
  source_type: string;
  source_id: string;
  chunk_index: number | null;
  chunk_body_markdown: string | null;
};

type ConceptMatchRow = {
  input: string;
  concept_id: string | null;
  canonical_label: string | null;
  match_type: "exact" | "fuzzy" | "none";
  linked_block_ids: string[];
};

type VersionRow = {
  knowledge_version_id: string;
  version_number: number;
  title: string;
  body_markdown: string;
  created_at: Date;
};

export interface AgentToolReadRepository {
  getBlock(blockId: string): Promise<GetBlockOutput | null>;
  getBlockHistory(blockId: string, limit: number): Promise<GetBlockHistoryOutput>;
  lookupConcepts(concepts: string[], fuzzy: boolean): Promise<LookupConceptsOutput>;
}

export class NoopAgentToolReadRepository implements AgentToolReadRepository {
  async getBlock(): Promise<GetBlockOutput | null> {
    return null;
  }

  async getBlockHistory(): Promise<GetBlockHistoryOutput> {
    return { versions: [] };
  }

  async lookupConcepts(concepts: string[]): Promise<LookupConceptsOutput> {
    return {
      matches: concepts.map((concept) => ({
        input: concept,
        concept_id: null,
        canonical_label: null,
        match_type: "none",
        linked_block_ids: [],
      })),
    };
  }
}

export class PostgresAgentToolReadRepository implements AgentToolReadRepository {
  async getBlock(blockId: string): Promise<GetBlockOutput | null> {
    const blockResult = await query<BlockRow>(
      `
        select
          knowledge_blocks.id,
          knowledge_blocks.knowledge_source_id,
          knowledge_blocks.knowledge_version_id,
          knowledge_sources.title,
          knowledge_blocks.heading,
          knowledge_blocks.body_markdown,
          knowledge_blocks.status
        from knowledge_blocks
        join knowledge_sources on knowledge_sources.id = knowledge_blocks.knowledge_source_id
        where knowledge_blocks.id = $1
        limit 1
      `,
      [blockId],
    );
    const block = blockResult.rows[0];
    if (!block) {
      return null;
    }

    const evidenceResult = await query<EvidenceRow>(
      `
        select
          evidence_links.id,
          evidence_links.source_type,
          evidence_links.source_id,
          raw_source_chunks.chunk_index,
          raw_source_chunks.body_markdown as chunk_body_markdown
        from evidence_links
        left join raw_source_chunks
          on evidence_links.source_type = 'raw_source_chunk'
         and raw_source_chunks.id = evidence_links.source_id
        where evidence_links.approval_status = 'approved'
          and (
            (evidence_links.target_type = 'knowledge_block' and evidence_links.target_id = $1)
            or
            (evidence_links.target_type = 'knowledge_version' and evidence_links.target_id = $2)
            or
            (evidence_links.target_type = 'knowledge_source' and evidence_links.target_id = $3)
          )
        order by evidence_links.created_at desc
      `,
      [block.id, block.knowledge_version_id, block.knowledge_source_id],
    );

    return {
      block: {
        id: block.id,
        knowledge_source_id: block.knowledge_source_id,
        knowledge_version_id: block.knowledge_version_id,
        title: block.title,
        heading: block.heading,
        body_markdown: block.body_markdown,
        status: block.status,
      },
      evidence: evidenceResult.rows.map((row) => ({
        id: row.id,
        source_type: row.source_type,
        source_id: row.source_id,
        chunk_index: row.chunk_index,
        chunk_body_markdown: row.chunk_body_markdown,
      })),
      links: [],
    };
  }

  async getBlockHistory(blockId: string, limit: number): Promise<GetBlockHistoryOutput> {
    const result = await query<VersionRow>(
      `
        select
          knowledge_versions.id as knowledge_version_id,
          knowledge_versions.version_number,
          knowledge_versions.title,
          knowledge_versions.body_markdown,
          knowledge_versions.created_at
        from knowledge_blocks
        join knowledge_versions
          on knowledge_versions.knowledge_source_id = knowledge_blocks.knowledge_source_id
        where knowledge_blocks.id = $1
        order by knowledge_versions.version_number desc
        limit $2
      `,
      [blockId, limit],
    );

    return {
      versions: result.rows.map((row) => ({
        knowledge_version_id: row.knowledge_version_id,
        version_number: Number(row.version_number),
        title: row.title,
        body_markdown: row.body_markdown,
        created_at: row.created_at.toISOString(),
      })),
    };
  }

  async lookupConcepts(concepts: string[], fuzzy: boolean): Promise<LookupConceptsOutput> {
    const result = await query<ConceptMatchRow>(
      `
        with input_concepts as (
          select unnest($1::text[]) as input
        ),
        matched as (
          select distinct on (input_concepts.input)
            input_concepts.input,
            concepts.id::text as concept_id,
            concepts.name as canonical_label,
            case
              when concepts.normalized_name = lower(input_concepts.input) then 'exact'
              else 'fuzzy'
            end as match_type
          from input_concepts
          left join concepts
            on concepts.normalized_name = lower(input_concepts.input)
            or ($2::boolean and concepts.normalized_name ilike '%' || lower(input_concepts.input) || '%')
          order by input_concepts.input,
            case when concepts.normalized_name = lower(input_concepts.input) then 0 else 1 end
        )
        select
          input,
          concept_id,
          canonical_label,
          coalesce(match_type, 'none') as match_type,
          array[]::text[] as linked_block_ids
        from matched
      `,
      [concepts, fuzzy],
    );

    return { matches: result.rows };
  }
}
