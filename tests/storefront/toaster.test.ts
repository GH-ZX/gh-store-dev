import { describe, expect, it } from "vitest";
import { AppToaster, toast } from "../../storefront/app/components/ui/toaster";

describe("toaster notifications integration", () => {
  it("exports AppToaster component", () => {
    expect(typeof AppToaster).toBe("function");
  });

  it("exports toast interface with notification methods", () => {
    expect(typeof toast).toBe("function");
    expect(typeof toast.success).toBe("function");
    expect(typeof toast.error).toBe("function");
    expect(typeof toast.info).toBe("function");
    expect(typeof toast.warning).toBe("function");
  });
});
