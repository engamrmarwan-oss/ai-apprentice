import type { Metadata } from "next";
import { SessionBench } from "./session-bench";

export const metadata: Metadata = {
  title: "Session bench · Tiro",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SessionBench />;
}
