import { Section as PageSection, type SectionProps } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import "@/styles/storefront-commerce.css";

export { SectionHeader } from "@/components/ui/section";

/** Customer-only presentation; server routes and shared admin primitives stay independent. */
export function Section({ className, ...props }: SectionProps) {
  return <PageSection {...props} mesh={false} className={cn("sf-commerce", className)} />;
}
