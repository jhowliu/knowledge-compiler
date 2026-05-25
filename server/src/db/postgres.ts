import postgres from "postgres";
import { env } from "../config/env.js";

type PostgresRows<T> = T[] & { count?: number };
type QueryExecutor = Pick<postgres.Sql, "unsafe">;

export type QueryResult<T> = {
  rows: T[];
  rowCount: number;
};

const sql = postgres(env.DATABASE_URL);

async function runQuery<T = unknown>(
  executor: QueryExecutor,
  statement: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const rows = (await executor.unsafe(
    statement,
    params as postgres.ParameterOrJSON<never>[],
  )) as PostgresRows<T>;
  return {
    rows: [...rows],
    rowCount: typeof rows.count === "number" ? rows.count : rows.length,
  };
}

export async function query<T = unknown>(statement: string, params: unknown[] = []) {
  return runQuery<T>(sql, statement, params);
}

export async function transaction<T>(
  callback: (transactionQuery: typeof query) => Promise<T>,
) {
  return sql.begin(async (transactionSql) => {
    const transactionQuery = <Row = unknown>(statement: string, params: unknown[] = []) =>
      runQuery<Row>(transactionSql, statement, params);
    return callback(transactionQuery);
  });
}

export async function closeDatabase() {
  await sql.end({ timeout: 5 });
}
