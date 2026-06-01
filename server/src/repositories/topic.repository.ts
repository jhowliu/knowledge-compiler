import { query } from "../db/postgres.js";
import type { CreateTopicInput, Topic, UpdateTopicInput } from "../domain/topic.js";

type TopicRow = {
  id: string;
  user_id: string | null;
  name: string;
  color: string | null;
  created_at: Date;
};

export interface TopicRepository {
  list(userId?: string | null): Promise<Topic[]>;
  getById(id: string): Promise<Topic | null>;
  create(input: CreateTopicInput): Promise<Topic>;
  update(id: string, input: UpdateTopicInput): Promise<Topic | null>;
  delete(id: string): Promise<boolean | "referenced">;
}

function mapTopic(row: TopicRow): Topic {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

export class PostgresTopicRepository implements TopicRepository {
  async list(userId?: string | null) {
    const result = await query<TopicRow>(
      `
        select *
        from topics
        where ($1::uuid is null and user_id is null)
           or user_id = $1::uuid
        order by name asc
      `,
      [userId ?? null],
    );
    return result.rows.map(mapTopic);
  }

  async getById(id: string) {
    const result = await query<TopicRow>("select * from topics where id = $1", [id]);
    return result.rows[0] ? mapTopic(result.rows[0]) : null;
  }

  async create(input: CreateTopicInput) {
    const result = await query<TopicRow>(
      `
        insert into topics (user_id, name, color)
        values ($1, $2, $3)
        returning *
      `,
      [input.userId ?? null, input.name, input.color ?? null],
    );
    return mapTopic(result.rows[0]);
  }

  async update(id: string, input: UpdateTopicInput) {
    const current = await this.getById(id);
    if (!current) return null;

    const result = await query<TopicRow>(
      `
        update topics
        set name  = $2,
            color = $3
        where id = $1
        returning *
      `,
      [
        id,
        input.name ?? current.name,
        Object.hasOwn(input, "color") ? (input.color ?? null) : current.color,
      ],
    );
    return result.rows[0] ? mapTopic(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean | "referenced"> {
    const refCheck = await query<{ count: string }>(
      `
        select (
          (select count(*) from source_topics where topic_id = $1) +
          (select count(*) from block_topics where topic_id = $1)
        )::text as count
      `,
      [id],
    );
    if (Number(refCheck.rows[0]?.count) > 0) {
      return "referenced";
    }

    const result = await query("delete from topics where id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
