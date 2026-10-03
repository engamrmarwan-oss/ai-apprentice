import type { Metadata } from "next";
import { FloorSpike } from "./floor-spike";

export const metadata: Metadata = {
  title: "Spike S2 voice floor · Tiro",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <FloorSpike />;
}
