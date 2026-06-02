import type {
  GetBlockHistoryOutput,
  GetBlockOutput,
  LookupConceptsOutput,
} from "@knowledge-compiler/agent-contracts";
import { AgentToolService } from "../src/services/agentTool.service.js";
import type { AgentToolReadRepository } from "../src/repositories/agentTool.repository.js";
import { InMemoryExtractionEvalRepository } from "./support/inMemoryExtractionEval.repository.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";

class TestAgentToolReadRepository implements AgentToolReadRepository {
  async getBlock(blockId: string): Promise<GetBlockOutput | null> {
    return {
      block: {
        id: blockId,
        knowledge_source_id: "knowledge-source-1",
        knowledge_version_id: "knowledge-version-1",
        title: "Existing knowledge",
        heading: "Prior claim",
        body_markdown: "The prior version says to scan left to right.",
        status: "active",
      },
      evidence: [],
      links: [],
    };
  }

  async getBlockHistory(): Promise<GetBlockHistoryOutput> {
    return {
      versions: [
        {
          knowledge_version_id: "knowledge-version-1",
          version_number: 1,
          title: "Existing knowledge",
          body_markdown: "The prior version says to scan left to right.",
          created_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    };
  }

  async lookupConcepts(concepts: string[]): Promise<LookupConceptsOutput> {
    return {
      matches: concepts.map((concept, index) => ({
        input: concept,
        concept_id: `concept-${index + 1}`,
        canonical_label: concept,
        match_type: "exact",
        linked_block_ids: [],
      })),
    };
  }
}

describe("agent tool service", () => {
  test("exposes typed source, search, concept, block, history, and proposal tools", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const extractionEvalRepository = new InMemoryExtractionEvalRepository();
    const readRepository = new TestAgentToolReadRepository();
    const service = new AgentToolService(
      rawSourceRepository,
      knowledgeRepository,
      proposalRepository,
      extractionEvalRepository,
      readRepository,
    );

    const rawSource = await rawSourceRepository.create(
      {
        title: "Merge Sorted Array",
        bodyMarkdown: "However, scan from the end to avoid overwriting values.",
        sourceRole: "personal_note",
        sourceType: "manual",
      },
      [
        {
          chunkIndex: 0,
          heading: "Merge Sorted Array",
          bodyMarkdown: "However, scan from the end to avoid overwriting values.",
          tokenEstimate: 12,
        },
      ],
    );
    await knowledgeRepository.upsertKnowledgeSourceVersion({
      knowledgeType: "knowledge_note",
      title: "Merge Sorted Array",
      bodyMarkdown: "Scan arrays from the end.",
      structuredData: {},
      blocks: [
        {
          blockIndex: 0,
          heading: "Key idea",
          bodyMarkdown: "Scan arrays from the end.",
          tokenEstimate: 8,
          metadata: {},
        },
      ],
    });

    const sourceOutput = await service.getSource({ source_id: rawSource.id });
    const conceptOutput = await service.lookupConcepts({
      concepts: ["Merge Sorted Array"],
      fuzzy: true,
    });
    const searchOutput = await service.searchBlocks({
      query: "scan arrays end",
      limit: 5,
    });
    const blockOutput = await service.getBlock({ block_id: "knowledge-block-1" });
    const historyOutput = await service.getBlockHistory({
      block_id: "knowledge-block-1",
      limit: 5,
    });
    const proposalOutput = await service.draftProposal(
      {
        agentRunId: "agent-run-1",
        rawNoteId: "raw-note-1",
        sourceId: rawSource.id,
        userId: null,
        sourceText: rawSource.bodyMarkdown,
        chunks: sourceOutput.chunks,
        existingBlocksContext: searchOutput.results,
      },
      {
        reasoning_summary: "Update the canonical note using the grounded source span.",
        incomplete_reasoning: false,
        items: [
          {
            action: "upsert_knowledge",
            target_block_id: blockOutput.block.id,
            title: "Merge Sorted Array",
            body_markdown: "However, scan from the end to avoid overwriting values.",
            source_concept_ids: conceptOutput.matches
              .map((match) => match.concept_id)
              .filter((id): id is string => Boolean(id)),
            source_spans: [
              {
                chunk_index: 0,
                char_start: 0,
                char_end: 55,
                text: "However, scan from the end to avoid overwriting values.",
              },
            ],
            confidence: "high",
            conflict_detected: true,
            conflict_summary: "This revises the prior scan direction.",
            conflict_resolution: "update",
          },
        ],
        suggested_links: [
          {
            source_block_id: null,
            target_block_id: "knowledge-block-1",
            relation_type: "related_concept",
            confidence: "medium",
            rationale: "Same problem note.",
          },
        ],
      },
    );

    expect(sourceOutput.source.id).toBe(rawSource.id);
    expect(searchOutput.results[0]).toMatchObject({
      block_id: "knowledge-block-1",
      title: "Merge Sorted Array",
    });
    expect(blockOutput.block.id).toBe("knowledge-block-1");
    expect(historyOutput.versions).toHaveLength(1);
    expect(proposalOutput).toMatchObject({
      proposal_id: "proposal-1",
      item_count: 1,
      link_count: 1,
    });
    expect(extractionEvalRepository.extractionEvals[0]).toMatchObject({
      agentRunId: "agent-run-1",
      sourceId: rawSource.id,
      verdict: "pass",
    });
    expect(proposalRepository.proposals[0].items[0]).toMatchObject({
      actionType: "upsert_knowledge",
      sourceSpans: [
        expect.objectContaining({
          chunk_index: 0,
          text: "However, scan from the end to avoid overwriting values.",
        }),
      ],
      conflictDetected: true,
      conflictSummary: "This revises the prior scan direction.",
      conflictResolution: "update",
      evalVerdict: "pass",
    });
    expect(proposalRepository.proposals[0].items[1]).toMatchObject({
      actionType: "create_link",
      evalVerdict: "pass",
    });
  });
});
