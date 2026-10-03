import { describe, expect, it } from "vitest";
import { groupWorkflows, parseApiError, parseHomeData } from "./home-data";

const response = {
  ok: true,
  user: { id: "user-1", email: "ada@example.com", name: "Ada" },
  workflows: [
    {
      id: "workflow-1",
      task: "Review incoming invoices",
      tool: { id: "tool-1", name: "Invoice desk" },
      role: "expert",
    },
    {
      id: "workflow-2",
      task: "Approve supplier changes",
      tool: { id: "tool-2", name: "Supplier desk" },
      role: "new_hire",
    },
  ],
};

describe("Home data", () => {
  it("parses the documented /api/me response", () => {
    expect(parseHomeData(response)).toEqual({
      user: response.user,
      workflows: response.workflows,
    });
  });

  it("rejects a workflow with an account-level role", () => {
    const invalid = {
      ...response,
      workflows: [{ ...response.workflows[0], role: "admin" }],
    };

    expect(parseHomeData(invalid)).toBeNull();
  });

  it("separates workflows by the role held on each workflow", () => {
    const data = parseHomeData(response);
    expect(data).not.toBeNull();

    expect(groupWorkflows(data!.workflows)).toEqual({
      teaching: [response.workflows[0]],
      learning: [response.workflows[1]],
    });
  });

  it("parses a signed-out error", () => {
    expect(
      parseApiError({
        ok: false,
        error: { code: "signed_out", message: "Sign in to continue." },
      }),
    ).toEqual({ code: "signed_out", message: "Sign in to continue." });
  });
});
