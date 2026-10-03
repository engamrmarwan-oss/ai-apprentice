import type { WorkflowRole } from "@/components/app-shell/navigation";

export type HomeUser = {
  email: string;
  id: string;
  name: string;
};

export type HomeWorkflow = {
  id: string;
  role: WorkflowRole;
  task: string;
  tool: {
    id: string;
    name: string;
  };
};

export type HomeData = {
  user: HomeUser;
  workflows: HomeWorkflow[];
};

export type ApiError = {
  code: string;
  message: string;
};

export function parseHomeData(value: unknown): HomeData | null {
  if (!isRecord(value) || value.ok !== true) return null;
  if (!isUser(value.user) || !Array.isArray(value.workflows)) return null;
  if (!value.workflows.every(isWorkflow)) return null;

  return { user: value.user, workflows: value.workflows };
}

export function parseApiError(value: unknown): ApiError | null {
  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) {
    return null;
  }
  if (typeof value.error.code !== "string" || typeof value.error.message !== "string") {
    return null;
  }
  return { code: value.error.code, message: value.error.message };
}

export function groupWorkflows(workflows: HomeWorkflow[]) {
  return {
    learning: workflows.filter((workflow) => workflow.role === "new_hire"),
    teaching: workflows.filter((workflow) => workflow.role === "expert"),
  };
}

function isUser(value: unknown): value is HomeUser {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    typeof value.name === "string"
  );
}

function isWorkflow(value: unknown): value is HomeWorkflow {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.task === "string" &&
    (value.role === "expert" || value.role === "new_hire") &&
    isRecord(value.tool) &&
    typeof value.tool.id === "string" &&
    typeof value.tool.name === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
