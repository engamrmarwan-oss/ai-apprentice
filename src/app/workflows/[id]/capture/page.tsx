import type { Metadata } from "next";
import { CaptureClient } from "./capture-client";

export const metadata: Metadata = { title: "Capture · Tiro" };

export default async function CapturePage({
  params,
}: PageProps<"/workflows/[id]/capture">) {
  const { id } = await params;
  return <CaptureClient workflowId={id} />;
}
