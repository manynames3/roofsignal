import { describe, expect, it } from "vitest";
import { demoScenarios } from "../demoData";
import { analyzeRoofReadiness } from "./roofReadiness";
import { estimateSolarOpportunity } from "./solarOpportunity";

describe("solar opportunity estimates", () => {
  it("estimates system size, watts, annual production, and score from roof assumptions", () => {
    const scenario = demoScenarios.find((item) => item.id === "solar-ready");
    expect(scenario).toBeDefined();

    const estimate = estimateSolarOpportunity(scenario!.details, scenario!.solarAssumptions);

    expect(estimate.source).toBe("local-assumption");
    expect(estimate.panelCount).toBeGreaterThan(0);
    expect(estimate.estimatedDcWatts).toBeGreaterThan(0);
    expect(estimate.systemCapacityKw).toBeGreaterThan(0);
    expect(estimate.annualProductionKwh).toBeGreaterThan(0);
    expect(estimate.monthlyProductionKwh).toHaveLength(12);
    expect(estimate.solarScore).toBeGreaterThan(70);
  });

  it("marks solar opportunity confidence low when roof area or orientation is missing", () => {
    const scenario = demoScenarios[0];
    const estimate = estimateSolarOpportunity(scenario.details, {
      ...scenario.solarAssumptions,
      usableRoofAreaSqft: null,
      roofOrientation: "unknown"
    });

    expect(estimate.confidence).toBe("low");
    expect(estimate.systemCapacityKw).toBeNull();
    expect(estimate.warnings).toContain("Usable roof area is missing, so system size and production cannot be estimated.");
  });

  it("includes solar opportunity in the readiness report when provided", () => {
    const scenario = demoScenarios.find((item) => item.id === "replacement-first");
    expect(scenario).toBeDefined();

    const solarOpportunity = estimateSolarOpportunity(scenario!.details, scenario!.solarAssumptions);
    const report = analyzeRoofReadiness({
      photos: scenario!.photos,
      details: scenario!.details,
      photoEvidence: scenario!.photoEvidence,
      solarOpportunity
    });

    expect(report.solarOpportunity?.annualProductionKwh).toBe(solarOpportunity.annualProductionKwh);
    expect(report.solarReadinessFactors.some((factor) => factor.includes("Preliminary solar opportunity estimate"))).toBe(true);
  });
});
