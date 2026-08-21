import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseEnv, MissingSupabaseConfigurationError } from "@/lib/supabase/env";

const original = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

afterEach(() => {
  vi.unstubAllEnvs();

  for (const [name, value] of Object.entries({
    NEXT_PUBLIC_APP_URL: original.appUrl,
    NEXT_PUBLIC_SUPABASE_URL: original.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: original.key,
  })) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("Supabase environment", () => {
  it("fails closed for the production site when public configuration is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_APP_URL = "https://gh-store.me";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(() => getSupabaseEnv()).toThrow(MissingSupabaseConfigurationError);
  });

  it("trims configured values", () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.NEXT_PUBLIC_SUPABASE_URL = " https://project.supabase.co/ ";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = " publishable-key ";

    expect(getSupabaseEnv()).toEqual({
      url: "https://project.supabase.co/",
      publishableKey: "publishable-key",
    });
  });
});
