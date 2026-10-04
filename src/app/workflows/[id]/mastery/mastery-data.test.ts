import { describe, expect, it } from "vitest";
import {
  parseMasteryError,
  parseMasteryReport,
  parseTutorSessions,
  sessionLabel,
} from "./mastery-data";

const report = {
  session_id: "session-1",
  work_map: { id: "map-1", version: 1 },
  rules: [
    { number: 1, rule_id: "rule-1", kind: "never", statement: "Never skip.", outcome: "needed_hint" },
  ],
  totals: { passed_first_time: 0, needed_hint: 1, violated: 0, not_encountered: 0 },
  practise_next: [1],
};

describe("parseTutorSessions", () => {
  it("reads the documented list, keeping its order", () => {
    expect(
      parseTutorSessions({
        ok: true,
        sessions: [
          { id: "b", phase: "teach", started_at: "2026-10-04T10:00:00Z", ended_at: null },
          { id: "a", phase: "ended", started_at: "2026-10-03T10:00:00Z", ended_at: "2026-10-03T10:30:00Z" },
        ],
      }),
    ).toEqual([
      { id: "b", phase: "teach", startedAt: "2026-10-04T10:00:00Z", endedAt: null },
      { id: "a", phase: "ended", startedAt: "2026-10-03T10:00:00Z", endedAt: "2026-10-03T10:30:00Z" },
    ]);
  });

  it("reads an empty list", () => {
    expect(parseTutorSessions({ ok: true, sessions: [] })).toEqual([]);
  });

  it("rejects a session without a start", () => {
    expect(parseTutorSessions({ ok: true, sessions: [{ id: "a", phase: "ended" }] })).toBeNull();
  });
});

describe("parseMasteryReport", () => {
  it("reads the documented report", () => {
    expect(parseMasteryReport({ ok: true, report })).toEqual(report);
  });

  it("rejects an unknown outcome", () => {
    expect(
      parseMasteryReport({
        ok: true,
        report: { ...report, rules: [{ ...report.rules[0], outcome: "maybe" }] },
      }),
    ).toBeNull();
  });

  it("rejects missing totals", () => {
    expect(parseMasteryReport({ ok: true, report: { ...report, totals: {} } })).toBeNull();
  });
});

describe("parseMasteryError", () => {
  it("keeps the code and message", () => {
    expect(parseMasteryError({ ok: false, error: { code: "not_found", message: "Gone." } })).toEqual({
      code: "not_found",
      message: "Gone.",
    });
  });
});

describe("sessionLabel", () => {
  it("marks a session that has not ended", () => {
    expect(
      sessionLabel({ id: "a", phase: "teach", startedAt: "2026-10-04T10:00:00Z", endedAt: null }, "en-GB"),
    ).toMatch(/\(in progress\)$/);
  });

  it("shows the raw value when the date cannot be read", () => {
    expect(sessionLabel({ id: "a", phase: "ended", startedAt: "soon", endedAt: null })).toBe("soon");
  });
});
