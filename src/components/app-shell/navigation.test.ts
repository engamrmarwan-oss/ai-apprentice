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

  it("lets an expert teach and learn inside the same workflow", () => {
    const navigation = getNavigation(workflow);
    const items = navigation.flatMap((group) => group.items);
    const labels = items.map((item) => item.label);

    expect(navigation.map((group) => group.label)).toEqual([
      "Workspace",
      "Invoice desk",
      "Teach",
      "Learn",
    ]);
    expect(labels).toContain("Capture");
    expect(labels).toContain("People");
    expect(labels).toContain("Agents");
    expect(labels).toContain("Tutor");
    expect(labels).toContain("Mastery");
    expect(
      items
        .filter((item) => !["Home", "Teach Tiro"].includes(item.label))
        .every((item) => item.href.startsWith("/workflows/workflow-1")),
    ).toBe(true);
  });

  it("keeps expert-only tools out of a new-hire workflow", () => {
    const navigation = getNavigation({ ...workflow, role: "new_hire" });
    const labels = navigation.flatMap((group) =>
      group.items.map((item) => item.label),
    );

    expect(navigation.map((group) => group.label)).toEqual([
      "Workspace",
      "Invoice desk",
      "Learn",
    ]);
    expect(labels).toContain("Tutor");
    expect(labels).toContain("Mastery");
    expect(labels).not.toContain("Capture");
    expect(labels).not.toContain("People");
    expect(labels).not.toContain("Agents");
  });
});
