import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Tripwire, not proof: nothing about any one tool or workflow may be written
// into the code that watches, plans and decides, or into its prompts. Tools,
// baselines, questions and rules are data. The words below are those of the
// first demo workflow and of the example the tests use; tests themselves may
// use them, as fixtures.
const SPECIFIC = /crystal|requirement|invoice|\bREQ-/i;
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FOLDERS = ["server", "conductor", "capture", "sensor"];

function sources(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const file = path.join(folder, name);
    if (statSync(file).isDirectory()) return sources(file);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

describe("generality", () => {
  const files = FOLDERS.flatMap((folder) => sources(path.join(ROOT, folder)));

  it("finds the code it is meant to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((file) => [path.relative(ROOT, file), file]))("%s names no tool or workflow", (_name, file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(SPECIFIC);
  });
});
