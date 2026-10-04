import type { Metadata } from "next";
import { DebriefClient } from "./debrief-client";

export const metadata: Metadata = { title: "Debrief · Tiro" };

export default async function DebriefPage({
  params,
}: PageProps<"/workflows/[id]/debrief">) {
  const { id } = await params;
  return <DebriefClient workflowId={id} />;
}
