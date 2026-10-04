// A stand-in for the Supabase client in tests. Each read or write is answered
// from a table of canned answers, and recorded so a test can check what was asked.
import { vi } from "vitest";

export type Answer = { data: unknown; error: null | { message: string; code?: string; status?: number } };
export type Call = { table: string; op: "select" | "insert" | "upsert" | "update" | "delete"; rows?: unknown; filters: Record<string, unknown> };

const NOTHING: Answer = { data: null, error: null };

/**
 * `answers` maps "table.op" to what that operation returns, for example
 * `{ "profiles.select": { data: { id: "u1" }, error: null } }`. Anything not
 * listed succeeds with no data.
 */
export function fakeDb(answers: Record<string, Answer> = {}) {
  const calls: Call[] = [];
  const admin = {
    createUser: vi.fn(async (): Promise<Answer> => ({ data: { user: { id: "user-1" } }, error: null })),
    deleteUser: vi.fn(async (): Promise<Answer> => NOTHING),
  };

  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: {} };
    calls.push(call);
    const answer = () => Promise.resolve(answers[`${table}.${call.op}`] ?? NOTHING);
    const builder = {
      select: () => builder,
      insert: (rows: unknown) => ((call.op = "insert"), (call.rows = rows), builder),
      upsert: (rows: unknown) => ((call.op = "upsert"), (call.rows = rows), builder),
      update: (rows: unknown) => ((call.op = "update"), (call.rows = rows), builder),
      delete: () => ((call.op = "delete"), builder),
      eq: (column: string, value: unknown) => ((call.filters[column] = value), builder),
      is: (column: string, value: unknown) => ((call.filters[column] = value), builder),
      gte: (column: string, value: unknown) => ((call.filters[`${column}>=`] = value), builder),
      order: () => builder,
      limit: () => builder,
      abortSignal: () => builder,
      maybeSingle: answer,
      single: answer,
      then: (resolve: (value: Answer) => unknown, reject?: (reason: unknown) => unknown) => answer().then(resolve, reject),
    };
    return builder;
  };

  const did = (table: string, op: Call["op"]) => calls.filter((call) => call.table === table && call.op === op);
  return { client: { from, auth: { admin } }, calls, did, admin };
}
