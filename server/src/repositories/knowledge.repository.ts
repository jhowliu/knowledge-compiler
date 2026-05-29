import { query, transaction } from "../db/postgres.js";
import type {
  CompiledNote,
  Concept,
  CreateKnowledgeBlockInput,
  KnowledgeBlock,
  KnowledgeBlockSearchResult,
  KnowledgeEvidenceReference,
  KnowledgeSource,
  KnowledgeSourceSnapshot,
  KnowledgeVersion,
  Mistake,
  ReadinessItem,
  ReviewTask,
  SearchResult,
} from "../domain/knowledge.js";

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

type MistakeRow = {
  id: string;
  user_id: string | null;
  domain: string;
  category: string | null;
  title: string;
  description: string;
  status: string;
  evidence_count: number;
  created_at: Date;
  updated_at: Date;
};

type ReviewTaskRow = {
  id: string;
  user_id: string | null;
  domain: string;
  title: string;
  description: string;
  status: string;
  due_at: Date | null;
  source_type: string | null;
  source_id: string | null;
  created_at: Date;
  updated_at: Date;
};

type ReadinessItemRow = {
  id: string;
  user_id: string | null;
  domain: string;
  area: string;
  status: "Missing" | "Weak" | "Needs Review" | "Okay" | "Strong";
  rationale: string | null;
  last_evidence_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type SearchResultRow = {
  id: string;
  target_type: "raw_note" | "compiled_note";
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

function mapMistake(row: MistakeRow): Mistake {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
    category: row.category,
    title: row.title,
    description: row.description,
    status: row.status,
    evidenceCount: row.evidence_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReviewTask(row: ReviewTaskRow): ReviewTask {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
    title: row.title,
    description: row.description,
    status: row.status,
    dueAt: row.due_at,
    sourceType: row.source_type,
    sourceId: row.source_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReadinessItem(row: ReadinessItemRow): ReadinessItem {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
    area: row.area,
    status: row.status,
    rationale: row.rationale,
    lastEvidenceAt: row.last_evidence_at,
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
  }): Promise<KnowledgeBlockSearchResult[]>;
  upsertCompiledNote(input: {
    userId?: string | null;
    domain: string;
    noteType: string;
    title: string;
    bodyMarkdown: string;
    structuredData: unknown;
  }): Promise<CompiledNote>;
  listCompiledNotes(limit: number): Promise<CompiledNote[]>;
  listReviewMaps(limit: number): Promise<CompiledNote[]>;
  upsertKnowledgeSourceVersion(input: {
    userId?: string | null;
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
  listActiveKnowledgeBlocks(limit: number): Promise<KnowledgeBlock[]>;
  upsertMistake(input: {
    userId?: string | null;
    domain: string;
    category?: string | null;
    title: string;
    description: string;
  }): Promise<Mistake>;
  listMistakes(limit: number): Promise<Mistake[]>;
  createReviewTask(input: {
    userId?: string | null;
    domain: string;
    title: string;
    description: string;
    sourceType?: string | null;
    sourceId?: string | null;
  }): Promise<ReviewTask>;
  listReviewTasks(limit: number): Promise<ReviewTask[]>;
  completeReviewTask(id: string): Promise<ReviewTask | null>;
  upsertReadinessItem(input: {
    userId?: string | null;
    domain: string;
    area: string;
    status: "Missing" | "Weak" | "Needs Review" | "Okay" | "Strong";
    rationale: string;
  }): Promise<ReadinessItem>;
  listReadinessItems(limit: number): Promise<ReadinessItem[]>;
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
}

export class PostgresKnowledgeRepository implements KnowledgeRepository {
  async upsertConcept(input: { userId?: string | null; name: string; conceptType: string }) {
    const normalizedName = normalizeConcept(input.name);
    const result = await query<ConceptRow>(
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
  }) {
    await query(
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
            'raw_note'::text as target_type,
            title,
            body_markdown,
            domain,
            null::text as note_type,
            ts_rank(search_vector, query.ts_query) as rank,
            created_at
          from raw_notes, query
          where search_vector @@ query.ts_query
        ),
        concept_results as (
          select
            cn.target_id as id,
            cn.target_type,
            coalesce(compiled_notes.title, raw_notes.title) as title,
            coalesce(compiled_notes.body_markdown, raw_notes.body_markdown) as body_markdown,
            coalesce(compiled_notes.domain, raw_notes.domain) as domain,
            compiled_notes.note_type,
            2.0::real as rank,
            coalesce(compiled_notes.created_at, raw_notes.created_at) as created_at
          from concept_index cn
          join concepts c on c.id = cn.concept_id
          left join compiled_notes on cn.target_type = 'compiled_note'
            and compiled_notes.id = cn.target_id
          left join raw_notes on cn.target_type = 'raw_note'
            and raw_notes.id = cn.target_id
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
  }): Promise<KnowledgeBlockSearchResult[]> {
    const blockResult = await query<KnowledgeBlockSearchRow>(
      `
        with query as (
          select plainto_tsquery('english', $1) as ts_query
        )
        select
          knowledge_blocks.id as block_id,
          knowledge_blocks.knowledge_source_id,
          knowledge_blocks.knowledge_version_id,
          knowledge_sources.title,
          knowledge_sources.domain,
          knowledge_sources.knowledge_type,
          knowledge_versions.version_number,
          knowledge_blocks.block_index,
          knowledge_blocks.heading,
          knowledge_blocks.body_markdown,
          ts_rank(knowledge_blocks.search_vector, query.ts_query) as rank,
          knowledge_blocks.status,
          knowledge_blocks.updated_at
        from knowledge_blocks
        join knowledge_sources on knowledge_sources.id = knowledge_blocks.knowledge_source_id
        join knowledge_versions on knowledge_versions.id = knowledge_blocks.knowledge_version_id
        cross join query
        where knowledge_sources.status = 'active'
          and ($2::boolean or knowledge_blocks.status = 'active')
          and knowledge_blocks.search_vector @@ query.ts_query
        order by rank desc, knowledge_blocks.updated_at desc
        limit $3
      `,
      [input.query, input.includeArchived ?? false, input.limit],
    );

    if (blockResult.rows.length === 0) {
      return [];
    }

    const blockIds = blockResult.rows.map((row) => row.block_id);
    const versionIds = [...new Set(blockResult.rows.map((row) => row.knowledge_version_id))];
    const sourceIds = [...new Set(blockResult.rows.map((row) => row.knowledge_source_id))];
    const evidenceResult = await query<EvidenceReferenceRow>(
      `
        select
          evidence_links.id,
          evidence_links.source_type,
          evidence_links.source_id,
          coalesce(raw_notes.title, direct_sources.title, chunk_sources.title, note_sources.title, chunks.heading) as source_title,
          coalesce(direct_chunks.raw_source_id, direct_sources.id, note_sources.id) as raw_source_id,
          coalesce(chunk_sources.title, direct_sources.title, note_sources.title) as raw_source_title,
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
        left join raw_notes
          on evidence_links.source_type = 'raw_note'
          and raw_notes.id = evidence_links.source_id
        left join raw_sources note_sources
          on note_sources.id = raw_notes.raw_source_id
        left join lateral (
          select raw_source_chunks.*
          from raw_source_chunks
          where raw_source_chunks.raw_source_id = coalesce(
            direct_chunks.raw_source_id,
            direct_sources.id,
            note_sources.id
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
      [blockIds, versionIds, sourceIds],
    );

    const evidenceByTarget = new Map<string, KnowledgeEvidenceReference[]>();
    for (const row of evidenceResult.rows) {
      const key = evidenceKey(row.target_type, row.target_id);
      evidenceByTarget.set(key, [...(evidenceByTarget.get(key) ?? []), mapEvidenceReference(row)]);
    }

    return blockResult.rows.map((row) => {
      const evidenceReferences = [
        ...(evidenceByTarget.get(evidenceKey("knowledge_block", row.block_id)) ?? []),
        ...(evidenceByTarget.get(evidenceKey("knowledge_version", row.knowledge_version_id)) ?? []),
        ...(evidenceByTarget.get(evidenceKey("knowledge_source", row.knowledge_source_id)) ?? []),
      ];
      return mapKnowledgeBlockSearchResult(row, evidenceReferences);
    });
  }

  async upsertCompiledNote(input: {
    userId?: string | null;
    domain: string;
    noteType: string;
    title: string;
    bodyMarkdown: string;
    structuredData: unknown;
  }) {
    const existing = await query<CompiledNoteRow>(
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
      ? await query<CompiledNoteRow>(
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
      : await query<CompiledNoteRow>(
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

  async listReviewMaps(limit: number) {
    const result = await query<CompiledNoteRow>(
      `
        select *
        from compiled_notes
        where status = 'active'
          and note_type = 'review_map'
        order by updated_at desc
        limit $1
      `,
      [limit],
    );

    return result.rows.map(mapCompiledNote);
  }

  async upsertKnowledgeSourceVersion(input: {
    userId?: string | null;
    domain: string;
    knowledgeType: string;
    title: string;
    bodyMarkdown: string;
    structuredData: unknown;
    compiledNoteId?: string | null;
    proposalId?: string | null;
    changeSummary?: string | null;
    blocks: CreateKnowledgeBlockInput[];
  }): Promise<KnowledgeSourceSnapshot> {
    return transaction(async (transactionQuery) => {
      const existing = await transactionQuery<KnowledgeSourceRow>(
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
                  set title = $2,
                      metadata = metadata || $3::jsonb,
                      updated_at = now()
                  where id = $1
                  returning *
                `,
                [
                  existing.rows[0].id,
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
        savedBlocks.push(mapKnowledgeBlock(blockResult.rows[0]));
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

  async upsertMistake(input: {
    userId?: string | null;
    domain: string;
    category?: string | null;
    title: string;
    description: string;
  }) {
    const existing = await query<MistakeRow>(
      `
        select *
        from mistakes
        where user_id is not distinct from $1
          and domain = $2
          and lower(title) = lower($3)
        limit 1
      `,
      [input.userId ?? null, input.domain, input.title],
    );

    const result = existing.rows[0]
      ? await query<MistakeRow>(
          `
            update mistakes
            set evidence_count = evidence_count + 1,
                description = case
                  when length($2) > length(description) then $2
                  else description
                end,
                updated_at = now()
            where id = $1
            returning *
          `,
          [existing.rows[0].id, input.description],
        )
      : await query<MistakeRow>(
          `
            insert into mistakes (
              user_id,
              domain,
              category,
              title,
              description,
              evidence_count
            )
            values ($1, $2, $3, $4, $5, 1)
            returning *
          `,
          [input.userId ?? null, input.domain, input.category ?? null, input.title, input.description],
        );

    return mapMistake(result.rows[0]);
  }

  async listMistakes(limit: number) {
    const result = await query<MistakeRow>(
      `
        select *
        from mistakes
        order by evidence_count desc, updated_at desc
        limit $1
      `,
      [limit],
    );

    return result.rows.map(mapMistake);
  }

  async createReviewTask(input: {
    userId?: string | null;
    domain: string;
    title: string;
    description: string;
    sourceType?: string | null;
    sourceId?: string | null;
  }) {
    const result = await query<ReviewTaskRow>(
      `
        insert into review_tasks (
          user_id,
          domain,
          title,
          description,
          source_type,
          source_id
        )
        values ($1, $2, $3, $4, $5, $6)
        returning *
      `,
      [
        input.userId ?? null,
        input.domain,
        input.title,
        input.description,
        input.sourceType ?? null,
        input.sourceId ?? null,
      ],
    );

    return mapReviewTask(result.rows[0]);
  }

  async listReviewTasks(limit: number) {
    const result = await query<ReviewTaskRow>(
      `
        select *
        from review_tasks
        order by case status when 'open' then 0 else 1 end,
                 created_at desc
        limit $1
      `,
      [limit],
    );

    return result.rows.map(mapReviewTask);
  }

  async completeReviewTask(id: string) {
    const result = await query<ReviewTaskRow>(
      `
        update review_tasks
        set status = 'completed',
            updated_at = now()
        where id = $1
        returning *
      `,
      [id],
    );

    return result.rows[0] ? mapReviewTask(result.rows[0]) : null;
  }

  async upsertReadinessItem(input: {
    userId?: string | null;
    domain: string;
    area: string;
    status: "Missing" | "Weak" | "Needs Review" | "Okay" | "Strong";
    rationale: string;
  }) {
    const existing = await query<ReadinessItemRow>(
      `
        select *
        from readiness_items
        where user_id is not distinct from $1
          and domain = $2
          and lower(area) = lower($3)
        limit 1
      `,
      [input.userId ?? null, input.domain, input.area],
    );

    const result = existing.rows[0]
      ? await query<ReadinessItemRow>(
          `
            update readiness_items
            set status = $2,
                rationale = $3,
                last_evidence_at = now(),
                updated_at = now()
            where id = $1
            returning *
          `,
          [existing.rows[0].id, input.status, input.rationale],
        )
      : await query<ReadinessItemRow>(
          `
            insert into readiness_items (
              user_id,
              domain,
              area,
              status,
              rationale,
              last_evidence_at
            )
            values ($1, $2, $3, $4, $5, now())
            returning *
          `,
          [input.userId ?? null, input.domain, input.area, input.status, input.rationale],
        );

    return mapReadinessItem(result.rows[0]);
  }

  async listReadinessItems(limit: number) {
    const result = await query<ReadinessItemRow>(
      `
        select *
        from readiness_items
        order by updated_at desc
        limit $1
      `,
      [limit],
    );

    return result.rows.map(mapReadinessItem);
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
  }) {
    await query(
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
}
