import { z } from "zod";
export const discoverySettingsSchema = z.object({
  quick_buy_count: z.coerce.number().int().min(0).max(12),
  category_count: z.coerce.number().int().min(0).max(24),
  products_per_category: z.coerce.number().int().min(2).max(12),
  offers_per_product: z.coerce.number().int().min(2).max(24),
  hide_empty_categories: z.boolean(),
});
export const posthogSettingsSchema = z.object({
  enabled: z.boolean(),
  project_key: z.string().trim().max(200).refine(v => !v || /^phc_[A-Za-z0-9_-]+$/.test(v)),
  region: z.enum(["EU", "US"]),
  project_id: z.string().trim().regex(/^[0-9]{0,16}$/),
}).refine(v => !v.enabled || Boolean(v.project_key), { message: "Project key required" });
export type DiscoverySettings = z.infer<typeof discoverySettingsSchema>;
export type PosthogSettings = z.infer<typeof posthogSettingsSchema>;

export const DEFAULT_DISCOVERY_SETTINGS: DiscoverySettings = {
  quick_buy_count: 6,
  category_count: 8,
  products_per_category: 6,
  offers_per_product: 12,
  hide_empty_categories: true,
};

export const DEFAULT_POSTHOG_SETTINGS: PosthogSettings = {
  enabled: false,
  project_key: "",
  region: "EU",
  project_id: "",
};
