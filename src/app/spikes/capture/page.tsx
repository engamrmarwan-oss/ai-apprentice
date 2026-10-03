import type { Metadata } from "next";
import { CaptureSpike } from "./capture-spike";

export const metadata: Metadata = {
  title: "Spike S4 · Tiro",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <CaptureSpike />;
}
