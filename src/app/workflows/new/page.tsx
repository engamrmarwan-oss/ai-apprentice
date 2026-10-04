import type { Metadata } from "next";
import { NewWorkflowClient } from "./new-workflow-client";

export const metadata: Metadata = { title: "Teach Tiro a workflow · Tiro" };

export default function NewWorkflowPage() {
  return <NewWorkflowClient />;
}
