import type { NoteLinkStatus } from "../domain/knowledge.js";
import { AppError } from "../domain/errors.js";
import type { NoteLinkRepository } from "../repositories/noteLink.repository.js";

const graphStatuses: NoteLinkStatus[] = ["approved", "pending"];

export class NoteLinkService {
  constructor(private readonly noteLinkRepository: NoteLinkRepository) {}

  async listGraphLinks() {
    return this.noteLinkRepository.listForGraph({ statuses: graphStatuses, limit: 100 });
  }

  async listLinksForNote(noteId: string) {
    return this.noteLinkRepository.listForNote({
      noteType: "compiled_note",
      noteId,
      statuses: graphStatuses,
      limit: 50,
    });
  }

  async createManualLink(input: {
    userId?: string | null;
    sourceNoteId: string;
    targetNoteId: string;
    relationType: string;
    confidence?: "low" | "medium" | "high";
    rationale?: string | null;
  }) {
    if (input.sourceNoteId === input.targetNoteId) {
      throw new AppError("A note cannot link to itself", 400);
    }

    const link = await this.noteLinkRepository.createManual({
      userId: input.userId,
      sourceNoteType: "compiled_note",
      sourceNoteId: input.sourceNoteId,
      targetNoteType: "compiled_note",
      targetNoteId: input.targetNoteId,
      relationType: input.relationType,
      confidence: input.confidence ?? "high",
      rationale: input.rationale ?? "Manually linked in Notes Graph.",
    });

    if (!link) {
      throw new AppError("Unable to create note link", 400);
    }
    return link;
  }

  async updateLink(input: {
    id: string;
    relationType: string;
    confidence?: "low" | "medium" | "high";
    rationale?: string | null;
  }) {
    const duplicateLink = await this.noteLinkRepository.findRelationDuplicateForUpdate({
      id: input.id,
      relationType: input.relationType,
    });
    if (duplicateLink) {
      throw new AppError("This relation already exists between these notes", 409);
    }

    let link: Awaited<ReturnType<NoteLinkRepository["updateRelation"]>>;
    try {
      link = await this.noteLinkRepository.updateRelation(input);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new AppError("This relation already exists between these notes", 409);
      }
      throw error;
    }
    if (!link) {
      throw new AppError("Note link not found", 404);
    }
    return link;
  }

  async approveLink(id: string) {
    return this.setLinkStatus(id, "approved");
  }

  async rejectLink(id: string) {
    return this.setLinkStatus(id, "rejected");
  }

  async archiveLink(id: string) {
    return this.setLinkStatus(id, "rejected");
  }

  private async setLinkStatus(id: string, status: NoteLinkStatus) {
    const link = await this.noteLinkRepository.setStatus(id, status);
    if (!link) {
      throw new AppError("Note link not found", 404);
    }
    return link;
  }
}

function isUniqueConstraintViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
