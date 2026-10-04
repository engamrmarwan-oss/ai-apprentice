import type { Metadata } from "next";
import { TutorClient } from "./tutor-client";

export const metadata: Metadata = { title: "Tutor · Tiro" };

export default async function TutorPage({
  params,
}: PageProps<"/workflows/[id]/tutor">) {
  const { id } = await params;
  return <TutorClient workflowId={id} />;
}
