import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion } from "./motion";

afterEach(() => vi.unstubAllGlobals());

describe("motion preference", () => {
  it("is safe without a browser", () => {
    vi.stubGlobal("window", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("is safe without media-query support", () => {
    vi.stubGlobal("window", {});
    expect(prefersReducedMotion()).toBe(false);
  });

  it.each([true, false])("respects reduced motion: %s", (matches) => {
    const matchMedia = vi.fn(() => ({ matches }));
    vi.stubGlobal("window", { matchMedia });
    expect(prefersReducedMotion()).toBe(matches);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });
});
