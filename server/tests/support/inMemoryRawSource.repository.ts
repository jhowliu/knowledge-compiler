import type {
  CreateRawSourceChunkInput,
  CreateRawSourceInput,
  RawSourceWithChunks,
  SourceChunkSearchResult,
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
      subtype: input.subtype ?? null,
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
    source.subtype = Object.hasOwn(input, "subtype") ? (input.subtype ?? null) : source.subtype;
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

  async updateExtraction(id: string, extractedData: unknown) {
    const source = await this.getById(id);
    if (!source) {
      throw new Error("Raw source not found");
    }

    source.extractedData = extractedData;
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

  async searchRawSourceChunks(input: {
    query: string;
    limit: number;
  }): Promise<SourceChunkSearchResult[]> {
    const needle = input.query.trim().toLowerCase();
    const hits: SourceChunkSearchResult[] = [];
    for (const source of this.sources) {
      for (const chunk of source.chunks) {
        const haystack = `${chunk.heading ?? ""} ${chunk.bodyMarkdown}`.toLowerCase();
        const lexical = needle.length > 0 && haystack.includes(needle);
        if (lexical) {
          hits.push({
            chunkId: chunk.id,
            rawSourceId: source.id,
            title: source.title,
            heading: chunk.heading,
            bodyMarkdown: chunk.bodyMarkdown,
            sourceRole: source.sourceRole,
            rank: 0.5,
            createdAt: chunk.createdAt,
          });
        }
      }
    }
    return hits.sort((a, b) => b.rank - a.rank).slice(0, input.limit);
  }
}
