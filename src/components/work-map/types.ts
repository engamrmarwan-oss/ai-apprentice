import type { Rule, TiroEvent } from "@/contract";
import type { Tables } from "@/contract/database.types";

export type WorkMapStepItem = {
  event: TiroEvent;
  frame: Tables<"frames">;
  reason: Tables<"utterances">;
  rules: Rule[];
  step: Tables<"steps">;
};

export type WorkMapFixture = {
  ruleHistory: Record<string, Rule[]>;
  steps: WorkMapStepItem[];
  workMap: Tables<"work_maps">;
};

export type FrameReading = {
  fields: Array<{ name: string; value: string }>;
  item: string | null;
  screen: string;
};

export function frameReading(frame: Tables<"frames">): FrameReading | null {
  const value = frame.reading;
  if (!isRecord(value) || typeof value.screen !== "string") return null;
  if (value.item !== null && typeof value.item !== "string") return null;
  if (!Array.isArray(value.fields)) return null;

  const fields = value.fields.flatMap((field) =>
    isRecord(field) && typeof field.name === "string" && typeof field.value === "string"
      ? [{ name: field.name, value: field.value }]
      : [],
  );

  return { fields, item: value.item, screen: value.screen };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
