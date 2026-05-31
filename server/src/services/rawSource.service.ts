import { AppError } from "../domain/errors.js";
import type {
  CreateRawSourceInput,
  CreateSourceFolderInput,
  CreateSourceProjectInput,
  MoveRawSourceInput,
  RenameSourceFolderInput,
  RenameSourceProjectInput,
  UpdateRawSourceInput,
} from "../domain/rawSource.js";
import type { RawNoteRepository } from "../repositories/rawNote.repository.js";
import type { RawSourceRepository } from "../repositories/rawSource.repository.js";
import type { AgentRunQueueService } from "./agentRunQueue.service.js";
import { chunkSourceMarkdown } from "./sourceChunker.service.js";

export class RawSourceService {
  constructor(
    private readonly rawSourceRepository: RawSourceRepository,
    private readonly rawNoteRepository?: RawNoteRepository | null,
    private readonly agentRunQueueService?: AgentRunQueueService | null,
  ) {}

  async createRawSource(input: CreateRawSourceInput) {
    return this.rawSourceRepository.create(input, chunkSourceMarkdown(input.bodyMarkdown));
  }

  async createSourceProject(input: CreateSourceProjectInput) {
    return this.rawSourceRepository.createProject(input);
  }

  async createSourceFolder(projectId: string, input: CreateSourceFolderInput) {
    const folder = await this.rawSourceRepository.createFolder(projectId, input);
    if (!folder) {
      throw new AppError("Source project not found", 404);
    }
    return folder;
  }

  async renameSourceProject(projectId: string, input: RenameSourceProjectInput) {
    const project = await this.rawSourceRepository.renameProject(projectId, input);
    if (!project) {
      throw new AppError("Source project not found", 404);
    }
    return project;
  }

  async renameSourceFolder(projectId: string, folderId: string, input: RenameSourceFolderInput) {
    const folder = await this.rawSourceRepository.renameFolder(projectId, folderId, input);
    if (!folder) {
      throw new AppError("Source folder not found", 404);
    }
    return folder;
  }

  async deleteSourceProject(projectId: string) {
    const organization = await this.rawSourceRepository.listOrganization();
    const project = organization.projects.find((item) => item.id === projectId);

    if (!project) {
      throw new AppError("Source project not found", 404);
    }

    if (project.metadata.system === "default") {
      throw new AppError("Default source project cannot be deleted", 409);
    }

    if (project.sourceCount > 0 || project.folders.length > 0) {
      throw new AppError("Move sources and delete folders before deleting this project", 409);
    }

    const deleted = await this.rawSourceRepository.deleteProject(projectId);
    if (!deleted) {
      throw new AppError("Source project not found", 404);
    }
  }

  async deleteSourceFolder(projectId: string, folderId: string) {
    const organization = await this.rawSourceRepository.listOrganization();
    const project = organization.projects.find((item) => item.id === projectId);
    const folder = project?.folders.find((item) => item.id === folderId);

    if (!project || !folder) {
      throw new AppError("Source folder not found", 404);
    }

    if (folder.sourceCount > 0) {
      throw new AppError("Move sources before deleting this folder", 409);
    }

    const deleted = await this.rawSourceRepository.deleteFolder(projectId, folderId);
    if (!deleted) {
      throw new AppError("Source folder not found", 404);
    }
  }

  async listRecentRawSources() {
    return this.rawSourceRepository.listRecent(50);
  }

  async getSourceOrganization() {
    return this.rawSourceRepository.listOrganization();
  }

  async getRawSource(id: string) {
    const rawSource = await this.rawSourceRepository.getById(id);
    if (!rawSource) {
      throw new AppError("Raw source not found", 404);
    }
    return rawSource;
  }

  async updateRawSource(id: string, input: UpdateRawSourceInput) {
    const rawSource = await this.rawSourceRepository.update(
      id,
      input,
      chunkSourceMarkdown(input.bodyMarkdown),
    );
    if (!rawSource) {
      throw new AppError("Raw source not found", 404);
    }
    return rawSource;
  }

  async moveRawSource(id: string, input: MoveRawSourceInput) {
    const rawSource = await this.rawSourceRepository.move(id, input);
    if (!rawSource) {
      throw new AppError("Raw source or target organization not found", 404);
    }
    return rawSource;
  }

  async deleteRawSource(id: string) {
    const deleted = await this.rawSourceRepository.delete(id);
    if (!deleted) {
      throw new AppError("Raw source not found", 404);
    }
  }

  async compileRawSource(id: string) {
    const rawSource = await this.getRawSource(id);
    const rawNote = await this.ensureCompatibilityRawNote(rawSource.id);

    if (!this.agentRunQueueService) {
      return {
        rawSource,
        rawNote,
        proposal: null,
        agentRunId: null,
      };
    }

    const agentRun = await this.agentRunQueueService.enqueue({
      userId: rawSource.userId,
      runType: "compile_raw_note",
      input: {
        rawSourceId: rawSource.id,
        rawNoteId: rawNote.id,
      },
    });
    setTimeout(() => {
      this.agentRunQueueService?.process(agentRun.id).catch((error) => {
        console.error("compile_raw_note agent run failed", error);
      });
    }, 0);

    return {
      rawSource,
      rawNote,
      proposal: null,
      agentRunId: agentRun.id,
    };
  }

  private async ensureCompatibilityRawNote(rawSourceId: string) {
    if (!this.rawNoteRepository) {
      throw new AppError("Raw note compatibility repository is not configured", 500);
    }

    const existingRawNote = await this.rawNoteRepository.getByRawSourceId(rawSourceId);
    if (existingRawNote) {
      return existingRawNote;
    }

    const rawSource = await this.getRawSource(rawSourceId);
    return this.rawNoteRepository.create({
      userId: rawSource.userId,
      rawSourceId: rawSource.id,
      domain: rawSource.domain,
      sourceType: rawSource.sourceType,
      sourceRole: rawSource.sourceRole,
      title: rawSource.title,
      bodyMarkdown: rawSource.bodyMarkdown,
    });
  }
}
