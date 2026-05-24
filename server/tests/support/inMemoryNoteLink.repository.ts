import type { Confidence, NoteLink, NoteLinkStatus } from "../../src/domain/knowledge.js";
import type { NoteLinkRepository } from "../../src/repositories/noteLink.repository.js";

export class InMemoryNoteLinkRepository implements NoteLinkRepository {
  readonly noteLinks: NoteLink[] = [];

  async createManual(input: {
    userId?: string | null;
    sourceNoteType: string;
    sourceNoteId: string;
    targetNoteType: string;
    targetNoteId: string;
    relationType: string;
    confidence: Confidence;
    rationale?: string | null;
  }): Promise<NoteLink | null> {
    return this.createLink({ ...input, status: "approved" });
  }

  async createSuggestion(input: {
    userId?: string | null;
    sourceNoteType: string;
    sourceNoteId: string;
    targetNoteType: string;
    targetNoteId: string;
    relationType: string;
    confidence: Confidence;
    rationale?: string | null;
    createdByAgentRunId?: string | null;
  }): Promise<NoteLink | null> {
    return this.createLink({ ...input, status: "pending" });
  }

  private async createLink(input: {
    userId?: string | null;
    sourceNoteType: string;
    sourceNoteId: string;
    targetNoteType: string;
    targetNoteId: string;
    relationType: string;
    confidence: Confidence;
    status: NoteLinkStatus;
    rationale?: string | null;
    createdByAgentRunId?: string | null;
  }): Promise<NoteLink | null> {
    if (input.sourceNoteType === input.targetNoteType && input.sourceNoteId === input.targetNoteId) {
      return null;
    }

    const existing = this.noteLinks.find(
      (link) =>
        link.sourceNoteType === input.sourceNoteType &&
        link.sourceNoteId === input.sourceNoteId &&
        link.targetNoteType === input.targetNoteType &&
        link.targetNoteId === input.targetNoteId &&
        link.relationType === input.relationType,
    );
    if (existing) {
      existing.confidence = input.confidence;
      existing.rationale = input.rationale ?? null;
      existing.status = input.status;
      existing.updatedAt = new Date("2026-05-24T00:00:00.000Z");
      return existing;
    }

    const link: NoteLink = {
      id: `note-link-${this.noteLinks.length + 1}`,
      userId: input.userId ?? null,
      sourceNoteType: input.sourceNoteType,
      sourceNoteId: input.sourceNoteId,
      sourceTitle: null,
      targetNoteType: input.targetNoteType,
      targetNoteId: input.targetNoteId,
      targetTitle: null,
      relationType: input.relationType,
      confidence: input.confidence,
      status: input.status,
      rationale: input.rationale ?? null,
      createdByAgentRunId: input.createdByAgentRunId ?? null,
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    this.noteLinks.push(link);
    return link;
  }

  async listForGraph(input: { statuses: NoteLinkStatus[]; limit: number }): Promise<NoteLink[]> {
    return this.noteLinks
      .filter((link) => input.statuses.includes(link.status))
      .slice(0, input.limit);
  }

  async listForNote(input: {
    noteType: string;
    noteId: string;
    statuses: NoteLinkStatus[];
    limit: number;
  }): Promise<NoteLink[]> {
    return this.noteLinks
      .filter(
        (link) =>
          input.statuses.includes(link.status) &&
          ((link.sourceNoteType === input.noteType && link.sourceNoteId === input.noteId) ||
            (link.targetNoteType === input.noteType && link.targetNoteId === input.noteId)),
      )
      .slice(0, input.limit);
  }

  async setStatus(id: string, status: NoteLinkStatus): Promise<NoteLink | null> {
    const link = this.noteLinks.find((item) => item.id === id) ?? null;
    if (link) {
      link.status = status;
      link.updatedAt = new Date("2026-05-24T00:00:00.000Z");
    }
    return link;
  }
}
