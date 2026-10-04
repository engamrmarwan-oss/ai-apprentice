export type BaselineSource =
  | "uploaded_process"
  | "tool_map"
  | "model_knowledge"
  | "previous_work_map";

export type BaselineStatus = "assumed" | "confirmed" | "contradicted" | "not_observed";

export type BaselineStatement = {
  id: string;
  source: BaselineSource;
  status: BaselineStatus;
  text: string;
};

export type ToolMapElement = {
  allowedValues: string[] | null;
  id: string;
  kind: "field" | "status" | "button";
  label: string;
  personal: boolean;
};

export type ToolMapScreen = {
  elements: ToolMapElement[];
  hidden: boolean;
  id: string;
  name: string;
};

export type ToolMap = {
  screens: ToolMapScreen[];
  toolName: string;
};

export type SetupError = {
  code: string;
  fields: Record<string, string>;
  message: string;
};

export const PROCESS_TEXT_MAX = 60_000;
export const SCREEN_NAME_MAX = 120;

const SOURCES: BaselineSource[] = [
  "uploaded_process",
  "tool_map",
  "model_knowledge",
  "previous_work_map",
];
const STATUSES: BaselineStatus[] = ["assumed", "confirmed", "contradicted", "not_observed"];
const KINDS: ToolMapElement["kind"][] = ["field", "status", "button"];

export function parseBaseline(value: unknown): BaselineStatement[] | null {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.statements)) return null;
  const statements: BaselineStatement[] = [];
  for (const statement of value.statements) {
    if (
      !isRecord(statement) ||
      typeof statement.id !== "string" ||
      typeof statement.text !== "string" ||
      !SOURCES.includes(statement.source as BaselineSource) ||
      !STATUSES.includes(statement.status as BaselineStatus)
    ) {
      return null;
    }
    statements.push({
      id: statement.id,
      source: statement.source as BaselineSource,
      status: statement.status as BaselineStatus,
      text: statement.text,
    });
  }
  return statements;
}

export function parseToolMap(value: unknown): ToolMap | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.tool_map)) return null;
  const map = value.tool_map;
  if (!isRecord(map.tool) || typeof map.tool.name !== "string" || !Array.isArray(map.screens)) {
    return null;
  }
  const screens: ToolMapScreen[] = [];
  for (const screen of map.screens) {
    if (
      !isRecord(screen) ||
      typeof screen.id !== "string" ||
      typeof screen.name !== "string" ||
      typeof screen.hidden !== "boolean" ||
      !Array.isArray(screen.elements)
    ) {
      return null;
    }
    const elements = screen.elements.map(toElement);
    if (elements.some((element) => element === null)) return null;
    screens.push({
      elements: elements as ToolMapElement[],
      hidden: screen.hidden,
      id: screen.id,
      name: screen.name,
    });
  }
  return { screens, toolName: map.tool.name };
}

export function parseAdded(value: unknown) {
  return isRecord(value) && typeof value.added === "number" ? value.added : null;
}

export function parseSetupError(value: unknown): SetupError | null {
  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) return null;
  if (typeof value.error.code !== "string" || typeof value.error.message !== "string") {
    return null;
  }
  const fields: Record<string, string> = {};
  if (isRecord(value.error.fields)) {
    for (const [field, message] of Object.entries(value.error.fields)) {
      if (typeof message === "string") fields[field] = message;
    }
  }
  return { code: value.error.code, fields, message: value.error.message };
}

/** Why a written-process file cannot be sent, or null when it can. */
export function processFileProblem(name: string, text: string) {
  if (!/\.(txt|md|markdown)$/i.test(name)) return "Choose a text or Markdown file (.txt or .md).";
  if (!text.trim()) return "That file is empty.";
  if (text.length > PROCESS_TEXT_MAX) {
    return `That file has ${text.length.toLocaleString("en")} characters. Tiro reads up to ${PROCESS_TEXT_MAX.toLocaleString("en")}.`;
  }
  return null;
}

export function sourceLabel(source: BaselineSource) {
  return {
    model_knowledge: "General knowledge of the role",
    previous_work_map: "An earlier Work Map",
    tool_map: "The tool map",
    uploaded_process: "Your written process",
  }[source];
}

export function statusLabel(status: BaselineStatus) {
  return {
    assumed: "Assumed",
    confirmed: "Confirmed",
    contradicted: "Contradicted",
    not_observed: "Not observed",
  }[status];
}

function toElement(value: unknown): ToolMapElement | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.label !== "string" ||
    typeof value.personal !== "boolean" ||
    !KINDS.includes(value.kind as ToolMapElement["kind"])
  ) {
    return null;
  }
  const allowed = value.allowed_values;
  if (!(allowed === null || allowed === undefined || (Array.isArray(allowed) && allowed.every((item) => typeof item === "string")))) {
    return null;
  }
  return {
    allowedValues: (allowed as string[] | null | undefined) ?? null,
    id: value.id,
    kind: value.kind as ToolMapElement["kind"],
    label: value.label,
    personal: value.personal,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
