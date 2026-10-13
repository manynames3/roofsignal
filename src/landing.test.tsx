import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => vi.unstubAllGlobals());

describe("landing evidence", () => {
  it("shows two distinct photos without a decorative duplicate or carousel", () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const html = renderToStaticMarkup(<App />);
    const images = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);

    expect(images).toEqual([
      "/demo-roof-photos/lifted-shingles-debris.jpg",
      "/demo-roof-photos/peeled-shingles-decking.jpg"
    ]);
    expect(html).not.toContain("hero-plate");
    expect(html).not.toContain("Previous evidence photo");
    expect(html).not.toContain("Next evidence photo");
    expect(html).toContain("See all 6 photos");
  });

  it("leads with the rep benefit and labels the grounded example as Sample", () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("From roof photos to a homeowner-ready report.");
    expect(html).toContain('<h1 class="hero-tagline">From roof photos to a homeowner-ready report.</h1>');
    expect(html).not.toContain("<h1>Roof Signal</h1>");
    expect(html).not.toMatch(/<p class="hero-body">[^<]*Roof Signal/);
    expect(html).toContain("Sample assessment");
    expect(html).toContain("Sample report. No account needed.");
    expect(html).toContain('aria-label="Sample job inputs"');
    expect(html).toContain("23 years");
    expect(html).toContain("Reported");
    expect(html).toContain("6 photos");
    expect(html).not.toMatch(/fictional|synthetic|dummy/i);
    expect(html).toContain('id="sample-roof-age"');
    expect(html).toContain('id="sample-leaks"');
    expect(html).toContain("Why this recommendation");
    expect(html).toContain("Component risk scores:");
  });
});
