import type { Metadata } from "next";
import AboutContent from "./AboutContent";

export const metadata: Metadata = {
  title: "About SeekCost — Private Investment Decision Support",
  description: "Learn how SeekCost connects investment records, decisions, execution and review while keeping clear privacy and data boundaries.",
};

export default function AboutPage() {
  return <AboutContent />;
}
