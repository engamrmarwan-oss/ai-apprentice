import type { Metadata } from "next";
import { DebriefBench } from "./debrief-bench";

export const metadata: Metadata = {
  title: "Debrief bench · Tiro",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DebriefBench />;
}
