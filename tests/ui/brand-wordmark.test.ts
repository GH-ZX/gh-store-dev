import { describe, expect, it } from "vitest";
import { BRAND_SWEEP_KEYFRAMES, BRAND_SWEEP_OPTIONS } from "@/lib/brand-wordmark";

describe("brand wordmark sweep animation spec", () => {
  it("starts off-screen left, sweeps across, and fades out after leaving the text", () => {
    expect(BRAND_SWEEP_KEYFRAMES.length).toBe(4);

    const [enter, ready, gone, done] = BRAND_SWEEP_KEYFRAMES;
    expect(enter.backgroundPosition).toBe("-120% 0");
    expect(enter.opacity).toBe(0);

    expect(ready.backgroundPosition).toBe("-120% 0");
    expect(ready.opacity).toBe(1);
    expect(ready.offset).toBeGreaterThan(0);

    expect(gone.backgroundPosition).toBe("220% 0");
    expect(gone.opacity).toBe(1);
    expect(gone.offset).toBeLessThan(1);

    expect(done.backgroundPosition).toBe("220% 0");
    expect(done.opacity).toBe(0);
  });

  it("uses the site easing, a fixed delay, and a forward fill", () => {
    expect(BRAND_SWEEP_OPTIONS).toMatchObject({
      duration: 1400,
      delay: 150,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "forwards",
    });
  });
});
