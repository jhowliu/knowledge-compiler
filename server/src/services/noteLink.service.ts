import type { NoteLinkStatus } from "../domain/knowledge.js";
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

  async approveLink(id: string) {
    return this.setLinkStatus(id, "approved");
  }

  async rejectLink(id: string) {
    return this.setLinkStatus(id, "rejected");
  }

  private async setLinkStatus(id: string, status: NoteLinkStatus) {
    const link = await this.noteLinkRepository.setStatus(id, status);
    if (!link) {
      throw new Error("Note link not found");
    }
    return link;
  }
}
