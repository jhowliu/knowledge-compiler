import { query, transaction } from "../db/postgres.js";

/**
 * A query executor: either the global {@link query} or a transaction-scoped
 * query from {@link transaction}. Repo write methods accept one (default
 * {@link query}) so callers can run them inside a shared transaction by passing
 * the transaction's executor — the unit-of-work pattern.
 */
type Db = typeof query;
import type {
  CompiledNote,
  Concept,
  CreateKnowledgeBlockInput,
  KnowledgeBlock,
  KnowledgeBlockSearchResult,
  KnowledgeEvidenceReference,
  KnowledgeSource,
  KnowledgeSourceSnapshot,
  KnowledgeSourceTimeline,
  KnowledgeVersion,
  SearchResult,
} from "../domain/knowledge.js";
import { HybridRetrievalService } from "../services/retrieval/hybridRetrieval.service.js";
import type { MergedRetrievalCandidate } from "../services/retrieval/retrieval.types.js";
import {
  type Bm25SupportStatus,
  PostgresBm25Retriever,
  PostgresConceptRetriever,
  PostgresFtsRetriever,
  PostgresPgVectorRetriever,
} from "./knowledgeRetrievers.js";

type ConceptRow = {
  id: string;
  user_id: string | null;
  name: string;
  normalized_name: string;
  concept_type: string;
  created_at: Date;
};

type CompiledNoteRow = {
  id: string;
  user_id: string | null;
  domain: string;
  note_type: string;
  title: string;
  body_markdown: string;
  structured_data: unknown;
  status: string;
  last_reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type KnowledgeSourceRow = {
  id: string;
  user_id: string | null;
  domain: string;
  knowledge_type: string;
  title: string;
  status: string;
  current_version_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type KnowledgeVersionRow = {
  id: string;
  knowledge_source_id: string;
  compiled_note_id: string | null;
  proposal_id: string | null;
  version_number: number;
  title: string;
  body_markdown: string;
  structured_data: unknown;
  change_summary: string | null;
  created_at: Date;
};

type KnowledgeBlockRow = {
  id: string;
  knowledge_source_id: string;
  knowledge_version_id: string;
  block_index: number;
  heading: string | null;
  body_markdown: string;
  token_estimate: number;
  status: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type SearchResultRow = {
  id: string;
  target_type: "raw_source" | "compiled_note";
  title: string | null;
  body_markdown: string;
  domain: string | null;
  note_type: string | null;
  rank: number;
  created_at: Date;
};

type KnowledgeBlockSearchRow = {
  block_id: string;
  knowledge_source_id: string;
  knowledge_version_id: string;
  compiled_note_id: string | null;
  title: string;
  domain: string;
  knowledge_type: string;
  version_number: number;
  block_index: number;
  heading: string | null;
  body_markdown: string;
  rank: number;
  status: string;
  updated_at: Date;
};

type EvidenceReferenceRow = {
  id: string;
  source_type: string;
  source_id: string;
  source_title: string | null;
  raw_source_id: string | null;
  raw_source_title: string | null;
  raw_source_chunk_id: string | null;
  chunk_index: number | null;
  chunk_heading: string | null;
  chunk_body_markdown: string | null;
  confidence: string;
  impact_level: number;
  created_at: Date;
  target_type: string;
  target_id: string;
};

function normalizeConcept(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function topicIdsFrom(value: unknown) {
  if (!value || typeof value !== "object") {
    return [];
  }
  const topicIds = (value as Record<string, unknown>).topicIds;
  return Array.isArray(topicIds)
    ? topicIds.filter((topicId): topicId is string => typeof topicId === "string")
    : [];
}

function mapConcept(row: ConceptRow): Concept {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    normalizedName: row.normalized_name,
    conceptType: row.concept_type,
    createdAt: row.created_at,
  };
}

function mapCompiledNote(row: CompiledNoteRow): CompiledNote {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
    noteType: row.note_type,
    title: row.title,
    bodyMarkdown: row.body_markdown,
    structuredData: row.structured_data,
    status: row.status,
    lastReviewedAt: row.last_reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapKnowledgeSource(row: KnowledgeSourceRow): KnowledgeSource {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
    knowledgeType: row.knowledge_type,
    title: row.title,
    status: row.status,
    currentVersionId: row.current_version_id,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapKnowledgeVersion(row: KnowledgeVersionRow): KnowledgeVersion {
  return {
    id: row.id,
    knowledgeSourceId: row.knowledge_source_id,
    compiledNoteId: row.compiled_note_id,
    proposalId: row.proposal_id,
    versionNumber: row.version_number,
    title: row.title,
    bodyMarkdown: row.body_markdown,
    structuredData: row.structured_data,
    changeSummary: row.change_summary,
    createdAt: row.created_at,
  };
}

function mapKnowledgeBlock(row: KnowledgeBlockRow): KnowledgeBlock {
  return {
    id: row.id,
    knowledgeSourceId: row.knowledge_source_id,
    knowledgeVersionId: row.knowledge_version_id,
    blockIndex: row.block_index,
    heading: row.heading,
    bodyMarkdown: row.body_markdown,
    tokenEstimate: row.token_estimate,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSearchResult(row: SearchResultRow): SearchResult {
  return {
    id: row.id,
    targetType: row.target_type,
    title: row.title,
    bodyMarkdown: row.body_markdown,
    domain: row.domain,
    noteType: row.note_type,
    rank: Number(row.rank),
    createdAt: row.created_at,
  };
}

function mapEvidenceReference(row: EvidenceReferenceRow): KnowledgeEvidenceReference {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceTitle: row.source_title,
    rawSourceId: row.raw_source_id,
    rawSourceTitle: row.raw_source_title,
    rawSourceChunkId: row.raw_source_chunk_id,
    chunkIndex: row.chunk_index,
    chunkHeading: row.chunk_heading,
    chunkBodyMarkdown: row.chunk_body_markdown,
    confidence: row.confidence,
    impactLevel: row.impact_level,
    createdAt: row.created_at,
  };
}

function mapKnowledgeBlockSearchResult(
  row: KnowledgeBlockSearchRow,
  evidenceReferences: KnowledgeEvidenceReference[],
): KnowledgeBlockSearchResult {
  return {
    blockId: row.block_id,
    knowledgeSourceId: row.knowledge_source_id,
    knowledgeVersionId: row.knowledge_version_id,
    compiledNoteId: row.compiled_note_id,
    title: row.title,
    domain: row.domain,
    knowledgeType: row.knowledge_type,
    versionNumber: row.version_number,
    blockIndex: row.block_index,
    heading: row.heading,
    bodyMarkdown: row.body_markdown,
    rank: Number(row.rank),
    status: row.status,
    updatedAt: row.updated_at,
    evidenceReferences,
  };
}

function evidenceKey(targetType: string, targetId: string) {
  return `${targetType}:${targetId}`;
}

async function hydrateKnowledgeBlockSearchRows(
  rows: KnowledgeBlockSearchRow[],
): Promise<KnowledgeBlockSearchResult[]> {
  if (rows.length === 0) {
    return [];
  }

  const blockIds = rows.map((row) => row.block_id);
  const versionIds = [...new Set(rows.map((row) => row.knowledge_version_id))];
  const sourceIds = [...new Set(rows.map((row) => row.knowledge_source_id))];
  const evidenceByTarget = await listEvidenceReferencesForTargets({ blockIds, versionIds, sourceIds });

  return rows.map((row) => {
    const evidenceReferences = [
      ...(evidenceByTarget.get(evidenceKey("knowledge_block", row.block_id)) ?? []),
      ...(evidenceByTarget.get(evidenceKey("knowledge_version", row.knowledge_version_id)) ?? []),
      ...(evidenceByTarget.get(evidenceKey("knowledge_source", row.knowledge_source_id)) ?? []),
    ];
    return mapKnowledgeBlockSearchResult(row, evidenceReferences);
  });
}

async function listEvidenceReferencesForTargets(input: {
  blockIds?: string[];
  versionIds?: string[];
  sourceIds?: string[];
}) {
  const evidenceResult = await query<EvidenceReferenceRow>(
    `
      select
        evidence_links.id,
        evidence_links.source_type,
        evidence_links.source_id,
        coalesce(direct_sources.title, chunk_sources.title, chunks.heading) as source_title,
        coalesce(direct_chunks.raw_source_id, direct_sources.id) as raw_source_id,
        coalesce(chunk_sources.title, direct_sources.title) as raw_source_title,
        chunks.id as raw_source_chunk_id,
        chunks.chunk_index,
        chunks.heading as chunk_heading,
        chunks.body_markdown as chunk_body_markdown,
        evidence_links.confidence,
        evidence_links.impact_level,
        evidence_links.created_at,
        evidence_links.target_type,
        evidence_links.target_id
      from evidence_links
      left join raw_source_chunks direct_chunks
        on evidence_links.source_type = 'raw_source_chunk'
        and direct_chunks.id = evidence_links.source_id
      left join raw_sources chunk_sources
        on chunk_sources.id = direct_chunks.raw_source_id
      left join raw_sources direct_sources
        on evidence_links.source_type = 'raw_source'
        and direct_sources.id = evidence_links.source_id
      left join lateral (
        select raw_source_chunks.*
        from raw_source_chunks
        where raw_source_chunks.raw_source_id = coalesce(
          direct_chunks.raw_source_id,
          direct_sources.id
        )
          and (direct_chunks.id is null or raw_source_chunks.id = direct_chunks.id)
        order by raw_source_chunks.chunk_index asc
        limit 3
      ) chunks on true
      where evidence_links.approval_status = 'approved'
        and (
          (evidence_links.target_type = 'knowledge_block' and evidence_links.target_id = any($1::uuid[]))
          or (evidence_links.target_type = 'knowledge_version' and evidence_links.target_id = any($2::uuid[]))
          or (evidence_links.target_type = 'knowledge_source' and evidence_links.target_id = any($3::uuid[]))
        )
      order by evidence_links.created_at desc, chunks.chunk_index asc
    `,
    [input.blockIds ?? [], input.versionIds ?? [], input.sourceIds ?? []],
  );

  const evidenceByTarget = new Map<string, KnowledgeEvidenceReference[]>();
  for (const row of evidenceResult.rows) {
    const key = evidenceKey(row.target_type, row.target_id);
    evidenceByTarget.set(key, [...(evidenceByTarget.get(key) ?? []), mapEvidenceReference(row)]);
  }
  return evidenceByTarget;
}

async function buildKnowledgeSourceTimeline(source: KnowledgeSource): Promise<KnowledgeSourceTimeline> {
  const versionResult = await query<KnowledgeVersionRow>(
    `
      select *
      from knowledge_versions
      where knowledge_source_id = $1
      order by version_number desc
    `,
    [source.id],
  );
  const versions = versionResult.rows.map(mapKnowledgeVersion);
  const versionIds = versions.map((version) => version.id);
  const blockResult = await query<KnowledgeBlockRow>(
    `
      select *
      from knowledge_blocks
      where knowledge_version_id = any($1::uuid[])
      order by knowledge_version_id, block_index asc
    `,
    [versionIds],
  );
  const blocksByVersion = new Map<string, KnowledgeBlock[]>();
  for (const row of blockResult.rows) {
    const block = mapKnowledgeBlock(row);
    blocksByVersion.set(block.knowledgeVersionId, [
      ...(blocksByVersion.get(block.knowledgeVersionId) ?? []),
      block,
    ]);
  }

  const evidenceByTarget = await listEvidenceReferencesForTargets({
    blockIds: blockResult.rows.map((row) => row.id),
    versionIds,
    sourceIds: [source.id],
  });

  return {
    source,
    sourceEvidenceReferences: evidenceByTarget.get(evidenceKey("knowledge_source", source.id)) ?? [],
    versions: versions.map((version) => {
      const blocks = blocksByVersion.get(version.id) ?? [];
      const blockEvidence = blocks.flatMap(
        (block) => evidenceByTarget.get(evidenceKey("knowledge_block", block.id)) ?? [],
      );
      const isCurrent = version.id === source.currentVersionId;
      return {
        ...version,
        isCurrent,
        state: isCurrent ? "current" : "historical",
        blocks,
        evidenceReferences: [
          ...(evidenceByTarget.get(evidenceKey("knowledge_version", version.id)) ?? []),
          ...blockEvidence,
        ],
      };
    }),
  };
}

export interface KnowledgeRepository {
  upsertConcept(input: {
    userId?: string | null;
    name: string;
    conceptType: string;
  }): Promise<Concept>;
  indexConcept(input: {
    userId?: string | null;
    conceptId: string;
    targetType: string;
    targetId: string;
    relationType: string;
    confidence: string;
    source: string;
  }): Promise<void>;
  searchRelated(input: {
    query: string;
    conceptNames: string[];
    limit: number;
  }): Promise<SearchResult[]>;
  searchKnowledgeBlocks(input: {
    query: string;
    limit: number;
    includeArchived?: boolean;
    topicIds?: string[];
    queryEmbedding?: number[] | null;
  }): Promise<KnowledgeBlockSearchResult[]>;
  listKnowledgeBlocksByCompiledNoteIds(input: {
    compiledNoteIds: string[];
    limit: number;
    topicIds?: string[];
  }): Promise<KnowledgeBlockSearchResult[]>;
  upsertCompiledNote(input: {
    userId?: string | null;
    targetCompiledNoteId?: string | null;
    domain: string;
    noteType: string;
    title: string;
    bodyMarkdown: string;
    structuredData: unknown;
  }): Promise<CompiledNote>;
  listCompiledNotes(limit: number): Promise<CompiledNote[]>;
  upsertKnowledgeSourceVersion(input: {
    userId?: string | null;
    targetKnowledgeSourceId?: string | null;
    domain: string;
    knowledgeType: string;
    title: string;
    bodyMarkdown: string;
    structuredData: unknown;
    compiledNoteId?: string | null;
    proposalId?: string | null;
    changeSummary?: string | null;
    blocks: CreateKnowledgeBlockInput[];
  }): Promise<KnowledgeSourceSnapshot>;
  applyApprovedKnowledge(input: {
    userId?: string | null;
    targetCompiledNoteId: string | null;
    targetKnowledgeSourceId: string | null;
    domain: string;
    noteType: string;
    title: string;
    bodyMarkdown: string;
    structuredData: unknown;
    proposalId: string;
    changeSummary: string | null;
    blocks: CreateKnowledgeBlockInput[];
    evidenceSourceType: string;
    evidenceSourceId: string;
    rawSourceId: string | null;
    confidence: string;
    impactLevel: number;
    concepts: Array<{ name: string; conceptType: string }>;
  }): Promise<{ compiledNote: CompiledNote; snapshot: KnowledgeSourceSnapshot }>;
  listActiveKnowledgeBlocks(limit: number): Promise<KnowledgeBlock[]>;
  listKnowledgeBlocksNeedingEmbeddings(limit: number): Promise<KnowledgeBlock[]>;
  updateKnowledgeBlockEmbedding(blockId: string, embedding: number[]): Promise<void>;
  createEvidenceLink(input: {
    userId?: string | null;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    confidence: string;
    impactLevel: number;
    approvalStatus: string;
  }): Promise<void>;
  createEvidenceLinksFromSourceChunks(input: {
    userId?: string | null;
    rawSourceId: string;
    targetType: string;
    targetId: string;
    confidence: string;
    impactLevel: number;
    approvalStatus: string;
  }): Promise<number>;
  getKnowledgeSourceTimeline(id: string): Promise<KnowledgeSourceTimeline | null>;
  getKnowledgeSourceTimelineByCompiledNoteId(id: string): Promise<KnowledgeSourceTimeline | null>;
}

function vectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toString()).join(",")}]`;
}

export class PostgresKnowledgeRepository implements KnowledgeRepository {
  private embeddingSupport: boolean | null = null;
  private bm25Support: Bm25SupportStatus | null = null;
  private readonly hybridRetrievalService = new HybridRetrievalService([
    new PostgresFtsRetriever(),
    new PostgresConceptRetriever(),
    new PostgresPgVectorRetriever(() => this.hasEmbeddingSupport()),
    new PostgresBm25Retriever(() => this.getBm25Support()),
  ]);

  private async hasEmbeddingSupport() {
    if (this.embeddingSupport !== null) {
      return this.embeddingSupport;
    }

    const result = await query<{ supported: boolean }>(
      `
        select exists (
          select 1
          from information_schema.columns
          where table_name = 'knowledge_blocks'
            and column_name = 'embedding'
        ) as supported
      `,
    );
    this.embeddingSupport = result.rows[0]?.supported ?? false;
    return this.embeddingSupport;
  }

  private async getBm25Support(): Promise<Bm25SupportStatus> {
    if (this.bm25Support !== null) {
      return this.bm25Support;
    }

    const result = await query<{
      extension_installed: boolean;
      index_exists: boolean;
    }>(
      `
        select
          exists(select 1 from pg_extension where extname = 'pg_search') as extension_installed,
          to_regclass('public.knowledge_blocks_bm25_idx') is not null as index_exists
      `,
    );
    const row = result.rows[0];
    this.bm25Support = row?.extension_installed
      ? row.index_exists
        ? { enabled: true }
        : { enabled: false, reason: "missing_bm25_index" }
      : { enabled: false, reason: "missing_pg_search_extension" };
    return this.bm25Support;
  }

  async upsertConcept(input: { userId?: string | null; name: string; conceptType: string }, db: Db = query) {
    const normalizedName = normalizeConcept(input.name);
    const result = await db<ConceptRow>(
      `
        insert into concepts (user_id, name, normalized_name, concept_type)
        values ($1, $2, $3, $4)
        on conflict (user_id, normalized_name, concept_type)
        do update set name = excluded.name
        returning *
      `,
      [input.userId ?? null, input.name, normalizedName, input.conceptType],
    );

    return mapConcept(result.rows[0]);
  }

  async indexConcept(input: {
    userId?: string | null;
    conceptId: string;
    targetType: string;
    targetId: string;
    relationType: string;
    confidence: string;
    source: string;
  }, db: Db = query) {
    await db(
      `
        insert into concept_index (
          user_id,
          concept_id,
          target_type,
          target_id,
          relation_type,
          confidence,
          source
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (concept_id, target_type, target_id, relation_type)
        do update set confidence = excluded.confidence,
                      source = excluded.source
      `,
      [
        input.userId ?? null,
        input.conceptId,
        input.targetType,
        input.targetId,
        input.relationType,
        input.confidence,
        input.source,
      ],
    );
  }

  async searchRelated(input: { query: string; conceptNames: string[]; limit: number }) {
    const normalizedConcepts = input.conceptNames.map(normalizeConcept);
    const result = await query<SearchResultRow>(
      `
        with query as (
          select plainto_tsquery('english', $1) as ts_query
        ),
        full_text_results as (
          select
            id,
            'compiled_note'::text as target_type,
            title,
            body_markdown,
            domain,
            note_type,
            ts_rank(search_vector, query.ts_query) as rank,
            created_at
          from compiled_notes, query
          where search_vector @@ query.ts_query

          union all

          select
            id,
            'raw_source'::text as target_type,
            title,
            body_markdown,
            domain,
            null::text as note_type,
            ts_rank(search_vector, query.ts_query) as rank,
            created_at
          from raw_sources, query
          where search_vector @@ query.ts_query
        ),
        concept_results as (
          select
            cn.target_id as id,
            cn.target_type,
            coalesce(compiled_notes.title, raw_sources.title) as title,
            coalesce(compiled_notes.body_markdown, raw_sources.body_markdown) as body_markdown,
            coalesce(compiled_notes.domain, raw_sources.domain) as domain,
            compiled_notes.note_type,
            2.0::real as rank,
            coalesce(compiled_notes.created_at, raw_sources.created_at) as created_at
          from concept_index cn
          join concepts c on c.id = cn.concept_id
          left join compiled_notes on cn.target_type = 'compiled_note'
            and compiled_notes.id = cn.target_id
          left join raw_sources on cn.target_type = 'raw_source'
            and raw_sources.id = cn.target_id
          where c.normalized_name = any($2::text[])
        )
        select distinct on (target_type, id)
          id,
          target_type,
          title,
          body_markdown,
          domain,
          note_type,
          rank,
          created_at
        from (
          select * from full_text_results
          union all
          select * from concept_results
        ) combined
        order by target_type, id, rank desc
        limit $3
      `,
      [input.query, normalizedConcepts, input.limit],
    );

    return result.rows.map(mapSearchResult).sort((a, b) => b.rank - a.rank);
  }

  async searchKnowledgeBlocks(input: {
    query: string;
    limit: number;
    includeArchived?: boolean;
    topicIds?: string[];
    queryEmbedding?: number[] | null;
  }): Promise<KnowledgeBlockSearchResult[]> {
    const retrievalResult = await this.hybridRetrievalService.search(input);
    return this.hydrateRankedKnowledgeBlocks({
      candidates: retrievalResult.candidates,
      includeArchived: input.includeArchived ?? false,
      topicIds: input.topicIds ?? [],
      limit: input.limit,
    });
  }

  private async hydrateRankedKnowledgeBlocks(input: {
    candidates: MergedRetrievalCandidate[];
    includeArchived: boolean;
    topicIds: string[];
    limit: number;
  }): Promise<KnowledgeBlockSearchResult[]> {
    if (input.candidates.length === 0) {
      return [];
    }

    const blockResult = await query<KnowledgeBlockSearchRow>(
      `
        with candidate_ranks as (
          select *
          from unnest($1::uuid[], $2::real[]) as candidates(block_id, rank)
        )
        select
          knowledge_blocks.id as block_id,
          knowledge_blocks.knowledge_source_id,
          knowledge_blocks.knowledge_version_id,
          knowledge_versions.compiled_note_id,
          knowledge_sources.title,
          knowledge_sources.domain,
          knowledge_sources.knowledge_type,
          knowledge_versions.version_number,
          knowledge_blocks.block_index,
          knowledge_blocks.heading,
          knowledge_blocks.body_markdown,
          candidate_ranks.rank,
          knowledge_blocks.status,
          knowledge_blocks.updated_at
        from candidate_ranks
        join knowledge_blocks on knowledge_blocks.id = candidate_ranks.block_id
        join knowledge_sources on knowledge_sources.id = knowledge_blocks.knowledge_source_id
        join knowledge_versions on knowledge_versions.id = knowledge_blocks.knowledge_version_id
        where knowledge_sources.status = 'active'
          and ($3::boolean or knowledge_blocks.status = 'active')
          and (
            cardinality($5::uuid[]) = 0
            or exists (
              select 1
              from block_topics
              where block_topics.block_id = knowledge_blocks.id
                and block_topics.topic_id = any($5::uuid[])
            )
          )
        order by candidate_ranks.rank desc, knowledge_blocks.updated_at desc
        limit $4
      `,
      [
        input.candidates.map((candidate) => candidate.blockId),
        input.candidates.map((candidate) => candidate.rank),
        input.includeArchived,
        input.limit,
        input.topicIds,
      ],
    );

    return hydrateKnowledgeBlockSearchRows(blockResult.rows);
  }

  async listKnowledgeBlocksByCompiledNoteIds(input: {
    compiledNoteIds: string[];
    limit: number;
    topicIds?: string[];
  }): Promise<KnowledgeBlockSearchResult[]> {
    if (input.compiledNoteIds.length === 0) {
      return [];
    }

    const blockResult = await query<KnowledgeBlockSearchRow>(
      `
        select
          knowledge_blocks.id as block_id,
          knowledge_blocks.knowledge_source_id,
          knowledge_blocks.knowledge_version_id,
          knowledge_versions.compiled_note_id,
          knowledge_sources.title,
          knowledge_sources.domain,
          knowledge_sources.knowledge_type,
          knowledge_versions.version_number,
          knowledge_blocks.block_index,
          knowledge_blocks.heading,
          knowledge_blocks.body_markdown,
          0.25::real as rank,
          knowledge_blocks.status,
          knowledge_blocks.updated_at
        from knowledge_blocks
        join knowledge_sources on knowledge_sources.id = knowledge_blocks.knowledge_source_id
        join knowledge_versions on knowledge_versions.id = knowledge_blocks.knowledge_version_id
        where knowledge_sources.status = 'active'
          and knowledge_blocks.status = 'active'
          and knowledge_versions.compiled_note_id = any($1::uuid[])
          and (
            cardinality($3::uuid[]) = 0
            or exists (
              select 1
              from block_topics
              where block_topics.block_id = knowledge_blocks.id
                and block_topics.topic_id = any($3::uuid[])
            )
          )
        order by knowledge_blocks.updated_at desc
        limit $2
      `,
      [input.compiledNoteIds, input.limit, input.topicIds ?? []],
    );

    return hydrateKnowledgeBlockSearchRows(blockResult.rows);
  }

  async upsertCompiledNote(input: {
    userId?: string | null;
    targetCompiledNoteId?: string | null;
    domain: string;
    noteType: string;
    title: string;
    bodyMarkdown: string;
    structuredData: unknown;
  }, db: Db = query) {
    if (input.targetCompiledNoteId) {
      const targeted = await db<CompiledNoteRow>(
        `
          update compiled_notes
          set domain = $2,
              note_type = $3,
              title = $4,
              body_markdown = $5,
              structured_data = $6,
              updated_at = now()
          where id = $1
            and status = 'active'
            and user_id is not distinct from $7
          returning *
        `,
        [
          input.targetCompiledNoteId,
          input.domain,
          input.noteType,
          input.title,
          input.bodyMarkdown,
          input.structuredData,
          input.userId ?? null,
        ],
      );
      if (targeted.rows[0]) {
        return mapCompiledNote(targeted.rows[0]);
      }
    }

    const existing = await db<CompiledNoteRow>(
      `
        select *
        from compiled_notes
        where user_id is not distinct from $1
          and domain = $2
          and note_type = $3
          and lower(title) = lower($4)
        limit 1
      `,
      [input.userId ?? null, input.domain, input.noteType, input.title],
    );

    const result = existing.rows[0]
      ? await db<CompiledNoteRow>(
          `
            update compiled_notes
            set body_markdown = $2,
                structured_data = $3,
                updated_at = now()
            where id = $1
            returning *
          `,
          [existing.rows[0].id, input.bodyMarkdown, input.structuredData],
        )
      : await db<CompiledNoteRow>(
          `
            insert into compiled_notes (
              user_id,
              domain,
              note_type,
              title,
              body_markdown,
              structured_data
            )
            values ($1, $2, $3, $4, $5, $6)
            returning *
          `,
          [
            input.userId ?? null,
            input.domain,
            input.noteType,
            input.title,
            input.bodyMarkdown,
            input.structuredData,
          ],
        );

    return mapCompiledNote(result.rows[0]);
  }

  async listCompiledNotes(limit: number) {
    const result = await query<CompiledNoteRow>(
      `
        select *
        from compiled_notes
        where status = 'active'
        order by updated_at desc
        limit $1
      `,
      [limit],
    );

    return result.rows.map(mapCompiledNote);
  }

  async upsertKnowledgeSourceVersion(input: {
    userId?: string | null;
    targetKnowledgeSourceId?: string | null;
    domain: string;
    knowledgeType: string;
    title: string;
    bodyMarkdown: string;
    structuredData: unknown;
    compiledNoteId?: string | null;
    proposalId?: string | null;
    changeSummary?: string | null;
    blocks: CreateKnowledgeBlockInput[];
  }, db?: Db): Promise<KnowledgeSourceSnapshot> {
    // Join an outer transaction when given one; otherwise own a transaction so a
    // standalone call stays atomic.
    const run = async (transactionQuery: Db): Promise<KnowledgeSourceSnapshot> => {
      const existing = input.targetKnowledgeSourceId
        ? await transactionQuery<KnowledgeSourceRow>(
            `
              select *
              from knowledge_sources
              where id = $1
                and status = 'active'
                and user_id is not distinct from $2
              limit 1
            `,
            [input.targetKnowledgeSourceId, input.userId ?? null],
          )
        : input.compiledNoteId
          ? await transactionQuery<KnowledgeSourceRow>(
              `
                select knowledge_sources.*
                from knowledge_sources
                join knowledge_versions
                  on knowledge_versions.knowledge_source_id = knowledge_sources.id
                where knowledge_versions.compiled_note_id = $1
                  and knowledge_sources.status = 'active'
                  and knowledge_sources.user_id is not distinct from $2
                order by knowledge_versions.created_at desc
                limit 1
              `,
              [input.compiledNoteId, input.userId ?? null],
            )
          : await transactionQuery<KnowledgeSourceRow>(
              `
                select *
                from knowledge_sources
                where user_id is not distinct from $1
                  and domain = $2
                  and knowledge_type = $3
                  and lower(title) = lower($4)
                  and status = 'active'
                limit 1
              `,
              [input.userId ?? null, input.domain, input.knowledgeType, input.title],
            );

      const source = existing.rows[0]
        ? mapKnowledgeSource(
            (
              await transactionQuery<KnowledgeSourceRow>(
                `
                  update knowledge_sources
                  set domain = $2,
                      knowledge_type = $3,
                      title = $4,
                      metadata = metadata || $5::jsonb,
                      updated_at = now()
                  where id = $1
                  returning *
                `,
                [
                  existing.rows[0].id,
                  input.domain,
                  input.knowledgeType,
                  input.title,
                  {
                    lastProposalId: input.proposalId ?? null,
                    lastCompiledNoteId: input.compiledNoteId ?? null,
                  },
                ],
              )
            ).rows[0],
          )
        : mapKnowledgeSource(
            (
              await transactionQuery<KnowledgeSourceRow>(
                `
                  insert into knowledge_sources (
                    user_id,
                    domain,
                    knowledge_type,
                    title,
                    metadata
                  )
                  values ($1, $2, $3, $4, $5)
                  returning *
                `,
                [
                  input.userId ?? null,
                  input.domain,
                  input.knowledgeType,
                  input.title,
                  {
                    createdByProposalId: input.proposalId ?? null,
                    compiledNoteId: input.compiledNoteId ?? null,
                  },
                ],
              )
            ).rows[0],
          );

      const versionNumberResult = await transactionQuery<{ version_number: number }>(
        `
          select coalesce(max(version_number), 0) + 1 as version_number
          from knowledge_versions
          where knowledge_source_id = $1
        `,
        [source.id],
      );
      const versionNumber = Number(versionNumberResult.rows[0]?.version_number ?? 1);

      const version = mapKnowledgeVersion(
        (
          await transactionQuery<KnowledgeVersionRow>(
            `
              insert into knowledge_versions (
                knowledge_source_id,
                compiled_note_id,
                proposal_id,
                version_number,
                title,
                body_markdown,
                structured_data,
                change_summary
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8)
              returning *
            `,
            [
              source.id,
              input.compiledNoteId ?? null,
              input.proposalId ?? null,
              versionNumber,
              input.title,
              input.bodyMarkdown,
              input.structuredData,
              input.changeSummary ?? null,
            ],
          )
        ).rows[0],
      );

      await transactionQuery(
        `
          update knowledge_blocks
          set status = 'archived',
              updated_at = now()
          where knowledge_source_id = $1
            and status = 'active'
        `,
        [source.id],
      );

      const savedBlocks: KnowledgeBlock[] = [];
      const structuredTopicIds = topicIdsFrom(input.structuredData);
      for (const block of input.blocks) {
        const blockResult = await transactionQuery<KnowledgeBlockRow>(
          `
            insert into knowledge_blocks (
              knowledge_source_id,
              knowledge_version_id,
              block_index,
              heading,
              body_markdown,
              token_estimate,
              metadata
            )
            values ($1, $2, $3, $4, $5, $6, $7)
            returning *
          `,
          [
            source.id,
            version.id,
            block.blockIndex,
            block.heading ?? null,
            block.bodyMarkdown,
            block.tokenEstimate,
            block.metadata ?? {},
          ],
        );
        const savedBlock = mapKnowledgeBlock(blockResult.rows[0]);
        const blockTopicIds = topicIdsFrom(block.metadata).length
          ? topicIdsFrom(block.metadata)
          : structuredTopicIds;
        for (const topicId of blockTopicIds) {
          await transactionQuery(
            `
              insert into block_topics (block_id, topic_id, confidence, source)
              values ($1, $2, 'high', 'user')
              on conflict do nothing
            `,
            [savedBlock.id, topicId],
          );
        }
        savedBlocks.push(savedBlock);
      }

      const updatedSource = mapKnowledgeSource(
        (
          await transactionQuery<KnowledgeSourceRow>(
            `
              update knowledge_sources
              set current_version_id = $2,
                  updated_at = now()
              where id = $1
              returning *
            `,
            [source.id, version.id],
          )
        ).rows[0],
      );

      return {
        source: updatedSource,
        version,
        blocks: savedBlocks,
      };
    };
    return db ? run(db) : transaction(run);
  }

  /**
   * Apply one approved knowledge item atomically: compiled note + evidence link
   * + versioned knowledge source/blocks + source-chunk evidence + concept index,
   * all in a single transaction. Either everything lands or nothing does — no
   * orphan compiled_notes when a later step fails. Block-building (LLM) and
   * embedding (external) stay OUTSIDE: blocks are passed in, embedding runs after
   * commit by the caller.
   */
  async applyApprovedKnowledge(input: {
    userId?: string | null;
    targetCompiledNoteId: string | null;
    targetKnowledgeSourceId: string | null;
    domain: string;
    noteType: string;
    title: string;
    bodyMarkdown: string;
    structuredData: unknown;
    proposalId: string;
    changeSummary: string | null;
    blocks: CreateKnowledgeBlockInput[];
    evidenceSourceType: string;
    evidenceSourceId: string;
    rawSourceId: string | null;
    confidence: string;
    impactLevel: number;
    concepts: Array<{ name: string; conceptType: string }>;
  }): Promise<{ compiledNote: CompiledNote; snapshot: KnowledgeSourceSnapshot }> {
    return transaction(async (tx) => {
      const compiledNote = await this.upsertCompiledNote(
        {
          userId: input.userId,
          targetCompiledNoteId: input.targetCompiledNoteId,
          domain: input.domain,
          noteType: input.noteType,
          title: input.title,
          bodyMarkdown: input.bodyMarkdown,
          structuredData: input.structuredData,
        },
        tx,
      );

      await this.createEvidenceLink(
        {
          userId: input.userId,
          sourceType: input.evidenceSourceType,
          sourceId: input.evidenceSourceId,
          targetType: "compiled_note",
          targetId: compiledNote.id,
          confidence: input.confidence,
          impactLevel: input.impactLevel,
          approvalStatus: "approved",
        },
        tx,
      );

      const snapshot = await this.upsertKnowledgeSourceVersion(
        {
          userId: input.userId,
          targetKnowledgeSourceId: input.targetKnowledgeSourceId,
          domain: compiledNote.domain,
          knowledgeType: compiledNote.noteType,
          title: compiledNote.title,
          bodyMarkdown: compiledNote.bodyMarkdown,
          structuredData: compiledNote.structuredData,
          compiledNoteId: compiledNote.id,
          proposalId: input.proposalId,
          changeSummary: input.changeSummary,
          blocks: input.blocks,
        },
        tx,
      );

      await this.createEvidenceLink(
        {
          userId: input.userId,
          sourceType: input.evidenceSourceType,
          sourceId: input.evidenceSourceId,
          targetType: "knowledge_version",
          targetId: snapshot.version.id,
          confidence: input.confidence,
          impactLevel: input.impactLevel,
          approvalStatus: "approved",
        },
        tx,
      );

      if (input.rawSourceId) {
        await this.createEvidenceLinksFromSourceChunks(
          {
            userId: input.userId,
            rawSourceId: input.rawSourceId,
            targetType: "knowledge_version",
            targetId: snapshot.version.id,
            confidence: input.confidence,
            impactLevel: input.impactLevel,
            approvalStatus: "approved",
          },
          tx,
        );
      }

      for (const concept of input.concepts) {
        const savedConcept = await this.upsertConcept(
          { userId: input.userId, name: concept.name, conceptType: concept.conceptType },
          tx,
        );
        await this.indexConcept(
          {
            userId: input.userId,
            conceptId: savedConcept.id,
            targetType: "compiled_note",
            targetId: compiledNote.id,
            relationType: "canonicalizes",
            confidence: input.confidence,
            source: "approved_proposal",
          },
          tx,
        );
      }

      return { compiledNote, snapshot };
    });
  }

  async listActiveKnowledgeBlocks(limit: number) {
    const result = await query<KnowledgeBlockRow>(
      `
        select *
        from knowledge_blocks
        where status = 'active'
        order by updated_at desc
        limit $1
      `,
      [limit],
    );

    return result.rows.map(mapKnowledgeBlock);
  }

  async listKnowledgeBlocksNeedingEmbeddings(limit: number) {
    if (!(await this.hasEmbeddingSupport())) {
      return [];
    }

    const result = await query<KnowledgeBlockRow>(
      `
        select *
        from knowledge_blocks
        where status = 'active'
          and embedding is null
        order by updated_at desc
        limit $1
      `,
      [limit],
    );

    return result.rows.map(mapKnowledgeBlock);
  }

  async updateKnowledgeBlockEmbedding(blockId: string, embedding: number[]) {
    if (!(await this.hasEmbeddingSupport())) {
      return;
    }

    await query(
      `
        update knowledge_blocks
        set embedding = $2::vector,
            updated_at = now()
        where id = $1
      `,
      [blockId, vectorLiteral(embedding)],
    );
  }

  async getKnowledgeSourceTimeline(id: string): Promise<KnowledgeSourceTimeline | null> {
    const sourceResult = await query<KnowledgeSourceRow>(
      `
        select *
        from knowledge_sources
        where id = $1
        limit 1
      `,
      [id],
    );
    const source = sourceResult.rows[0] ? mapKnowledgeSource(sourceResult.rows[0]) : null;
    return source ? buildKnowledgeSourceTimeline(source) : null;
  }

  async getKnowledgeSourceTimelineByCompiledNoteId(id: string): Promise<KnowledgeSourceTimeline | null> {
    const sourceResult = await query<KnowledgeSourceRow>(
      `
        select knowledge_sources.*
        from knowledge_sources
        join knowledge_versions on knowledge_versions.knowledge_source_id = knowledge_sources.id
        where knowledge_versions.compiled_note_id = $1
        order by knowledge_versions.created_at desc
        limit 1
      `,
      [id],
    );
    const source = sourceResult.rows[0] ? mapKnowledgeSource(sourceResult.rows[0]) : null;
    return source ? buildKnowledgeSourceTimeline(source) : null;
  }

  async createEvidenceLink(input: {
    userId?: string | null;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    confidence: string;
    impactLevel: number;
    approvalStatus: string;
  }, db: Db = query) {
    await db(
      `
        insert into evidence_links (
          user_id,
          source_type,
          source_id,
          target_type,
          target_id,
          confidence,
          impact_level,
          approval_status
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        input.userId ?? null,
        input.sourceType,
        input.sourceId,
        input.targetType,
        input.targetId,
        input.confidence,
        input.impactLevel,
        input.approvalStatus,
      ],
    );
  }

  async createEvidenceLinksFromSourceChunks(input: {
    userId?: string | null;
    rawSourceId: string;
    targetType: string;
    targetId: string;
    confidence: string;
    impactLevel: number;
    approvalStatus: string;
  }, db: Db = query) {
    const result = await db<{ id: string }>(
      `
        insert into evidence_links (
          user_id,
          source_type,
          source_id,
          target_type,
          target_id,
          confidence,
          impact_level,
          approval_status
        )
        select
          $1,
          'raw_source_chunk',
          raw_source_chunks.id,
          $3,
          $4,
          $5,
          $6,
          $7
        from raw_source_chunks
        where raw_source_chunks.raw_source_id = $2
        order by raw_source_chunks.chunk_index asc
        returning id
      `,
      [
        input.userId ?? null,
        input.rawSourceId,
        input.targetType,
        input.targetId,
        input.confidence,
        input.impactLevel,
        input.approvalStatus,
      ],
    );

    return result.rows.length;
  }
}
