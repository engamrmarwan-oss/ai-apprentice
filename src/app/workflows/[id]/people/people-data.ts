export type WorkflowMember = {
  email: string;
  name: string;
  role: "expert" | "new_hire";
  user_id: string;
};

export type WorkflowInvitation = {
  created_at: string;
  email: string;
  id: string;
  role: "new_hire";
};

export type PeopleData = {
  invitations: WorkflowInvitation[];
  members: WorkflowMember[];
};

export type PeopleError = {
  code: string;
  fields: Record<string, string>;
  message: string;
};

export function parsePeopleData(value: unknown): PeopleData | null {
  if (!isRecord(value) || value.ok !== true) return null;
  if (!Array.isArray(value.members) || !value.members.every(isMember)) return null;
  if (!Array.isArray(value.invitations) || !value.invitations.every(isInvitation)) {
    return null;
  }
  return { invitations: value.invitations, members: value.members };
}

export function parsePeopleError(value: unknown): PeopleError | null {
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

export function parseInviteStatus(value: unknown): "added" | "invited" | null {
  return isRecord(value) &&
    value.ok === true &&
    (value.status === "added" || value.status === "invited")
    ? value.status
    : null;
}

function isMember(value: unknown): value is WorkflowMember {
  return (
    isRecord(value) &&
    typeof value.user_id === "string" &&
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    (value.role === "expert" || value.role === "new_hire")
  );
}

function isInvitation(value: unknown): value is WorkflowInvitation {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    value.role === "new_hire" &&
    typeof value.created_at === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
