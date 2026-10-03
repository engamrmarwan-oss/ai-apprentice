import { describe, expect, it } from "vitest";
import { getNavigation, type OpenWorkflow } from "./navigation";

const workflow: OpenWorkflow = {
  id: "workflow-1",
  task: "Review incoming invoices",
  tool: { id: "tool-1", name: "Invoice desk" },
  role: "expert",
};

describe("getNavigation", () => {
  it("shows only account-level destinations when no workflow is open", () => {
    const labels = getNavigation().flatMap((group) =>
      group.items.map((item) => item.label),
    );

    expect(labels).toEqual(["Home", "Teach Tiro"]);
  });

  it("shows expert navigation inside an expert workflow", () => {
    const items = getNavigation(workflow).flatMap((group) => group.items);
    const labels = items.map((item) => item.label);

    expect(labels).toContain("Capture");
    expect(labels).toContain("People");
    expect(labels).not.toContain("Tutor");
    expect(
      items
        .filter((item) => !["Home", "Teach Tiro"].includes(item.label))
        .every((item) => item.href.startsWith("/workflows/workflow-1")),
    ).toBe(true);
  });

  it("shows learner navigation inside a new-hire workflow", () => {
    const labels = getNavigation({ ...workflow, role: "new_hire" }).flatMap(
      (group) => group.items.map((item) => item.label),
    );

    expect(labels).toContain("Tutor");
    expect(labels).toContain("Mastery");
    expect(labels).not.toContain("People");
  });
});
