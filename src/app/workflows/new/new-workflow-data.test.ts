import { describe, expect, it } from "vitest";
import {
  buildWorkflowInput,
  getCreatedWorkflowId,
  parseWorkflowError,
} from "./new-workflow-data";

describe("new workflow data", () => {
  it("omits blank optional fields from the request", () => {
    const form = new FormData();
    form.set("tool_name", "Invoice desk");
    form.set("tool_url", "  ");
    form.set("task", "Review incoming invoices");
    form.set("role", "");

    expect(buildWorkflowInput(form)).toEqual({
      task: "Review incoming invoices",
      tool_name: "Invoice desk",
    });
  });

  it("keeps provided optional fields", () => {
    const form = new FormData();
    form.set("tool_name", "Invoice desk");
    form.set("tool_url", " https://invoices.example.test ");
    form.set("task", "Review incoming invoices");
    form.set("role", "Accounts payable specialist");

    expect(buildWorkflowInput(form)).toEqual({
      role: "Accounts payable specialist",
      task: "Review incoming invoices",
      tool_name: "Invoice desk",
      tool_url: "https://invoices.example.test",
    });
  });

  it("returns documented field errors", () => {
    expect(
      parseWorkflowError({
        ok: false,
        error: {
          code: "invalid_input",
          message: "Some fields need correcting.",
          fields: { tool_url: "Enter a web address that starts with http:// or https://." },
        },
      }),
    ).toEqual({
      fieldErrors: {
        tool_url: "Enter a web address that starts with http:// or https://.",
      },
      formError: null,
    });
  });

  it("reads the created workflow id", () => {
    expect(getCreatedWorkflowId({ ok: true, workflow: { id: "workflow-1" } })).toBe(
      "workflow-1",
    );
    expect(getCreatedWorkflowId({ ok: true })).toBeNull();
  });
});
