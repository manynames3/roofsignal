import { describe, expect, it } from "vitest";
import { demoScenarios } from "../demoData";
import { assessSample, parseSampleInputs, sampleReportUrl } from "./sampleAssessment";

const scenario = demoScenarios.find((item) => item.id === "replacement-first")!;

describe("explorable sample", () => {
  it("matches the original sample with the app's rules", () => {
    const { report } = assessSample(scenario, { roofAgeYears: 23, knownLeaks: "yes" });
    expect(report.scores.totalRisk).toBe(86);
    expect(report.scores.solarReadiness).toBe(38);
    expect(report.recommendation.status).toBe("replacement-first");
  });

  it("changes the recommendation and explanation while retaining confirmed evidence", () => {
    const original = JSON.stringify(scenario);
    const { report } = assessSample(scenario, { roofAgeYears: 6, knownLeaks: "no" });
    expect(report.recommendation.status).toBe("repair-first");
    expect(report.scores.totalRisk).toBe(50);
    expect(report.scores.solarReadiness).toBe(64);
    expect(report.scores.visibleConditionRisk).toBe(94);
    expect(report.analysisTrace.find((item) => item.label === "Roof score calculation")?.detail).toContain("roof age (16), visible condition (94), and leak risk (36)");
    expect(report.photoEvidence.map((item) => item.observations)).toEqual(scenario.photoEvidence.map((item) => item.observations));
    expect(JSON.stringify(scenario)).toBe(original);
  });

  it("responds to age alone and explains unknown leak confidence", () => {
    expect(assessSample(scenario, { roofAgeYears: 30, knownLeaks: "no" }).report.recommendation.status).toBe("replacement-first");
    const { report } = assessSample(scenario, { roofAgeYears: 6, knownLeaks: "unknown" });
    expect(report.recommendation.confidence).toBe("medium");
    expect(report.recommendation.confidenceRationale).toContain("completeness is 90%");
    expect(report.roofRiskFactors).toContain("Leak history still needs to be confirmed.");
  });

  it("round-trips edited inputs into the full report URL", () => {
    const inputs = { roofAgeYears: 6, knownLeaks: "no" } as const;
    expect(parseSampleInputs(new URL(sampleReportUrl(inputs), "http://localhost").searchParams)).toEqual(inputs);
  });

  it.each(["sampleAge=-1&sampleLeaks=no", "sampleAge=41&sampleLeaks=yes", "sampleAge=6.5&sampleLeaks=no", "sampleAge=NaN&sampleLeaks=no", "sampleAge=&sampleLeaks=no", "sampleAge=6&sampleLeaks=invalid", "sampleAge=6", "sampleLeaks=no"])("ignores invalid or incomplete URL inputs: %s", (query) => {
    expect(parseSampleInputs(new URLSearchParams(query))).toBeUndefined();
  });

  it.each([-1, 41, 6.5, NaN])("rejects an invalid age before scoring: %s", (roofAgeYears) => {
    expect(() => assessSample(scenario, { roofAgeYears, knownLeaks: "no" })).toThrow(RangeError);
  });
});
