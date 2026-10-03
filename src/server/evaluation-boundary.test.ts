import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** Files allowed to touch the answer key. Paths are relative to `src/`. */
function mayReadAnswerKey(path: string): boolean {
  return (
    path === "server/evaluation-db.ts" ||
    path === "server/evaluation-boundary.test.ts" ||
    path === "contract/database.types.ts" ||
    path.startsWith("app/api/evaluation/")
  );
}

/** What reaching the answer key looks like in source. */
const REACHES_ANSWER_KEY = [
  /evaluation-db/,
  /\.schema\(\s*["'`]evaluation["'`]\s*\)/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts)$/.test(entry.name) ? [path] : [];
  });
}

export function offenders(files: { path: string; text: string }[]): string[] {
  return files
    .filter((file) => !mayReadAnswerKey(file.path))
    .filter((file) => REACHES_ANSWER_KEY.some((pattern) => pattern.test(file.text)))
    .map((file) => file.path);
}

describe("evaluation boundary", () => {
  it("only the evaluation routes can reach the answer key", () => {
    const files = sourceFiles(SRC).map((path) => ({
      path: relative(SRC, path).split(sep).join("/"),
      text: readFileSync(path, "utf8"),
    }));
    expect(files.length).toBeGreaterThan(0);
    expect(offenders(files)).toEqual([]);
  });

  it("flags an import of the accessor from capture or tutor code", () => {
    const files = [
      { path: "server/tutor.ts", text: 'import { getEvaluationDb } from "./evaluation-db";' },
      { path: "app/api/capture/route.ts", text: 'client.schema("evaluation").from("evaluation_items")' },
      { path: "app/api/evaluation/route.ts", text: 'import { getEvaluationDb } from "@/server/evaluation-db";' },
    ];
    expect(offenders(files)).toEqual(["server/tutor.ts", "app/api/capture/route.ts"]);
  });
});
