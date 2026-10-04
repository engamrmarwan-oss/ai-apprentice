import type { Metadata } from "next";
import { AgentsClient } from "./agents-client";

export const metadata: Metadata = { title: "Agents · Tiro" };

export default async function AgentsPage({
  params,
}: PageProps<"/workflows/[id]/agents">) {
  const { id } = await params;
  return <AgentsClient workflowId={id} />;
}
