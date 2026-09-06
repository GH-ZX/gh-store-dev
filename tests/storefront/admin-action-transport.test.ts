import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProductAction, reorderCarouselProducts } from "@/lib/admin-actions";

const fetchMock = vi.fn();
const dispatchEvent = vi.fn();
const assign = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { dispatchEvent, location: { assign } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("admin action browser transport", () => {
  it("preserves repeated form fields and uploads and unwraps the server result", async () => {
    const result = { error: "invalid_input", notice: null };
    fetchMock.mockResolvedValueOnce(Response.json({ result }));
    const form = new FormData();
    form.append("name", "Test product");
    form.append("region", "eu");
    form.append("region", "us");
    form.append("artwork", new Blob(["image bytes"], { type: "image/png" }), "product.png");
    const initial = { error: null, notice: null };
    await expect(createProductAction(initial, form)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin-actions");
    expect(options.method).toBe("POST");
    const sent = options.body as FormData;
    expect(sent.get("action")).toBe("createProductAction");
    expect(JSON.parse(String(sent.get("args")))).toEqual([initial, { $form: 1 }]);
    expect(sent.getAll("form1:region")).toEqual(["eu", "us"]);
    const upload = sent.get("form1:artwork") as File;
    expect(upload.name).toBe("product.png");
    expect(await upload.text()).toBe("image bytes");
    expect(dispatchEvent.mock.calls[0][0].type).toBe("admin-action-complete");
  });

  it("keeps direct product arguments intact for catalog ordering", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ result: { success: true } }));
    await reorderCarouselProducts("product-b", "product-a");
    const sent = fetchMock.mock.calls[0][1].body as FormData;
    expect(sent.get("action")).toBe("reorderCarouselProducts");
    expect(JSON.parse(String(sent.get("args")))).toEqual(["product-b", "product-a"]);
  });

  it("reports a rejected server action without claiming completion", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));
    await expect(createProductAction({ error: null, notice: null }, new FormData())).rejects.toThrow("Unable to complete");
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
