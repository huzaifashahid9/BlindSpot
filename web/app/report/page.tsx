import type { Metadata } from "next";
import Report from "@/components/Report";

export const metadata: Metadata = { title: "BlindSpot district fire report" };

export default function Page() {
  return <Report />;
}
