import type { DemoScenario } from "../demoData";
import type { KnownStatus } from "../types/roof";
import { analyzeRoofReadiness } from "./roofReadiness";
import { estimateSolarOpportunity } from "./solarOpportunity";

export interface SampleInputs {
  roofAgeYears: number;
  knownLeaks: KnownStatus;
}

export function assessSample(scenario: DemoScenario, inputs: SampleInputs) {
  if (!Number.isInteger(inputs.roofAgeYears) || inputs.roofAgeYears < 0 || inputs.roofAgeYears > 40 ||
      !["yes", "no", "unknown"].includes(inputs.knownLeaks)) {
    throw new RangeError("Invalid sample roof inputs.");
  }
  const details = { ...scenario.details, ...inputs };
  const report = analyzeRoofReadiness({
    photos: scenario.photos,
    details,
    photoEvidence: scenario.photoEvidence,
    solarOpportunity: estimateSolarOpportunity(details, scenario.solarAssumptions),
    visionConfigured: false,
    visionObservationUsed: false
  });
  return { details, report };
}

export function parseSampleInputs(params: URLSearchParams): SampleInputs | undefined {
  const age = params.get("sampleAge");
  const leaks = params.get("sampleLeaks");
  if (age === null || !/^\d{1,2}$/.test(age) || Number(age) > 40 ||
      (leaks !== "yes" && leaks !== "no" && leaks !== "unknown")) return undefined;
  return { roofAgeYears: Number(age), knownLeaks: leaks };
}

export function sampleReportUrl(inputs: SampleInputs): string {
  const params = new URLSearchParams({ sampleAge: String(inputs.roofAgeYears), sampleLeaks: inputs.knownLeaks });
  return `/app?${params}#report`;
}
