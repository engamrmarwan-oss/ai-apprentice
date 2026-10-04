import type { Metadata } from "next";
import { WorkMapClient } from "./work-map-client";

export const metadata: Metadata = { title: "Work Map · Tiro" };

export default async function WorkMapPage({
  params,
}: PageProps<"/workflows/[id]/work-map">) {
  const { id } = await params;
  return <WorkMapClient workflowId={id} />;
}
