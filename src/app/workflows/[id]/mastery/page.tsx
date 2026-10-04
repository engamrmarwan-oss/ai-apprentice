import type { Metadata } from "next";
import { MasteryClient } from "./mastery-client";

export const metadata: Metadata = { title: "Mastery report · Tiro" };

export default async function MasteryPage({
  params,
}: PageProps<"/workflows/[id]/mastery">) {
  const { id } = await params;
  return <MasteryClient workflowId={id} />;
}
