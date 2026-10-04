import type { Metadata } from "next";
import { TutorBench } from "./tutor-bench";

export const metadata: Metadata = {
  title: "Tutor bench · Tiro",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <TutorBench />;
}
