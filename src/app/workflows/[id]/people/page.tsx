import type { Metadata } from "next";
import { PeopleClient } from "./people-client";

export const metadata: Metadata = { title: "People · Tiro" };

export default async function PeoplePage({
  params,
}: PageProps<"/workflows/[id]/people">) {
  const { id } = await params;
  return <PeopleClient workflowId={id} />;
}
