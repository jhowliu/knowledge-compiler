import request from "supertest";
import { createApp } from "../src/app.js";
import type { KnowledgeExtraction } from "../src/domain/compiler.js";
import type { SearchResult } from "../src/domain/knowledge.js";
import type { WikiIndexingSource } from "../src/services/wikiIndexer.service.js";
import { InMemoryAgentRunRepository } from "./support/inMemoryAgentRun.repository.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteLinkRepository } from "./support/inMemoryNoteLink.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";
import { InMemoryRawNoteRepository } from "./support/inMemoryRawNote.repository.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";

const routeWikiIndexer = {
  async extract() {
    return {
      provider: "openai" as const,
      extraction: {
        domain: "knowledge_workspace",
        knowledgeType: "knowledge_note",
        title: "Source-first Indexing",
        summary: "Index source chunks before drafting approved knowledge.",
        concepts: [
          {
            name: "Source-first Indexing",
            type: "method",
            specificity: "specific",
            confidence: "high" as const,
          },
        ],
        claims: [
          {
            text: "Source chunks should be indexed before drafting approved knowledge.",
            confidence: "high" as const,
            evidenceChunkIds: [],
          },
        ],
        methods: [
          {
            name: "Source-first Indexing",
            purpose: "Compile from source chunks while preserving evidence.",
            steps: ["Compile from /sources/:id/compile."],
            conditions: ["A raw source has chunk evidence."],
          },
        ],
        examples: [],
        constraints: [],
        confidence: "high" as const,
      } satisfies KnowledgeExtraction,
    };
  },
  draftProposal(
    source: WikiIndexingSource,
    extraction: KnowledgeExtraction,
    relatedNotes: SearchResult[],
  ) {
    return {
      detectedDomain: extraction.domain,
      detectedKnowledgeType: "knowledge_note",
      impactLevel: 2,
      confidence: extraction.confidence,
      rationale: `Indexed ${source.chunks.length} chunks and ${relatedNotes.length} related notes.`,
      items: [
        {
          actionType: "upsert_knowledge",
          targetType: "knowledge_source",
          payload: {
            domain: extraction.domain,
            knowledgeType: "knowledge_note",
            title: source.title ?? "Untitled source",
            bodyMarkdown: extraction.summary,
            structuredData: { rawSourceId: source.rawSourceId },
          },
          rationale: "Create approved knowledge from this source.",
        },
      ],
    };
  },
};

describe("raw source routes", () => {
  test("POST /sources stores a reference source with chunks", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
      enablePhaseOneWorkflow: false,
    });

    const response = await request(app).post("/sources").send({
      sourceRole: "reference",
      sourceType: "paper",
      title: "Attention Is All You Need",
      bodyMarkdown: "# Transformer\n\nSelf-attention replaces recurrence.",
    });

    expect(response.status).toBe(201);
    expect(response.body.rawSource).toMatchObject({
      projectId: rawSourceRepository.projects[0].id,
      folderId: null,
      sourceRole: "reference",
      sourceType: "paper",
      title: "Attention Is All You Need",
    });
    expect(response.body.rawSource.chunks).toHaveLength(1);
    expect(response.body.rawSource.chunks[0]).toMatchObject({
      chunkIndex: 0,
      heading: "Transformer",
    });
  });

  test("GET /sources/organization lists projects with source counts", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
      enablePhaseOneWorkflow: false,
    });
    await request(app).post("/sources").send({
      title: "Personal source",
      bodyMarkdown: "A personal note.",
    });
    await request(app).post("/sources").send({
      sourceRole: "reference",
      title: "Reference source",
      bodyMarkdown: "A reference note.",
    });

    const response = await request(app).get("/sources/organization");

    expect(response.status).toBe(200);
    expect(response.body.sourceOrganization.projects).toEqual([
      expect.objectContaining({
        id: rawSourceRepository.projects[0].id,
        name: "Default project",
        sourceCount: 2,
        uncategorizedSourceCount: 2,
        folders: [],
      }),
    ]);
  });

  test("POST /sources/projects and folders creates organization nodes", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
      enablePhaseOneWorkflow: false,
    });

    const projectResponse = await request(app).post("/sources/projects").send({
      name: "Research",
    });
    const folderResponse = await request(app)
      .post(`/sources/projects/${projectResponse.body.sourceProject.id}/folders`)
      .send({
        name: "Papers",
      });

    expect(projectResponse.status).toBe(201);
    expect(projectResponse.body.sourceProject).toMatchObject({
      id: projectResponse.body.sourceProject.id,
      name: "Research",
      sourceCount: 0,
    });
    expect(folderResponse.status).toBe(201);
    expect(folderResponse.body.sourceFolder).toMatchObject({
      id: folderResponse.body.sourceFolder.id,
      projectId: projectResponse.body.sourceProject.id,
      name: "Papers",
      sourceCount: 0,
    });
  });

  test("PATCH /sources/projects/:projectId and folders/:folderId renames organization nodes", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
      enablePhaseOneWorkflow: false,
    });
    const projectResponse = await request(app).post("/sources/projects").send({
      name: "Research",
    });
    const folderResponse = await request(app)
      .post(`/sources/projects/${projectResponse.body.sourceProject.id}/folders`)
      .send({
        name: "Papers",
      });
    const sourceResponse = await request(app).post("/sources").send({
      projectId: projectResponse.body.sourceProject.id,
      folderId: folderResponse.body.sourceFolder.id,
      title: "Renamed source",
      bodyMarkdown: "Keep this source in the same folder.",
    });

    const renameProjectResponse = await request(app)
      .patch(`/sources/projects/${projectResponse.body.sourceProject.id}`)
      .send({
        name: "LLM Research",
      });
    const renameFolderResponse = await request(app)
      .patch(
        `/sources/projects/${projectResponse.body.sourceProject.id}/folders/${folderResponse.body.sourceFolder.id}`,
      )
      .send({
        name: "Transformer Papers",
      });
    const organizationResponse = await request(app).get("/sources/organization");

    expect(renameProjectResponse.status).toBe(200);
    expect(renameProjectResponse.body.sourceProject).toMatchObject({
      id: projectResponse.body.sourceProject.id,
      name: "LLM Research",
      sourceCount: 1,
      uncategorizedSourceCount: 0,
    });
    expect(renameFolderResponse.status).toBe(200);
    expect(renameFolderResponse.body.sourceFolder).toMatchObject({
      id: folderResponse.body.sourceFolder.id,
      projectId: projectResponse.body.sourceProject.id,
      name: "Transformer Papers",
      sourceCount: 1,
    });
    expect(organizationResponse.body.sourceOrganization.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: projectResponse.body.sourceProject.id,
          name: "LLM Research",
          sourceCount: 1,
          folders: [
            expect.objectContaining({
              id: folderResponse.body.sourceFolder.id,
              name: "Transformer Papers",
              sourceCount: 1,
            }),
          ],
        }),
      ]),
    );
    expect(rawSourceRepository.sources[0]).toMatchObject({
      id: sourceResponse.body.rawSource.id,
      projectId: projectResponse.body.sourceProject.id,
      folderId: folderResponse.body.sourceFolder.id,
    });
  });

  test("DELETE /sources/projects/:projectId/folders/:folderId removes empty folders", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
      enablePhaseOneWorkflow: false,
    });
    const projectResponse = await request(app).post("/sources/projects").send({
      name: "Research",
    });
    const folderResponse = await request(app)
      .post(`/sources/projects/${projectResponse.body.sourceProject.id}/folders`)
      .send({
        name: "Empty folder",
      });

    const deleteResponse = await request(app).delete(
      `/sources/projects/${projectResponse.body.sourceProject.id}/folders/${folderResponse.body.sourceFolder.id}`,
    );
    const organizationResponse = await request(app).get("/sources/organization");

    expect(deleteResponse.status).toBe(204);
    expect(organizationResponse.body.sourceOrganization.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: projectResponse.body.sourceProject.id,
          folders: [],
        }),
      ]),
    );
  });

  test("DELETE /sources/projects/:projectId removes empty custom projects", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
      enablePhaseOneWorkflow: false,
    });
    const projectResponse = await request(app).post("/sources/projects").send({
      name: "Temporary project",
    });

    const deleteResponse = await request(app).delete(
      `/sources/projects/${projectResponse.body.sourceProject.id}`,
    );
    const organizationResponse = await request(app).get("/sources/organization");

    expect(deleteResponse.status).toBe(204);
    expect(organizationResponse.body.sourceOrganization.projects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: projectResponse.body.sourceProject.id,
        }),
      ]),
    );
  });

  test("DELETE /sources projects and folders blocks non-empty or system nodes", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
      enablePhaseOneWorkflow: false,
    });
    const projectResponse = await request(app).post("/sources/projects").send({
      name: "Research",
    });
    const folderResponse = await request(app)
      .post(`/sources/projects/${projectResponse.body.sourceProject.id}/folders`)
      .send({
        name: "Papers",
      });
    await request(app).post("/sources").send({
      projectId: projectResponse.body.sourceProject.id,
      folderId: folderResponse.body.sourceFolder.id,
      title: "Keep me",
      bodyMarkdown: "This source keeps its folder and project non-empty.",
    });

    const nonEmptyFolderResponse = await request(app).delete(
      `/sources/projects/${projectResponse.body.sourceProject.id}/folders/${folderResponse.body.sourceFolder.id}`,
    );
    const nonEmptyProjectResponse = await request(app).delete(
      `/sources/projects/${projectResponse.body.sourceProject.id}`,
    );
    const defaultProjectResponse = await request(app).delete(
      `/sources/projects/${rawSourceRepository.projects[0].id}`,
    );

    expect(nonEmptyFolderResponse.status).toBe(409);
    expect(nonEmptyFolderResponse.body.error).toBe("Move sources before deleting this folder");
    expect(nonEmptyProjectResponse.status).toBe(409);
    expect(nonEmptyProjectResponse.body.error).toBe(
      "Move sources and delete folders before deleting this project",
    );
    expect(defaultProjectResponse.status).toBe(409);
    expect(defaultProjectResponse.body.error).toBe("Default source project cannot be deleted");
  });

  test("PATCH /sources/:id/organization moves a source without re-chunking", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
      enablePhaseOneWorkflow: false,
    });
    const sourceResponse = await request(app).post("/sources").send({
      title: "Move me",
      bodyMarkdown: "# Original\n\nKeep these chunks.",
    });
    const originalChunkId = sourceResponse.body.rawSource.chunks[0].id;
    const projectResponse = await request(app).post("/sources/projects").send({
      name: "Research",
    });
    const folderResponse = await request(app)
      .post(`/sources/projects/${projectResponse.body.sourceProject.id}/folders`)
      .send({
        name: "Papers",
      });

    const moveResponse = await request(app)
      .patch(`/sources/${sourceResponse.body.rawSource.id}/organization`)
      .send({
        projectId: projectResponse.body.sourceProject.id,
        folderId: folderResponse.body.sourceFolder.id,
      });
    const organizationResponse = await request(app).get("/sources/organization");

    expect(moveResponse.status).toBe(200);
    expect(moveResponse.body.rawSource).toMatchObject({
      id: sourceResponse.body.rawSource.id,
      projectId: projectResponse.body.sourceProject.id,
      folderId: folderResponse.body.sourceFolder.id,
      title: "Move me",
    });
    expect(moveResponse.body.rawSource.chunks[0].id).toBe(originalChunkId);
    expect(organizationResponse.body.sourceOrganization.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: projectResponse.body.sourceProject.id,
          sourceCount: 1,
          uncategorizedSourceCount: 0,
          folders: [
            expect.objectContaining({
              id: folderResponse.body.sourceFolder.id,
              sourceCount: 1,
            }),
          ],
        }),
      ]),
    );
  });

  test("POST /sources rejects unsupported source roles", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
      enablePhaseOneWorkflow: false,
    });

    const response = await request(app).post("/sources").send({
      sourceRole: "review_task",
      title: "Nope",
      bodyMarkdown: "This role should not be accepted.",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
    expect(rawSourceRepository.sources).toHaveLength(0);
  });

  test("POST /sources/:id/compile queues source-first indexing and creates compatibility raw note", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const rawNoteRepository = new InMemoryRawNoteRepository();
    const agentRunRepository = new InMemoryAgentRunRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const app = createApp({
      rawSourceRepository,
      rawNoteRepository,
      agentRunRepository,
      proposalRepository,
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteLinkRepository: new InMemoryNoteLinkRepository(),
      wikiIndexer: routeWikiIndexer,
    });
    const createResponse = await request(app).post("/sources").send({
      sourceRole: "personal_note",
      sourceType: "markdown",
      title: "Source-first note",
      bodyMarkdown: "# Source flow\n\nCompile this source through chunks.",
    });

    const response = await request(app)
      .post(`/sources/${createResponse.body.rawSource.id}/compile`)
      .send({});

    expect(response.status).toBe(202);
    expect(response.body.agentRunId).toBeTruthy();
    expect(response.body.rawSource).toMatchObject({
      id: createResponse.body.rawSource.id,
      title: "Source-first note",
    });
    expect(response.body.rawNote).toMatchObject({
      rawSourceId: createResponse.body.rawSource.id,
      title: "Source-first note",
    });
    expect(agentRunRepository.agentRuns[0]).toMatchObject({
      runType: "compile_raw_note",
      input: {
        rawSourceId: createResponse.body.rawSource.id,
        rawNoteId: response.body.rawNote.id,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(proposalRepository.proposals).toHaveLength(1);
    expect(proposalRepository.proposals[0].rawNoteId).toBe(response.body.rawNote.id);
  });
});
