/**
 * UI v2 — Daxa / "Overview Panel" tasarım sistemi bileşenleri.
 * Yön dokümanı: frontend/bizboard/docs/ui-v2-direction.md
 */
export { MetricCard } from "./MetricCard";
export { SegmentBar, type Segment } from "./SegmentBar";
export { GaugeArc } from "./GaugeArc";
export { BarChartMini, type Bar } from "./BarChartMini";
export { StackInsightCard, type Insight } from "./StackInsightCard";
export { AssistantPanel, type AssistantMessage } from "./AssistantPanel";

// Motion primitive'leri (re-export — tek import noktası).
export { AnimatedNumber } from "@/components/motion/AnimatedNumber";
export { Reveal } from "@/components/motion/Reveal";
