export type KnownStatus = "yes" | "no" | "unknown";

export type DesiredOutcome = "solar-only" | "roof-only" | "roof-and-solar" | "unknown";

export type RoofMaterial =
  | "asphalt-shingle"
  | "metal"
  | "tile"
  | "flat-membrane"
  | "wood-shake"
  | "unknown";

export type VisibleConditionFlag =
  | "no-obvious-damage"
  | "curling-or-lifted-shingles"
  | "missing-or-damaged-shingles"
  | "granule-loss-or-bare-spots"
  | "damaged-flashing-or-penetrations"
  | "valley-or-gutter-wear"
  | "sagging-or-soft-decking"
  | "interior-staining"
  | "limited-or-unclear-photos";

export type RecommendationStatus =
  | "solar-ready"
  | "repair-first"
  | "replacement-first"
  | "inspection-first";

export type ConfidenceLevel = "low" | "medium" | "high";

export interface UploadedPhoto {
  id: string;
  fileName: string;
  previewUrl: string;
  sizeBytes: number;
  type: string;
  lastModified: number;
}

export type PhotoEvidenceSource = "rep-entered" | "demo" | "vision-suggested";

export interface PhotoEvidence {
  photoId: string;
  fileName: string;
  previewUrl?: string;
  caption: string;
  observations: VisibleConditionFlag[];
  source: PhotoEvidenceSource;
}

export interface PropertyDetails {
  homeownerName: string;
  propertyAddress: string;
  roofAgeYears: number | null;
  roofMaterial: RoofMaterial;
  knownLeaks: KnownStatus;
  existingSolar: KnownStatus;
  utilityBillAvailable: KnownStatus;
  desiredOutcome: DesiredOutcome;
  repNotes: string;
  visibleConditionFlags: VisibleConditionFlag[];
}

export interface RoofAssessmentInput {
  photos: UploadedPhoto[];
  details: PropertyDetails;
  photoEvidence?: PhotoEvidence[];
  visionConfigured?: boolean;
  visionObservationUsed?: boolean;
}

export interface RoofRiskScores {
  roofAgeRisk: number;
  visibleConditionRisk: number;
  leakRisk: number;
  solarReadiness: number;
  urgency: number;
  dataCompleteness: number;
  totalRisk: number;
}

export interface RoofRecommendation {
  status: RecommendationStatus;
  label: string;
  recommendedSalesPath: string;
  confidence: ConfidenceLevel;
  confidenceRationale: string;
  nextBestAction: string;
}

export interface ReadinessReport {
  generatedAt: string;
  assessmentMode: "rule-based" | "vision-assisted";
  scores: RoofRiskScores;
  recommendation: RoofRecommendation;
  keyObservations: string[];
  roofRiskFactors: string[];
  solarReadinessFactors: string[];
  questionsToAsk: string[];
  photoEvidence: PhotoEvidence[];
  suggestedTalkTrack: string;
  disclaimer: string;
  leadQualityScore: number;
}

export interface CompanyProfile {
  companyName: string;
  repName: string;
  phone: string;
  email: string;
  licenseNote: string;
}

export interface SavedReadinessReport {
  id: string;
  title: string;
  createdAt: string;
  details: PropertyDetails;
  report: ReadinessReport;
  company: CompanyProfile;
  photoCount: number;
  photoNames: string[];
}
