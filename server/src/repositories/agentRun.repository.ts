import { query } from "../db/postgres.js";
import {
  type AgentRunEventCategory,
  type AgentRunEventName,
} from "../domain/agentRunEvents.js";
import type { AgentRun, AgentRunEvent } from "../domain/knowledge.js";
import { agentRunEventStreamService } from "../services/agentRunEventStream.service.js";

type AgentRunRow = {
  id: string;
  user_id: string | null;
  run_type: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  metadata: Record<string, unknown>;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
};

type AgentRunEventRow = {
  id: string;
  agent_run_id: string;
  category: AgentRunEventCategory;
  name: AgentRunEventName;
  payload: unknown;
  created_at: Date;
};

function mapAgentRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    userId: row.user_id,
    runType: row.run_type,
    status: row.status,
    input: row.input,
    output: row.output,
    error: row.error,
    metadata: row.metadata,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function mapAgentRunEvent(row: AgentRunEventRow): AgentRunEvent {
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    category: row.category,
    name: row.name,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

export interface AgentRunRepository {
  enqueue(input: { userId?: string | null; runType: string; input: unknown }): Promise<AgentRun>;
  create(input: { userId?: string | null; runType: string; input: unknown }): Promise<AgentRun>;
  updateMetadata(id: string, metadata: Record<string, unknown>): Promise<AgentRun>;
  addEvent(input: {
    agentRunId: string;
    category: AgentRunEventCategory;
    name: AgentRunEventName;
    payload: unknown;
  }): Promise<AgentRunEvent>;
  start(id: string): Promise<AgentRun>;
  complete(id: string, output: unknown): Promise<AgentRun>;
  fail(id: string, error: string): Promise<AgentRun>;
  getById(id: string): Promise<AgentRun | null>;
  listByRawNote(rawNoteId: string): Promise<AgentRun[]>;
  listRecent(limit: number): Promise<AgentRun[]>;
  listEvents(agentRunId: string): Promise<AgentRunEvent[]>;
}

export class PostgresAgentRunRepository implements AgentRunRepository {
  async enqueue(input: { userId?: string | null; runType: string; input: unknown }) {
    const result = await query<AgentRunRow>(
      `
        insert into agent_runs (user_id, run_type, status, input)
        values ($1, $2, 'queued', $3)
        returning *
      `,
      [input.userId ?? null, input.runType, input.input],
    );

    return mapAgentRun(result.rows[0]);
  }

  async create(input: { userId?: string | null; runType: string; input: unknown }) {
    const result = await query<AgentRunRow>(
      `
        insert into agent_runs (user_id, run_type, status, input, started_at)
        values ($1, $2, 'running', $3, now())
        returning *
      `,
      [input.userId ?? null, input.runType, input.input],
    );

    return mapAgentRun(result.rows[0]);
  }

  async updateMetadata(id: string, metadata: Record<string, unknown>) {
    const result = await query<AgentRunRow>(
      `
        update agent_runs
        set metadata = metadata || $2::jsonb
        where id = $1
        returning *
      `,
      [id, metadata],
    );

    return mapAgentRun(result.rows[0]);
  }

  async addEvent(input: {
    agentRunId: string;
    category: AgentRunEventCategory;
    name: AgentRunEventName;
    payload: unknown;
  }) {
    const result = await query<AgentRunEventRow>(
      `
        insert into agent_run_events (agent_run_id, category, name, payload)
        values ($1, $2, $3, $4)
        returning *
      `,
      [input.agentRunId, input.category, input.name, input.payload],
    );

    const event = mapAgentRunEvent(result.rows[0]);
    agentRunEventStreamService.publishAgentRunEvent(event);
    return event;
  }

  async start(id: string) {
    const result = await query<AgentRunRow>(
      `
        update agent_runs
        set status = 'running',
            started_at = now()
        where id = $1
        returning *
      `,
      [id],
    );

    return mapAgentRun(result.rows[0]);
  }

  async complete(id: string, output: unknown) {
    const result = await query<AgentRunRow>(
      `
        update agent_runs
        set status = 'completed',
            output = $2,
            completed_at = now()
        where id = $1
        returning *
      `,
      [id, output],
    );

    return mapAgentRun(result.rows[0]);
  }

  async fail(id: string, error: string) {
    const result = await query<AgentRunRow>(
      `
        update agent_runs
        set status = 'failed',
            error = $2,
            completed_at = now()
        where id = $1
        returning *
      `,
      [id, error],
    );

    return mapAgentRun(result.rows[0]);
  }

  async getById(id: string) {
    const result = await query<AgentRunRow>("select * from agent_runs where id = $1", [id]);
    return result.rows[0] ? mapAgentRun(result.rows[0]) : null;
  }

  async listRecent(limit: number) {
    const result = await query<AgentRunRow>(
      `
        select *
        from agent_runs
        order by created_at desc
        limit $1
      `,
      [limit],
    );

    return result.rows.map(mapAgentRun);
  }

  async listByRawNote(rawNoteId: string) {
    const result = await query<AgentRunRow>(
      `
        select *
        from agent_runs
        where input ->> 'rawNoteId' = $1
        order by created_at desc
      `,
      [rawNoteId],
    );

    return result.rows.map(mapAgentRun);
  }

  async listEvents(agentRunId: string) {
    const result = await query<AgentRunEventRow>(
      `
        select *
        from agent_run_events
        where agent_run_id = $1
        order by created_at asc
      `,
      [agentRunId],
    );

    return result.rows.map(mapAgentRunEvent);
  }
}
