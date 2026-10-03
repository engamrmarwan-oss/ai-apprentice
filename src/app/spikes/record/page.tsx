import type { Metadata } from "next";
import { RecordSpike } from "./record-spike";

export const metadata: Metadata = {
  title: "Spike S1 recorder · Tiro",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <RecordSpike />;
}
