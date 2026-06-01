import { query, transaction } from "../db/postgres.js";
import type {
  CreateRawSourceChunkInput,
  CreateRawSourceInput,
  CreateSourceFolderInput,
  CreateSourceProjectInput,
  MoveRawSourceInput,
  RawSource,
  RawSourceChunk,
  RawSourceRole,
  RenameSourceFolderInput,
  RenameSourceProjectInput,
  SourceFolder,
  SourceOrganization,
  SourceProject,
  RawSourceWithChunks,
  UpdateRawSourceInput,
} from "../domain/rawSource.js";

type RawSourceRow = {
  id: string;
  user_id: string | null;
  project_id: string | null;
  folder_id: string | null;
  domain: string | null;
  subtype: string | null;
  source_type: string;
  source_role: RawSourceRole;
  title: string | null;
  body_markdown: string;
  metadata: Record<string, unknown>;
  extracted_data: unknown;
  created_at: Date;
  updated_at: Date;
  topic_ids?: string[];
};

type RawSourceChunkRow = {
  id: string;
  raw_source_id: string;
  chunk_index: number;
  heading: string | null;
  body_markdown: string;
  token_estimate: number;
  metadata: Record<string, unknown>;
  created_at: Date;
};

type SourceProjectRow = {
  id: string;
  user_id: string | null;
  name: string;
  metadata: Record<string, unknown>;
  source_count: number | string;
  created_at: Date;
  updated_at: Date;
};

type SourceFolderRow = {
  id: string;
  project_id: string;
  user_id: string | null;
  name: string;
  metadata: Record<string, unknown>;
  source_count: number | string;
  created_at: Date;
  updated_at: Date;
};

export interface RawSourceRepository {
  create(input: CreateRawSourceInput, chunks: CreateRawSourceChunkInput[]): Promise<RawSourceWithChunks>;
  createProject(input: CreateSourceProjectInput): Promise<SourceProject>;
  createFolder(projectId: string, input: CreateSourceFolderInput): Promise<SourceFolder | null>;
  renameProject(projectId: string, input: RenameSourceProjectInput): Promise<SourceProject | null>;
  renameFolder(
    projectId: string,
    folderId: string,
    input: RenameSourceFolderInput,
  ): Promise<SourceFolder | null>;
  deleteProject(projectId: string): Promise<boolean>;
  deleteFolder(projectId: string, folderId: string): Promise<boolean>;
  getById(id: string): Promise<RawSourceWithChunks | null>;
  listRecent(limit: number): Promise<RawSourceWithChunks[]>;
  listOrganization(): Promise<SourceOrganization>;
  move(id: string, input: MoveRawSourceInput): Promise<RawSourceWithChunks | null>;
  update(
    id: string,
    input: UpdateRawSourceInput,
    chunks: CreateRawSourceChunkInput[],
  ): Promise<RawSourceWithChunks | null>;
  updateTopics(id: string, topicIds: string[]): Promise<RawSourceWithChunks | null>;
  updateExtraction(id: string, extractedData: unknown): Promise<RawSourceWithChunks>;
  delete(id: string): Promise<boolean>;
}

function mapRawSource(row: RawSourceRow): RawSource {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    folderId: row.folder_id,
    domain: row.domain,
    subtype: row.subtype,
    sourceType: row.source_type,
    sourceRole: row.source_role,
    topicIds: row.topic_ids ?? [],
    title: row.title,
    bodyMarkdown: row.body_markdown,
    metadata: row.metadata,
    extractedData: row.extracted_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRawSourceChunk(row: RawSourceChunkRow): RawSourceChunk {
  return {
    id: row.id,
    rawSourceId: row.raw_source_id,
    chunkIndex: row.chunk_index,
    heading: row.heading,
    bodyMarkdown: row.body_markdown,
    tokenEstimate: row.token_estimate,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function mapSourceProject(row: SourceProjectRow, folders: SourceFolder[]): SourceProject {
  const sourceCount = Number(row.source_count);
  const categorizedCount = folders.reduce((total, folder) => total + folder.sourceCount, 0);
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    sourceCount,
    uncategorizedSourceCount: Math.max(0, sourceCount - categorizedCount),
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    folders,
  };
}

function mapSourceFolder(row: SourceFolderRow): SourceFolder {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    name: row.name,
    sourceCount: Number(row.source_count),
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresRawSourceRepository implements RawSourceRepository {
  async create(input: CreateRawSourceInput, chunks: CreateRawSourceChunkInput[]) {
    return transaction(async (transactionQuery) => {
      const projectId =
        input.projectId ?? (await ensureDefaultProject(transactionQuery, input.userId ?? null));
      const sourceResult = await transactionQuery<RawSourceRow>(
        `
          insert into raw_sources (
            user_id,
            project_id,
            folder_id,
            subtype,
            source_type,
            source_role,
            title,
            body_markdown,
            metadata
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          returning *
        `,
        [
          input.userId ?? null,
          projectId,
          input.folderId ?? null,
          input.subtype ?? null,
          input.sourceType ?? "markdown",
          input.sourceRole ?? "personal_note",
          input.title ?? null,
          input.bodyMarkdown,
          input.metadata ?? {},
        ],
      );
      const sourceId = sourceResult.rows[0].id;
      const topicIds = input.topicIds ?? [];
      for (const topicId of topicIds) {
        await transactionQuery(
          "insert into source_topics (source_id, topic_id) values ($1, $2) on conflict do nothing",
          [sourceId, topicId],
        );
      }
      const source = { ...mapRawSource(sourceResult.rows[0]), topicIds };
      const savedChunks = await insertChunks(transactionQuery, sourceId, chunks);
      return { ...source, chunks: savedChunks };
    });
  }

  async createProject(input: CreateSourceProjectInput) {
    const result = await query<SourceProjectRow>(
      `
        insert into source_projects (user_id, name, metadata)
        values ($1, $2, $3)
        returning
          id,
          user_id,
          name,
          metadata,
          0::integer as source_count,
          created_at,
          updated_at
      `,
      [input.userId ?? null, input.name, input.metadata ?? {}],
    );
    return mapSourceProject(result.rows[0], []);
  }

  async createFolder(projectId: string, input: CreateSourceFolderInput) {
    const result = await query<SourceFolderRow>(
      `
        insert into source_folders (project_id, user_id, name, metadata)
        select id, $2, $3, $4
        from source_projects
        where id = $1
        returning
          id,
          project_id,
          user_id,
          name,
          metadata,
          0::integer as source_count,
          created_at,
          updated_at
      `,
      [projectId, input.userId ?? null, input.name, input.metadata ?? {}],
    );
    return result.rows[0] ? mapSourceFolder(result.rows[0]) : null;
  }

  async renameProject(projectId: string, input: RenameSourceProjectInput) {
    const result = await query<{ id: string }>(
      `
        update source_projects
        set name = $2,
            updated_at = now()
        where id = $1
        returning id
      `,
      [projectId, input.name],
    );

    if (!result.rows[0]) {
      return null;
    }

    const organization = await this.listOrganization();
    return organization.projects.find((project) => project.id === projectId) ?? null;
  }

  async renameFolder(projectId: string, folderId: string, input: RenameSourceFolderInput) {
    const result = await query<{ id: string }>(
      `
        update source_folders
        set name = $3,
            updated_at = now()
        where id = $2
          and project_id = $1
        returning id
      `,
      [projectId, folderId, input.name],
    );

    if (!result.rows[0]) {
      return null;
    }

    const organization = await this.listOrganization();
    const project = organization.projects.find((item) => item.id === projectId);
    return project?.folders.find((folder) => folder.id === folderId) ?? null;
  }

  async deleteProject(projectId: string) {
    const result = await query("delete from source_projects where id = $1", [projectId]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteFolder(projectId: string, folderId: string) {
    const result = await query("delete from source_folders where id = $1 and project_id = $2", [
      folderId,
      projectId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async getById(id: string) {
    const sourceResult = await query<RawSourceRow>(
      `
        select rs.*,
          coalesce(
            array_agg(st.topic_id::text) filter (where st.topic_id is not null),
            array[]::text[]
          ) as topic_ids
        from raw_sources rs
        left join source_topics st on st.source_id = rs.id
        where rs.id = $1
        group by rs.id
      `,
      [id],
    );
    if (!sourceResult.rows[0]) {
      return null;
    }

    return {
      ...mapRawSource(sourceResult.rows[0]),
      chunks: await listChunks(id),
    };
  }

  async listRecent(limit: number) {
    const sourceResult = await query<RawSourceRow>(
      `
        select rs.*,
          coalesce(
            array_agg(st.topic_id::text) filter (where st.topic_id is not null),
            array[]::text[]
          ) as topic_ids
        from raw_sources rs
        left join source_topics st on st.source_id = rs.id
        group by rs.id
        order by rs.created_at desc
        limit $1
      `,
      [limit],
    );

    const sources: RawSourceWithChunks[] = [];
    for (const row of sourceResult.rows) {
      sources.push({
        ...mapRawSource(row),
        chunks: await listChunks(row.id),
      });
    }
    return sources;
  }

  async listOrganization() {
    const projectResult = await query<SourceProjectRow>(
      `
        select
          source_projects.id,
          source_projects.user_id,
          source_projects.name,
          source_projects.metadata,
          source_projects.created_at,
          source_projects.updated_at,
          count(raw_sources.id)::integer as source_count
        from source_projects
        left join raw_sources on raw_sources.project_id = source_projects.id
        group by source_projects.id
        order by source_projects.sort_order asc, source_projects.created_at asc
      `,
    );
    const folderResult = await query<SourceFolderRow>(
      `
        select
          source_folders.id,
          source_folders.project_id,
          source_folders.user_id,
          source_folders.name,
          source_folders.metadata,
          source_folders.created_at,
          source_folders.updated_at,
          count(raw_sources.id)::integer as source_count
        from source_folders
        left join raw_sources on raw_sources.folder_id = source_folders.id
        group by source_folders.id
        order by source_folders.sort_order asc, source_folders.created_at asc
      `,
    );
    const foldersByProject = new Map<string, SourceFolder[]>();
    for (const folderRow of folderResult.rows) {
      const folder = mapSourceFolder(folderRow);
      foldersByProject.set(folder.projectId, [...(foldersByProject.get(folder.projectId) ?? []), folder]);
    }

    return {
      projects: projectResult.rows.map((row) =>
        mapSourceProject(row, foldersByProject.get(row.id) ?? []),
      ),
    };
  }

  async move(id: string, input: MoveRawSourceInput) {
    const sourceResult = await query<RawSourceRow>(
      `
        update raw_sources
        set project_id = $2,
            folder_id = $3,
            updated_at = now()
        where id = $1
          and exists (
            select 1
            from source_projects
            where source_projects.id = $2
          )
          and (
            $3::uuid is null
            or exists (
              select 1
              from source_folders
              where source_folders.id = $3
                and source_folders.project_id = $2
            )
          )
        returning *
      `,
      [id, input.projectId, input.folderId ?? null],
    );

    if (!sourceResult.rows[0]) {
      return null;
    }

    return {
      ...mapRawSource(sourceResult.rows[0]),
      topicIds: await fetchTopicIds(id),
      chunks: await listChunks(id),
    };
  }

  async update(id: string, input: UpdateRawSourceInput, chunks: CreateRawSourceChunkInput[]) {
    return transaction(async (transactionQuery) => {
      const currentResult = await transactionQuery<RawSourceRow>(
        "select * from raw_sources where id = $1",
        [id],
      );

      if (!currentResult.rows[0]) {
        return null;
      }

      const current = mapRawSource(currentResult.rows[0]);
      const projectId =
        input.projectId ??
        current.projectId ??
        (await ensureDefaultProject(transactionQuery, current.userId));
      const folderId = Object.hasOwn(input, "folderId") ? input.folderId ?? null : current.folderId;
      const sourceResult = await transactionQuery<RawSourceRow>(
        `
          update raw_sources
          set project_id = $2,
              folder_id = $3,
              subtype = $4,
              source_type = $5,
              source_role = $6,
              title = $7,
              body_markdown = $8,
              metadata = $9,
              extracted_data = '{}'::jsonb,
              updated_at = now()
          where id = $1
          returning *
        `,
        [
          id,
          projectId,
          folderId,
          Object.hasOwn(input, "subtype") ? (input.subtype ?? null) : current.subtype,
          input.sourceType ?? "markdown",
          input.sourceRole ?? "personal_note",
          input.title ?? null,
          input.bodyMarkdown,
          input.metadata ?? {},
        ],
      );

      if (!sourceResult.rows[0]) {
        return null;
      }

      let topicIds: string[];
      if (input.topicIds !== undefined) {
        await transactionQuery("delete from source_topics where source_id = $1", [id]);
        for (const topicId of input.topicIds) {
          await transactionQuery(
            "insert into source_topics (source_id, topic_id) values ($1, $2) on conflict do nothing",
            [id, topicId],
          );
        }
        topicIds = input.topicIds;
      } else {
        const topicResult = await transactionQuery<{ topic_id: string }>(
          "select topic_id::text from source_topics where source_id = $1",
          [id],
        );
        topicIds = topicResult.rows.map((row) => row.topic_id);
      }

      await transactionQuery("delete from raw_source_chunks where raw_source_id = $1", [id]);
      const savedChunks = await insertChunks(transactionQuery, id, chunks);
      return {
        ...mapRawSource(sourceResult.rows[0]),
        topicIds,
        chunks: savedChunks,
      };
    });
  }

  async updateTopics(id: string, topicIds: string[]) {
    return transaction(async (transactionQuery) => {
      const sourceResult = await transactionQuery<RawSourceRow>(
        "select * from raw_sources where id = $1",
        [id],
      );
      if (!sourceResult.rows[0]) {
        return null;
      }

      await transactionQuery("delete from source_topics where source_id = $1", [id]);
      for (const topicId of topicIds) {
        await transactionQuery(
          "insert into source_topics (source_id, topic_id) values ($1, $2) on conflict do nothing",
          [id, topicId],
        );
      }

      return {
        ...mapRawSource(sourceResult.rows[0]),
        topicIds,
        chunks: await listChunks(id),
      };
    });
  }

  async updateExtraction(id: string, extractedData: unknown) {
    const sourceResult = await query<RawSourceRow>(
      `
        update raw_sources
        set extracted_data = $2,
            updated_at = now()
        where id = $1
        returning *
      `,
      [id, extractedData],
    );

    if (!sourceResult.rows[0]) {
      throw new Error("Raw source not found");
    }

    return {
      ...mapRawSource(sourceResult.rows[0]),
      topicIds: await fetchTopicIds(id),
      chunks: await listChunks(id),
    };
  }

  async delete(id: string) {
    const result = await query("delete from raw_sources where id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

async function fetchTopicIds(sourceId: string): Promise<string[]> {
  const result = await query<{ topic_id: string }>(
    "select topic_id::text from source_topics where source_id = $1",
    [sourceId],
  );
  return result.rows.map((row) => row.topic_id);
}

async function listChunks(rawSourceId: string) {
  const chunkResult = await query<RawSourceChunkRow>(
    `
      select *
      from raw_source_chunks
      where raw_source_id = $1
      order by chunk_index asc
    `,
    [rawSourceId],
  );
  return chunkResult.rows.map(mapRawSourceChunk);
}

async function insertChunks(
  executor: typeof query,
  rawSourceId: string,
  chunks: CreateRawSourceChunkInput[],
) {
  const savedChunks: RawSourceChunk[] = [];
  for (const chunk of chunks) {
    const chunkResult = await executor<RawSourceChunkRow>(
      `
        insert into raw_source_chunks (
          raw_source_id,
          chunk_index,
          heading,
          body_markdown,
          token_estimate,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6)
        returning *
      `,
      [
        rawSourceId,
        chunk.chunkIndex,
        chunk.heading ?? null,
        chunk.bodyMarkdown,
        chunk.tokenEstimate,
        chunk.metadata ?? {},
      ],
    );
    savedChunks.push(mapRawSourceChunk(chunkResult.rows[0]));
  }
  return savedChunks;
}

async function ensureDefaultProject(executor: typeof query, userId: string | null) {
  const existingResult = await executor<{ id: string }>(
    `
      select id
      from source_projects
      where name = 'Default project'
        and (
          ($1::uuid is null and user_id is null)
          or user_id = $1::uuid
        )
      order by created_at asc
      limit 1
    `,
    [userId],
  );

  if (existingResult.rows[0]) {
    return existingResult.rows[0].id;
  }

  const createdResult = await executor<{ id: string }>(
    `
      insert into source_projects (user_id, name, metadata)
      values ($1, 'Default project', jsonb_build_object('system', 'default'))
      returning id
    `,
    [userId],
  );
  return createdResult.rows[0].id;
}
