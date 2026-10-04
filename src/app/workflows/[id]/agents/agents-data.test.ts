import { describe, expect, it } from "vitest";
import {
  connectionBlock,
  keyNameProblem,
  parseAgentKeys,
  parseAgentKeysError,
  parseNewAgentKey,
} from "./agents-data";

const key = {
  id: "key-1",
  name: "My agent",
  hint: "j56c",
  created_at: "2026-10-04T10:00:00Z",
  last_used_at: null,
};

describe("parseAgentKeys", () => {
  it("reads the documented list", () => {
    expect(
      parseAgentKeys({ ok: true, keys: [key], server_url: "https://tiro.example/api/mcp" }),
    ).toEqual({
      keys: [
        { id: "key-1", name: "My agent", hint: "j56c", createdAt: "2026-10-04T10:00:00Z", lastUsedAt: null },
      ],
      serverUrl: "https://tiro.example/api/mcp",
    });
  });

  it("rejects a key without a hint", () => {
    expect(
      parseAgentKeys({ ok: true, keys: [{ ...key, hint: undefined }], server_url: "x" }),
    ).toBeNull();
  });
});

describe("parseNewAgentKey", () => {
  it("reads the key, the secret and the address", () => {
    expect(
      parseNewAgentKey({ ok: true, key, secret: "tiro_abc", server_url: "https://tiro.example/api/mcp" }),
    ).toMatchObject({ secret: "tiro_abc", serverUrl: "https://tiro.example/api/mcp", key: { id: "key-1" } });
  });

  it("rejects an answer without the secret", () => {
    expect(parseNewAgentKey({ ok: true, key, server_url: "x" })).toBeNull();
  });
});

describe("parseAgentKeysError", () => {
  it("keeps field messages", () => {
    expect(
      parseAgentKeysError({
        ok: false,
        error: { code: "invalid_input", message: "Check the form.", fields: { name: "Too long." } },
      }),
    ).toEqual({ code: "invalid_input", message: "Check the form.", fields: { name: "Too long." } });
  });
});

describe("keyNameProblem", () => {
  it("asks for a name", () => {
    expect(keyNameProblem("   ")).toBe("Give the key a name.");
  });

  it("refuses more than 80 characters", () => {
    expect(keyNameProblem("a".repeat(81))).toBe("Use at most 80 characters.");
  });

  it("accepts 80 characters", () => {
    expect(keyNameProblem("a".repeat(80))).toBeNull();
  });
});

describe("connectionBlock", () => {
  it("fills in the address and the key", () => {
    expect(JSON.parse(connectionBlock("https://tiro.example/api/mcp", "tiro_abc"))).toEqual({
      mcpServers: {
        tiro: {
          type: "http",
          url: "https://tiro.example/api/mcp",
          headers: { Authorization: "Bearer tiro_abc" },
        },
      },
    });
  });
});
