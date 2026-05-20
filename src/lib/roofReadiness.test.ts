import { describe, expect, it } from "vitest";
import {
  analyzeRoofReadiness,
  emptyPropertyDetails,
  generateRecommendation,
  getUnsupportedFileReason,
  scoreRoofRisk
} from "./roofReadiness";
import type { RoofAssessmentInput } from "../types/roof";

function input(overrides: Partial<RoofAssessmentInput> = {}): RoofAssessmentInput {
  return {
    photos: [
      {
        id: "photo-1",
        fileName: "roof.jpg",
        previewUrl: "blob:roof",
        sizeBytes: 120000,
        type: "image/jpeg",
        lastModified: Date.now()
      }
    ],
    details: {
      ...emptyPropertyDetails,
      homeownerName: "Taylor Homeowner",
      propertyAddress: "120 Maple St",
      roofAgeYears: 6,
      roofMaterial: "asphalt-shingle",
      knownLeaks: "no",
      existingSolar: "no",
      utilityBillAvailable: "yes",
      desiredOutcome: "solar-only",
      visibleConditionFlags: ["no-obvious-damage"]
    },
    visionConfigured: false,
    ...overrides
  };
}

describe("roof readiness scoring", () => {
  it("recommends solar-ready for newer roofs with no damage and no leaks", () => {
    const assessment = input();
    const scores = scoreRoofRisk(assessment);
    const recommendation = generateRecommendation(assessment, scores);

    expect(recommendation.status).toBe("solar-ready");
    expect(scores.solarReadiness).toBeGreaterThan(70);
  });

  it("recommends replacement-first for older roofs with leaks and visible wear", () => {
    const assessment = input({
      details: {
        ...input().details,
        roofAgeYears: 23,
        knownLeaks: "yes",
        desiredOutcome: "roof-and-solar",
        visibleConditionFlags: [
          "curling-or-lifted-shingles",
          "granule-loss-or-bare-spots",
          "interior-staining"
        ]
      }
    });

    const report = analyzeRoofReadiness(assessment);

    expect(report.recommendation.status).toBe("replacement-first");
    expect(report.scores.totalRisk).toBeGreaterThan(70);
  });

  it("recommends inspection-first when there are no photos and data is incomplete", () => {
    const assessment = input({
      photos: [],
      details: {
        ...emptyPropertyDetails,
        homeownerName: "Casey",
        propertyAddress: "",
        roofAgeYears: null,
        knownLeaks: "unknown",
        visibleConditionFlags: ["limited-or-unclear-photos"]
      }
    });

    const report = analyzeRoofReadiness(assessment);

    expect(report.recommendation.status).toBe("inspection-first");
    expect(report.recommendation.confidence).toBe("low");
  });

  it("does not mark reports vision-assisted unless a vision observation was actually used", () => {
    const configuredOnly = analyzeRoofReadiness(input({ visionConfigured: true }));
    const visionUsed = analyzeRoofReadiness(input({ visionConfigured: true, visionObservationUsed: true }));

    expect(configuredOnly.assessmentMode).toBe("rule-based");
    expect(visionUsed.assessmentMode).toBe("vision-assisted");
  });

  it("rejects unsupported and oversized files", () => {
    const pdf = new File(["x"], "roof.pdf", { type: "application/pdf" });
    const hugeJpg = new File([new Uint8Array(13 * 1024 * 1024)], "roof.jpg", { type: "image/jpeg" });

    expect(getUnsupportedFileReason(pdf)).toContain("Unsupported file type");
    expect(getUnsupportedFileReason(hugeJpg)).toContain("over 12 MB");
  });
});
