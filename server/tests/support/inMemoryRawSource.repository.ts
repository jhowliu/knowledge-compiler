import type {
  CreateRawSourceChunkInput,
  CreateRawSourceInput,
  RawSourceWithChunks,
  UpdateRawSourceInput,
} from "../../src/domain/rawSource.js";
import type { RawSourceRepository } from "../../src/repositories/rawSource.repository.js";

export class InMemoryRawSourceRepository implements RawSourceRepository {
  readonly sources: RawSourceWithChunks[] = [];

  async create(input: CreateRawSourceInput, chunks: CreateRawSourceChunkInput[]) {
    const source: RawSourceWithChunks = {
      id: `raw-source-${this.sources.length + 1}`,
      userId: input.userId ?? null,
      domain: input.domain ?? null,
      sourceType: input.sourceType ?? "markdown",
      sourceRole: input.sourceRole ?? "personal_note",
      title: input.title ?? null,
      bodyMarkdown: input.bodyMarkdown,
      metadata: input.metadata ?? {},
      extractedData: {},
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
      chunks: chunks.map((chunk) => ({
        id: `raw-source-${this.sources.length + 1}-chunk-${chunk.chunkIndex}`,
        rawSourceId: `raw-source-${this.sources.length + 1}`,
        chunkIndex: chunk.chunkIndex,
        heading: chunk.heading ?? null,
        bodyMarkdown: chunk.bodyMarkdown,
        tokenEstimate: chunk.tokenEstimate,
        metadata: chunk.metadata ?? {},
        createdAt: new Date("2026-05-24T00:00:00.000Z"),
      })),
    };
    this.sources.unshift(source);
    return source;
  }

  async getById(id: string) {
    return this.sources.find((source) => source.id === id) ?? null;
  }

  async listRecent(limit: number) {
    return this.sources.slice(0, limit);
  }

  async update(id: string, input: UpdateRawSourceInput, chunks: CreateRawSourceChunkInput[]) {
    const source = await this.getById(id);
    if (!source) {
      return null;
    }

    source.domain = input.domain ?? null;
    source.sourceType = input.sourceType ?? "markdown";
    source.sourceRole = input.sourceRole ?? "personal_note";
    source.title = input.title ?? null;
    source.bodyMarkdown = input.bodyMarkdown;
    source.metadata = input.metadata ?? {};
    source.extractedData = {};
    source.updatedAt = new Date("2026-05-24T01:00:00.000Z");
    source.chunks = chunks.map((chunk) => ({
      id: `${id}-chunk-${chunk.chunkIndex}`,
      rawSourceId: id,
      chunkIndex: chunk.chunkIndex,
      heading: chunk.heading ?? null,
      bodyMarkdown: chunk.bodyMarkdown,
      tokenEstimate: chunk.tokenEstimate,
      metadata: chunk.metadata ?? {},
      createdAt: new Date("2026-05-24T01:00:00.000Z"),
    }));
    return source;
  }

  async updateExtraction(id: string, extractedData: unknown, domain: string | null) {
    const source = await this.getById(id);
    if (!source) {
      throw new Error("Raw source not found");
    }

    source.extractedData = extractedData;
    source.domain = domain ?? source.domain;
    source.updatedAt = new Date("2026-05-24T01:00:00.000Z");
    return source;
  }

  async delete(id: string) {
    const index = this.sources.findIndex((source) => source.id === id);
    if (index === -1) {
      return false;
    }
    this.sources.splice(index, 1);
    return true;
  }
}
