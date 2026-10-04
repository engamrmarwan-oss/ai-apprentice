export type AgentKey = {
  createdAt: string;
  hint: string;
  id: string;
  lastUsedAt: string | null;
  name: string;
};

export type AgentKeysData = {
  keys: AgentKey[];
  serverUrl: string;
};

export type NewAgentKey = {
  key: AgentKey;
  secret: string;
  serverUrl: string;
};

export type AgentKeysError = {
  code: string;
  fields: Record<string, string>;
  message: string;
};

export const KEY_NAME_MAX = 80;

export function parseAgentKeys(value: unknown): AgentKeysData | null {
  if (!isRecord(value) || value.ok !== true || typeof value.server_url !== "string") return null;
  if (!Array.isArray(value.keys)) return null;
  const keys = value.keys.map(toAgentKey);
  if (keys.some((key) => key === null)) return null;
  return { keys: keys as AgentKey[], serverUrl: value.server_url };
}

export function parseNewAgentKey(value: unknown): NewAgentKey | null {
  if (!isRecord(value) || value.ok !== true) return null;
  if (typeof value.secret !== "string" || typeof value.server_url !== "string") return null;
  const key = toAgentKey(value.key);
  return key ? { key, secret: value.secret, serverUrl: value.server_url } : null;
}

export function parseAgentKeysError(value: unknown): AgentKeysError | null {
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

/** What is wrong with a key name before it is sent, or null when it may be sent. */
export function keyNameProblem(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "Give the key a name.";
  if (trimmed.length > KEY_NAME_MAX) return `Use at most ${KEY_NAME_MAX} characters.`;
  return null;
}

/** The JSON an agent that takes its MCP servers as JSON is given, as in docs/API.md. */
export function connectionBlock(serverUrl: string, secret: string) {
  return JSON.stringify(
    {
      mcpServers: {
        tiro: {
          type: "http",
          url: serverUrl,
          headers: { Authorization: `Bearer ${secret}` },
        },
      },
    },
    null,
    2,
  );
}

function toAgentKey(value: unknown): AgentKey | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.hint !== "string" ||
    typeof value.created_at !== "string" ||
    !(value.last_used_at === null || typeof value.last_used_at === "string")
  ) {
    return null;
  }
  return {
    createdAt: value.created_at,
    hint: value.hint,
    id: value.id,
    lastUsedAt: value.last_used_at,
    name: value.name,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
