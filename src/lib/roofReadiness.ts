import type {
  ConfidenceLevel,
  DesiredOutcome,
  PropertyDetails,
  ReadinessReport,
  RecommendationStatus,
  RepGuidance,
  RoofAssessmentInput,
  RoofMaterial,
  RoofRecommendation,
  RoofRiskScores,
  UploadedPhoto,
  VisibleConditionFlag
} from "../types/roof";

const MAX_SCORE = 100;

export const emptyPropertyDetails: PropertyDetails = {
  homeownerName: "",
  propertyAddress: "",
  roofAgeYears: null,
  roofMaterial: "unknown",
  knownLeaks: "unknown",
  existingSolar: "unknown",
  utilityBillAvailable: "unknown",
  desiredOutcome: "unknown",
  repNotes: "",
  visibleConditionFlags: ["limited-or-unclear-photos"]
};

export const roofMaterialLabels: Record<RoofMaterial, string> = {
  "asphalt-shingle": "Asphalt shingle",
  metal: "Metal",
  tile: "Tile",
  "flat-membrane": "Flat / membrane",
  "wood-shake": "Wood shake",
  unknown: "Unknown"
};

export const desiredOutcomeLabels: Record<DesiredOutcome, string> = {
  "solar-only": "Solar only",
  "roof-only": "Roof only",
  "roof-and-solar": "Roof + solar",
  unknown: "Unknown"
};

export const conditionFlagLabels: Record<VisibleConditionFlag, string> = {
  "no-obvious-damage": "No obvious damage visible",
  "curling-or-lifted-shingles": "Curling, lifted, or uneven shingles",
  "missing-or-damaged-shingles": "Missing or damaged shingles",
  "granule-loss-or-bare-spots": "Granule loss or bare spots",
  "damaged-flashing-or-penetrations": "Damaged flashing, vents, or penetrations",
  "valley-or-gutter-wear": "Valley, edge, or gutter wear",
  "sagging-or-soft-decking": "Sagging or soft-looking decking",
  "interior-staining": "Attic, ceiling, or water staining",
  "limited-or-unclear-photos": "Photos are limited or unclear"
};

const conditionWeights: Record<VisibleConditionFlag, number> = {
  "no-obvious-damage": -10,
  "curling-or-lifted-shingles": 18,
  "missing-or-damaged-shingles": 18,
  "granule-loss-or-bare-spots": 16,
  "damaged-flashing-or-penetrations": 14,
  "valley-or-gutter-wear": 12,
  "sagging-or-soft-decking": 34,
  "interior-staining": 28,
  "limited-or-unclear-photos": 18
};

function clamp(value: number, min = 0, max = MAX_SCORE): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function scoreRoofAgeRisk(ageYears: number | null): number {
  if (ageYears === null || Number.isNaN(ageYears)) return 42;
  if (ageYears <= 5) return 6;
  if (ageYears <= 10) return 16;
  if (ageYears <= 15) return 34;
  if (ageYears <= 20) return 58;
  if (ageYears <= 25) return 76;
  return 90;
}

export function scoreVisibleConditionRisk(flags: VisibleConditionFlag[]): number {
  if (flags.length === 0) return 35;

  const score = flags.reduce((sum, flag) => sum + conditionWeights[flag], 16);
  return clamp(score);
}

export function scoreLeakRisk(details: PropertyDetails): number {
  if (
    details.knownLeaks === "yes" ||
    details.visibleConditionFlags.includes("interior-staining") ||
    details.visibleConditionFlags.includes("sagging-or-soft-decking")
  ) {
    return 88;
  }

  if (details.knownLeaks === "unknown") return 45;

  if (details.visibleConditionFlags.includes("damaged-flashing-or-penetrations")) return 36;

  return 8;
}

function scoreDataCompleteness(input: RoofAssessmentInput): number {
  const fields = [
    input.photos.length > 0,
    Boolean(input.details.homeownerName.trim()),
    Boolean(input.details.propertyAddress.trim()),
    input.details.roofAgeYears !== null,
    input.details.roofMaterial !== "unknown",
    input.details.knownLeaks !== "unknown",
    input.details.existingSolar !== "unknown",
    input.details.utilityBillAvailable !== "unknown",
    input.details.desiredOutcome !== "unknown",
    input.details.visibleConditionFlags.length > 0 &&
      !input.details.visibleConditionFlags.includes("limited-or-unclear-photos")
  ];

  const complete = fields.filter(Boolean).length;
  return clamp((complete / fields.length) * 100);
}

export function scoreRoofRisk(input: RoofAssessmentInput): RoofRiskScores {
  const roofAgeRisk = scoreRoofAgeRisk(input.details.roofAgeYears);
  const visibleConditionRisk = scoreVisibleConditionRisk(input.details.visibleConditionFlags);
  const leakRisk = scoreLeakRisk(input.details);
  const dataCompleteness = scoreDataCompleteness(input);

  const totalRisk = clamp(roofAgeRisk * 0.34 + visibleConditionRisk * 0.36 + leakRisk * 0.3);
  const urgency = clamp(
    totalRisk * 0.55 +
      leakRisk * 0.25 +
      (input.details.visibleConditionFlags.includes("sagging-or-soft-decking") ? 20 : 0) +
      (input.details.visibleConditionFlags.includes("limited-or-unclear-photos") ? 8 : 0)
  );
  const solarReadiness = clamp(
    100 -
      totalRisk * 0.72 -
      (input.details.existingSolar === "yes" ? 10 : 0) -
      (input.details.desiredOutcome === "roof-only" ? 10 : 0) -
      (dataCompleteness < 55 ? 12 : 0)
  );

  return {
    roofAgeRisk,
    visibleConditionRisk,
    leakRisk,
    solarReadiness,
    urgency,
    dataCompleteness,
    totalRisk
  };
}

function confidenceFromScores(input: RoofAssessmentInput, scores: RoofRiskScores): ConfidenceLevel {
  if (scores.dataCompleteness < 55 || input.photos.length === 0) return "low";
  if (scores.dataCompleteness < 78 || input.details.knownLeaks === "unknown") return "medium";
  return "high";
}

export function generateRecommendation(
  input: RoofAssessmentInput,
  scores: RoofRiskScores
): RoofRecommendation {
  const confidence = confidenceFromScores(input, scores);
  const hasInspectionFlag =
    input.photos.length === 0 ||
    input.details.visibleConditionFlags.includes("limited-or-unclear-photos") ||
    scores.dataCompleteness < 45;
  const severeRisk =
    scores.totalRisk >= 72 ||
    scores.leakRisk >= 84 ||
    input.details.visibleConditionFlags.includes("sagging-or-soft-decking");
  const moderateRisk = scores.totalRisk >= 42 || scores.visibleConditionRisk >= 45;

  let status: RecommendationStatus;

  if (hasInspectionFlag && !severeRisk) {
    status = "inspection-first";
  } else if (severeRisk) {
    status = "replacement-first";
  } else if (moderateRisk) {
    status = "repair-first";
  } else {
    status = "solar-ready";
  }

  const config: Record<RecommendationStatus, Omit<RoofRecommendation, "status" | "confidence" | "confidenceRationale">> = {
    "solar-ready": {
      label: "Solar-ready",
      recommendedSalesPath: "Lead with solar qualification while confirming roof condition during the appointment.",
      nextBestAction: "Proceed with solar qualification and document roof condition before final proposal."
    },
    "repair-first": {
      label: "Roof tune-up recommended before solar",
      recommendedSalesPath: "Discuss minor roof corrections before solar to reduce future service issues.",
      nextBestAction: "Offer a roof tune-up scope or roofer review before final solar design."
    },
    "replacement-first": {
      label: "Roof replacement should be discussed before solar",
      recommendedSalesPath:
        "Lead with roof replacement or a roof + solar bundle before presenting a solar-only proposal.",
      nextBestAction: "Schedule an in-person roof inspection and prepare a roof + solar bundle option."
    },
    "inspection-first": {
      label: "Needs in-person roof inspection before quoting solar",
      recommendedSalesPath:
        "Pause solar-only quoting until an in-person roof condition check confirms the right path.",
      nextBestAction: "Book a roof inspection and collect clearer roof slope, flashing, valley, and interior photos."
    }
  };

  return {
    status,
    ...config[status],
    confidence,
    confidenceRationale: getConfidenceRationale(input, scores, confidence)
  };
}

function getConfidenceRationale(
  input: RoofAssessmentInput,
  scores: RoofRiskScores,
  confidence: ConfidenceLevel
): string {
  if (confidence === "low") {
    return input.photos.length === 0
      ? "Low because no roof photos were uploaded."
      : "Low because required job details or clear condition inputs are missing.";
  }

  if (confidence === "medium") {
    return `Medium because the report has enough data to triage, but completeness is ${scores.dataCompleteness}%.`;
  }

  return "High because roof age, leak status, visible condition inputs, and photos are available.";
}

export function analyzeRoofReadiness(input: RoofAssessmentInput): ReadinessReport {
  const scores = scoreRoofRisk(input);
  const recommendation = generateRecommendation(input, scores);

  return {
    generatedAt: new Date().toISOString(),
    assessmentMode: input.visionObservationUsed ? "vision-assisted" : "rule-based",
    scores,
    recommendation,
    keyObservations: buildKeyObservations(input, scores),
    roofRiskFactors: buildRoofRiskFactors(input, scores),
    solarReadinessFactors: buildSolarReadinessFactors(input, scores),
    questionsToAsk: buildQuestions(input, recommendation.status),
    suggestedTalkTrack: getTalkTrack(recommendation.status),
    repGuidance: getRepGuidance(recommendation.status),
    disclaimer:
      "This report is a pre-appointment readiness assessment based on uploaded photos and homeowner-provided information. It does not replace a licensed roofer, engineer, inspector, insurance adjuster, utility, or permitting authority.",
    leadQualityScore: scoreLeadQuality(input, scores)
  };
}

function buildKeyObservations(input: RoofAssessmentInput, scores: RoofRiskScores): string[] {
  const observations: string[] = [];

  observations.push(`${input.photos.length} roof photo${input.photos.length === 1 ? "" : "s"} uploaded.`);

  if (input.details.roofAgeYears === null) {
    observations.push("Roof age is unknown, which lowers confidence.");
  } else {
    observations.push(`Estimated roof age is ${input.details.roofAgeYears} years.`);
  }

  if (input.details.knownLeaks === "yes") {
    observations.push("Known leaks or water intrusion were reported.");
  } else if (input.details.knownLeaks === "no") {
    observations.push("No known leaks were reported.");
  } else {
    observations.push("Leak history is unknown and should be confirmed.");
  }

  if (scores.solarReadiness >= 72) {
    observations.push("Current inputs support a solar-first conversation, pending appointment confirmation.");
  } else if (scores.solarReadiness >= 45) {
    observations.push("Solar may still be viable, but roof scope should be clarified first.");
  } else {
    observations.push("Roof condition should be resolved before a solar-only proposal.");
  }

  return observations;
}

function buildRoofRiskFactors(input: RoofAssessmentInput, scores: RoofRiskScores): string[] {
  const factors: string[] = [];

  if (input.details.roofAgeYears === null) {
    factors.push("Unknown roof age increases uncertainty.");
  } else if (input.details.roofAgeYears >= 18) {
    factors.push("Roof age is near or beyond the typical planning window for solar installation.");
  } else if (input.details.roofAgeYears >= 11) {
    factors.push("Roof age is moderate and should be checked before final solar design.");
  } else {
    factors.push("Roof age appears favorable based on the estimate provided.");
  }

  input.details.visibleConditionFlags
    .filter((flag) => flag !== "no-obvious-damage")
    .forEach((flag) => factors.push(conditionFlagLabels[flag]));

  if (input.details.knownLeaks !== "no") {
    factors.push(input.details.knownLeaks === "yes" ? "Leak history needs roof-first attention." : "Leak history still needs to be confirmed.");
  }

  if (factors.length === 0 || scores.totalRisk < 25) {
    factors.push("No major roof risk signals were entered.");
  }

  return factors;
}

function buildSolarReadinessFactors(input: RoofAssessmentInput, scores: RoofRiskScores): string[] {
  const factors = [
    `Solar readiness score: ${scores.solarReadiness}/100.`,
    `Data completeness score: ${scores.dataCompleteness}/100.`
  ];

  if (input.details.utilityBillAvailable === "yes") {
    factors.push("Utility bill is available, which helps solar qualification.");
  } else if (input.details.utilityBillAvailable === "unknown") {
    factors.push("Utility bill status is unknown; collect it before savings or system-size claims.");
  } else {
    factors.push("Utility bill is not yet available; avoid precise solar savings claims.");
  }

  if (input.details.existingSolar === "yes") {
    factors.push("Existing solar is present; confirm roof access, panel removal requirements, and interconnection details.");
  }

  if (input.details.desiredOutcome === "roof-and-solar") {
    factors.push("Homeowner interest already supports a roof + solar bundle conversation.");
  }

  return factors;
}

function buildQuestions(input: RoofAssessmentInput, status: RecommendationStatus): string[] {
  const questions = [
    "Has the roof had any leaks, repairs, insurance claims, or storm damage in the last five years?",
    "Do you know the roof installation year, material, and warranty status?",
    "Are there attic, ceiling, or wall stains that were not included in the uploaded photos?"
  ];

  if (input.details.utilityBillAvailable !== "yes") {
    questions.push("Can we review a recent utility bill before estimating savings or system size?");
  }

  if (status === "replacement-first" || status === "repair-first") {
    questions.push("Would you prefer one coordinated roof + solar proposal or separate roof and solar options?");
  }

  if (status === "inspection-first") {
    questions.push("Can we schedule a roof inspection before presenting a solar proposal?");
  }

  return questions;
}

function getTalkTrack(status: RecommendationStatus): string {
  const tracks: Record<RecommendationStatus, string> = {
    "solar-ready":
      "The roof appears suitable for a solar-first conversation based on the information provided. We will still confirm roof condition during the appointment before final design.",
    "repair-first":
      "I want to make sure the roof details are handled before panels go on. A small roof tune-up now can reduce future service issues and improve confidence in the solar investment.",
    "replacement-first":
      "Before we talk panels, I want to make sure the roof underneath them is worth protecting. Installing solar on a roof near end-of-life can create avoidable future costs because panels may need to be removed and reinstalled if the roof fails.",
    "inspection-first":
      "The available information is not enough to make a confident recommendation. The next best step is an in-person roof inspection before presenting a solar proposal."
  };

  return tracks[status];
}

function getRepGuidance(status: RecommendationStatus): RepGuidance {
  const guidance: Record<RecommendationStatus, RepGuidance> = {
    "solar-ready": {
      openingAngle: "The roof inputs look favorable, so we can focus on solar fit and savings after a quick roof confirmation.",
      avoidSaying: "This roof is approved for solar.",
      recommendedNextStep: "Proceed with solar qualification and capture any final roof concerns during the appointment.",
      bundleOpportunity: "Offer optional maintenance or warranty review as a confidence builder.",
      objectionHandlingNotes: "If the homeowner worries about roof age, explain that final design should include roof confirmation before installation."
    },
    "repair-first": {
      openingAngle: "A few roof items may be worth correcting before panels are installed.",
      avoidSaying: "Your roof is bad.",
      recommendedNextStep: "Offer a tune-up inspection and a small repair scope before final solar design.",
      bundleOpportunity: "Position minor repairs as a way to protect the solar installation and reduce avoidable service calls.",
      objectionHandlingNotes: "Frame the tune-up as risk reduction, not a scare tactic or blocker."
    },
    "replacement-first": {
      openingAngle: "Before we talk panels, I want to make sure the roof underneath them is worth protecting.",
      avoidSaying: "Your roof is failing.",
      recommendedNextStep: "Offer roof inspection plus a roof/solar bundle quote.",
      bundleOpportunity: "Position roof replacement as a way to protect the solar investment and avoid panel removal/reinstall costs.",
      objectionHandlingNotes: "Use total project cost clarity: one coordinated scope can be cleaner than installing solar now and reroofing later."
    },
    "inspection-first": {
      openingAngle: "I do not want to guess from incomplete roof information.",
      avoidSaying: "We cannot help until you do more work.",
      recommendedNextStep: "Book an in-person roof inspection and request clearer roof and attic photos.",
      bundleOpportunity: "If inspection confirms roof age or wear, offer both roof-only and roof + solar paths.",
      objectionHandlingNotes: "Position the inspection as protecting the homeowner from a rushed or poorly sequenced quote."
    }
  };

  return guidance[status];
}

function scoreLeadQuality(input: RoofAssessmentInput, scores: RoofRiskScores): number {
  let score = 48;

  if (input.photos.length >= 4) score += 10;
  if (input.details.propertyAddress.trim()) score += 8;
  if (input.details.utilityBillAvailable === "yes") score += 10;
  if (input.details.desiredOutcome === "roof-and-solar") score += 12;
  if (input.details.desiredOutcome === "solar-only") score += 8;
  if (scores.dataCompleteness >= 75) score += 8;
  if (scores.totalRisk >= 45 && input.details.desiredOutcome !== "solar-only") score += 4;

  return clamp(score);
}

export function getUnsupportedFileReason(file: File): string | null {
  const supportedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  const supportedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
  const lowerName = file.name.toLowerCase();
  const hasSupportedExtension = supportedExtensions.some((extension) => lowerName.endsWith(extension));

  if (!supportedTypes.includes(file.type) && !hasSupportedExtension) {
    return "Unsupported file type. Upload JPG, PNG, WebP, HEIC, or HEIF images.";
  }

  if (file.size > 12 * 1024 * 1024) {
    return "File is over 12 MB. Use a smaller image or compressed photo.";
  }

  return null;
}

export function toUploadedPhoto(file: File): UploadedPhoto {
  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    previewUrl: URL.createObjectURL(file),
    sizeBytes: file.size,
    type: file.type || "image/unknown",
    lastModified: file.lastModified
  };
}

export function formatRecommendationStatus(status: RecommendationStatus): string {
  const labels: Record<RecommendationStatus, string> = {
    "solar-ready": "Solar-ready",
    "repair-first": "Repair first",
    "replacement-first": "Replacement first",
    "inspection-first": "Inspection first"
  };

  return labels[status];
}
