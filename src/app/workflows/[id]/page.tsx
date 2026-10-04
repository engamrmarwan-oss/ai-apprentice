import type { Metadata } from "next";
import { WorkflowOverviewClient } from "./workflow-overview-client";

export const metadata: Metadata = { title: "Workflow · Tiro" };

export default async function WorkflowPage({ params }: PageProps<"/workflows/[id]">) {
  const { id } = await params;
  return <WorkflowOverviewClient workflowId={id} />;
}
