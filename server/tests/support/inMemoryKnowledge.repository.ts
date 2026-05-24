import type {
  CompiledNote,
  Concept,
  Mistake,
  ReadinessItem,
  ReviewTask,
  SearchResult,
} from "../../src/domain/knowledge.js";
import type { KnowledgeRepository } from "../../src/repositories/knowledge.repository.js";

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  readonly concepts: Concept[] = [];
  readonly compiledNotes: CompiledNote[] = [];
  readonly mistakes: Mistake[] = [];
  readonly reviewTasks: ReviewTask[] = [];
  readonly readinessItems: ReadinessItem[] = [];

  async upsertConcept(input: {
    userId?: string | null;
    name: string;
    conceptType: string;
  }): Promise<Concept> {
    const concept: Concept = {
      id: `concept-${this.concepts.length + 1}`,
      userId: input.userId ?? null,
      name: input.name,
      normalizedName: input.name.toLowerCase(),
      conceptType: input.conceptType,
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    this.concepts.push(concept);
    return concept;
  }

  async indexConcept(): Promise<void> {}

  async searchRelated(): Promise<SearchResult[]> {
    return [];
  }

  async upsertCompiledNote(input: {
    userId?: string | null;
    domain: string;
    noteType: string;
    title: string;
    bodyMarkdown: string;
    structuredData: unknown;
  }): Promise<CompiledNote> {
    const note: CompiledNote = {
      id: `compiled-${this.compiledNotes.length + 1}`,
      userId: input.userId ?? null,
      domain: input.domain,
      noteType: input.noteType,
      title: input.title,
      bodyMarkdown: input.bodyMarkdown,
      structuredData: input.structuredData,
      status: "active",
      lastReviewedAt: null,
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    this.compiledNotes.push(note);
    return note;
  }

  async listCompiledNotes(): Promise<CompiledNote[]> {
    return this.compiledNotes;
  }

  async upsertMistake(input: {
    userId?: string | null;
    domain: string;
    category?: string | null;
    title: string;
    description: string;
  }): Promise<Mistake> {
    const mistake: Mistake = {
      id: `mistake-${this.mistakes.length + 1}`,
      userId: input.userId ?? null,
      domain: input.domain,
      category: input.category ?? null,
      title: input.title,
      description: input.description,
      status: "active",
      evidenceCount: 1,
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    this.mistakes.push(mistake);
    return mistake;
  }

  async listMistakes(): Promise<Mistake[]> {
    return this.mistakes;
  }

  async createReviewTask(input: {
    userId?: string | null;
    domain: string;
    title: string;
    description: string;
    sourceType?: string | null;
    sourceId?: string | null;
  }): Promise<ReviewTask> {
    const task: ReviewTask = {
      id: `task-${this.reviewTasks.length + 1}`,
      userId: input.userId ?? null,
      domain: input.domain,
      title: input.title,
      description: input.description,
      status: "open",
      dueAt: null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    this.reviewTasks.push(task);
    return task;
  }

  async listReviewTasks(): Promise<ReviewTask[]> {
    return this.reviewTasks;
  }

  async completeReviewTask(id: string): Promise<ReviewTask | null> {
    const task = this.reviewTasks.find((item) => item.id === id) ?? null;
    if (task) {
      task.status = "completed";
    }
    return task;
  }

  async upsertReadinessItem(input: {
    userId?: string | null;
    domain: string;
    area: string;
    status: "Missing" | "Weak" | "Needs Review" | "Okay" | "Strong";
    rationale: string;
  }): Promise<ReadinessItem> {
    const item: ReadinessItem = {
      id: `readiness-${this.readinessItems.length + 1}`,
      userId: input.userId ?? null,
      domain: input.domain,
      area: input.area,
      status: input.status,
      rationale: input.rationale,
      lastEvidenceAt: new Date("2026-05-24T00:00:00.000Z"),
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    this.readinessItems.push(item);
    return item;
  }

  async listReadinessItems(): Promise<ReadinessItem[]> {
    return this.readinessItems;
  }

  async createEvidenceLink(): Promise<void> {}
}
