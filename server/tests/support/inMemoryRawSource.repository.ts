import type {
  CreateRawSourceChunkInput,
  CreateRawSourceInput,
  CreateSourceFolderInput,
  CreateSourceProjectInput,
  MoveRawSourceInput,
  RawSourceWithChunks,
  RenameSourceFolderInput,
  RenameSourceProjectInput,
  SourceFolder,
  SourceProject,
  UpdateRawSourceInput,
} from "../../src/domain/rawSource.js";
import type { RawSourceRepository } from "../../src/repositories/rawSource.repository.js";

const defaultProjectId = "00000000-0000-4000-8000-000000000001";

export class InMemoryRawSourceRepository implements RawSourceRepository {
  readonly sources: RawSourceWithChunks[] = [];
  readonly projects: SourceProject[] = [
    {
      id: defaultProjectId,
      userId: null,
      name: "Default project",
      sourceCount: 0,
      uncategorizedSourceCount: 0,
      metadata: { system: "default" },
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
      folders: [],
    },
  ];

  async create(input: CreateRawSourceInput, chunks: CreateRawSourceChunkInput[]) {
    const source: RawSourceWithChunks = {
      id: `raw-source-${this.sources.length + 1}`,
      userId: input.userId ?? null,
      projectId: input.projectId ?? this.projects[0].id,
      folderId: input.folderId ?? null,
      subtype: input.subtype ?? null,
      sourceType: input.sourceType ?? "markdown",
      sourceRole: input.sourceRole ?? "personal_note",
      topicIds: input.topicIds ?? [],
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

  async updateTopics(id: string, topicIds: string[]) {
    const source = await this.getById(id);
    if (!source) {
      return null;
    }
    source.topicIds = topicIds;
    return source;
  }

  async createProject(input: CreateSourceProjectInput) {
    const project: SourceProject = {
      id: `00000000-0000-4000-8000-${String(this.projects.length + 1).padStart(12, "0")}`,
      userId: input.userId ?? null,
      name: input.name,
      sourceCount: 0,
      uncategorizedSourceCount: 0,
      metadata: input.metadata ?? {},
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
      folders: [],
    };
    this.projects.push(project);
    return project;
  }

  async createFolder(projectId: string, input: CreateSourceFolderInput) {
    const project = this.projects.find((item) => item.id === projectId);
    if (!project) {
      return null;
    }
    const folder: SourceFolder = {
      id: `00000000-0000-4000-9000-${String(project.folders.length + 1).padStart(12, "0")}`,
      projectId,
      userId: input.userId ?? null,
      name: input.name,
      sourceCount: 0,
      metadata: input.metadata ?? {},
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    project.folders.push(folder);
    return folder;
  }

  async renameProject(projectId: string, input: RenameSourceProjectInput) {
    const project = this.projects.find((item) => item.id === projectId);
    if (!project) {
      return null;
    }

    project.name = input.name;
    project.updatedAt = new Date("2026-05-24T01:00:00.000Z");
    const organization = await this.listOrganization();
    return organization.projects.find((item) => item.id === projectId) ?? null;
  }

  async renameFolder(projectId: string, folderId: string, input: RenameSourceFolderInput) {
    const project = this.projects.find((item) => item.id === projectId);
    const folder = project?.folders.find((item) => item.id === folderId);
    if (!project || !folder) {
      return null;
    }

    folder.name = input.name;
    folder.updatedAt = new Date("2026-05-24T01:00:00.000Z");
    const organization = await this.listOrganization();
    return (
      organization.projects
        .find((item) => item.id === projectId)
        ?.folders.find((item) => item.id === folderId) ?? null
    );
  }

  async deleteProject(projectId: string) {
    const index = this.projects.findIndex((item) => item.id === projectId);
    if (index === -1) {
      return false;
    }
    this.projects.splice(index, 1);
    return true;
  }

  async deleteFolder(projectId: string, folderId: string) {
    const project = this.projects.find((item) => item.id === projectId);
    if (!project) {
      return false;
    }
    const index = project.folders.findIndex((item) => item.id === folderId);
    if (index === -1) {
      return false;
    }
    project.folders.splice(index, 1);
    return true;
  }

  async getById(id: string) {
    return this.sources.find((source) => source.id === id) ?? null;
  }

  async listRecent(limit: number) {
    return this.sources.slice(0, limit);
  }

  async listOrganization() {
    return {
      projects: this.projects.map((project) => {
        const projectSources = this.sources.filter((source) => source.projectId === project.id);
        return {
          ...project,
          sourceCount: projectSources.length,
          uncategorizedSourceCount: projectSources.filter((source) => !source.folderId).length,
          folders: project.folders.map((folder) => ({
            ...folder,
            sourceCount: this.sources.filter((source) => source.folderId === folder.id).length,
          })),
        };
      }),
    };
  }

  async move(id: string, input: MoveRawSourceInput) {
    const source = await this.getById(id);
    const project = this.projects.find((item) => item.id === input.projectId);
    const folder =
      input.folderId === null || input.folderId === undefined
        ? null
        : project?.folders.find((item) => item.id === input.folderId);
    if (!source || !project || (input.folderId && !folder)) {
      return null;
    }
    source.projectId = input.projectId;
    source.folderId = input.folderId ?? null;
    source.updatedAt = new Date("2026-05-24T01:00:00.000Z");
    return source;
  }

  async update(id: string, input: UpdateRawSourceInput, chunks: CreateRawSourceChunkInput[]) {
    const source = await this.getById(id);
    if (!source) {
      return null;
    }

    source.projectId = input.projectId ?? source.projectId ?? "default-project";
    source.folderId = Object.hasOwn(input, "folderId") ? input.folderId ?? null : source.folderId;
    source.subtype = Object.hasOwn(input, "subtype") ? (input.subtype ?? null) : source.subtype;
    source.sourceType = input.sourceType ?? "markdown";
    source.sourceRole = input.sourceRole ?? "personal_note";
    source.topicIds = input.topicIds ?? source.topicIds;
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
}
