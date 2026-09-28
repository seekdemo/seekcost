import type { Metadata } from "next";
import GuideContent from "./GuideContent";

export const metadata: Metadata = {
  title: "SeekCost Guide — Build a Reviewable Decision Loop",
  description: "Follow a practical seven-step guide for organizing investments, evidence, execution and review in SeekCost.",
};

export default function GuidePage() {
  return <GuideContent />;
}
