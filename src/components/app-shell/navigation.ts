import type { IconName } from "@/components/ui/icon";

export type WorkflowRole = "expert" | "new_hire";

export type OpenWorkflow = {
  id: string;
  role: WorkflowRole;
  task: string;
  tool: {
    id: string;
    name: string;
  };
};

export type NavigationItem = {
  href: string;
  icon: IconName;
  label: string;
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const workspaceNavigation: NavigationGroup = {
  label: "Workspace",
  items: [
    { href: "/", icon: "home", label: "Home" },
    { href: "/workflows/new", icon: "plus", label: "Teach Tiro" },
  ],
};

export function getNavigation(workflow?: OpenWorkflow): NavigationGroup[] {
  if (!workflow) return [workspaceNavigation];

  const root = `/workflows/${encodeURIComponent(workflow.id)}`;
  const workflowNavigation: NavigationGroup = {
    label: workflow.tool.name,
    items: [
      { href: root, icon: "overview", label: "Overview" },
      { href: `${root}/work-map`, icon: "map", label: "Work Map" },
    ],
  };

  const teachingNavigation: NavigationGroup = {
    label: "Teach",
    items: [
      { href: `${root}/capture`, icon: "record", label: "Capture" },
      { href: `${root}/debrief`, icon: "conversation", label: "Debrief" },
      { href: `${root}/people`, icon: "people", label: "People" },
      { href: `${root}/agents`, icon: "key", label: "Agents" },
    ],
  };
  const learningNavigation: NavigationGroup = {
    label: "Learn",
    items: [
      { href: `${root}/tutor`, icon: "sparkles", label: "Tutor" },
      { href: `${root}/mastery`, icon: "chart", label: "Mastery" },
    ],
  };

  return workflow.role === "expert"
    ? [workspaceNavigation, workflowNavigation, teachingNavigation, learningNavigation]
    : [workspaceNavigation, workflowNavigation, learningNavigation];
}
