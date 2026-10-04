export type WorkflowField = "role" | "task" | "tool_name" | "tool_url";

export type WorkflowInput = {
  role?: string;
  task: string;
  tool_name: string;
  tool_url?: string;
};

export type WorkflowFormErrors = {
  fieldErrors: Partial<Record<WorkflowField, string>>;
  formError: string | null;
};

const workflowFields = new Set<WorkflowField>([
  "role",
  "task",
  "tool_name",
  "tool_url",
]);

export function buildWorkflowInput(form: FormData): WorkflowInput {
  const toolUrl = String(form.get("tool_url") ?? "").trim();
  const role = String(form.get("role") ?? "").trim();

  return {
    task: String(form.get("task") ?? ""),
    tool_name: String(form.get("tool_name") ?? ""),
    ...(toolUrl ? { tool_url: toolUrl } : {}),
    ...(role ? { role } : {}),
  };
}

export function parseWorkflowError(value: unknown): WorkflowFormErrors {
  const fallback = "Tiro couldn’t create that workflow. Try again.";

  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) {
    return { fieldErrors: {}, formError: fallback };
  }

  const fieldErrors: Partial<Record<WorkflowField, string>> = {};
  if (isRecord(value.error.fields)) {
    for (const [field, message] of Object.entries(value.error.fields)) {
      if (workflowFields.has(field as WorkflowField) && typeof message === "string") {
        fieldErrors[field as WorkflowField] = message;
      }
    }
  }

  const message =
    typeof value.error.message === "string" && value.error.message.trim()
      ? value.error.message
      : fallback;

  return {
    fieldErrors,
    formError: Object.keys(fieldErrors).length > 0 ? null : message,
  };
}

export function getCreatedWorkflowId(value: unknown): string | null {
  return isRecord(value) &&
    value.ok === true &&
    isRecord(value.workflow) &&
    typeof value.workflow.id === "string"
    ? value.workflow.id
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
