import type { Metadata } from "next";
import { SetupClient } from "./setup-client";

export const metadata: Metadata = { title: "Setup · Tiro" };

export default async function SetupPage({
  params,
}: PageProps<"/workflows/[id]/setup">) {
  const { id } = await params;
  return <SetupClient workflowId={id} />;
}
