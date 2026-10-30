export type CongestionLevel = "LOW" | "MODERATE" | "HIGH";

export function congestionBadgeClass(level: string | null | undefined): string {
  if (level === "HIGH") {
    return "bg-vo-bad-bg text-vo-bad-ink border-vo-bad-border";
  }
  if (level === "MODERATE") {
    return "bg-vo-warn-bg text-vo-warn-ink border-vo-warn-border";
  }
  return "bg-vo-good-bg text-vo-good-ink border-vo-good-border";
}

export function congestionDotClass(level: string | null | undefined): string {
  if (level === "HIGH") {
    return "bg-[#c45c4a]";
  }
  if (level === "MODERATE") {
    return "bg-[#c5a66a]";
  }
  return "bg-[#3d7a5a]";
}
