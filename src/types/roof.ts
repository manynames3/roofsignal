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

export type RoofOrientation =
  | "south"
  | "south-east"
  | "south-west"
  | "east"
  | "west"
  | "north"
  | "unknown";

export type ShadeLevel = "low" | "moderate" | "heavy" | "unknown";

export type SolarEstimateSource = "local-assumption" | "nrel-pvwatts";

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
  storageKey?: string;
  caption: string;
  observations: VisibleConditionFlag[];
  source: PhotoEvidenceSource;
}

export type PhotoRiskLevel = "clear" | "monitor" | "repair-review" | "inspection-review";

export interface PhotoEvidenceAnalysis {
  photoId: string;
  fileName: string;
  caption: string;
  observations: VisibleConditionFlag[];
  source: PhotoEvidenceSource;
  riskLevel: PhotoRiskLevel;
  riskScore: number;
  summary: string;
  reportImpact: string;
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

export interface SolarOpportunityAssumptions {
  usableRoofAreaSqft: number | null;
  roofOrientation: RoofOrientation;
  roofPitchDegrees: number | null;
  panelWattage: number;
  shadeLevel: ShadeLevel;
}

export interface SolarGeocodeResult {
  provider: "us-census";
  status: "matched" | "not-found" | "error";
  matchedAddress?: string;
  latitude?: number;
  longitude?: number;
  message?: string;
}

export interface SolarOpportunityEstimate {
  source: SolarEstimateSource;
  geocode: SolarGeocodeResult;
  solarScore: number;
  confidence: ConfidenceLevel;
  confidenceRationale: string;
  usableRoofAreaSqft: number | null;
  panelCount: number | null;
  systemCapacityKw: number | null;
  estimatedDcWatts: number | null;
  annualProductionKwh: number | null;
  monthlyProductionKwh: number[];
  roofOrientation: RoofOrientation;
  roofPitchDegrees: number | null;
  shadeLevel: ShadeLevel;
  sunHoursPerDay: number | null;
  capacityFactorPercent: number | null;
  assumptions: string[];
  warnings: string[];
}

export interface RoofAssessmentInput {
  photos: UploadedPhoto[];
  details: PropertyDetails;
  photoEvidence?: PhotoEvidence[];
  solarOpportunity?: SolarOpportunityEstimate;
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
  photoAnalysis: PhotoEvidenceAnalysis[];
  analysisTrace: AnalysisTraceItem[];
  solarOpportunity?: SolarOpportunityEstimate;
  suggestedTalkTrack: string;
  disclaimer: string;
  leadQualityScore: number;
}

export interface AnalysisTraceItem {
  label: string;
  source: string;
  detail: string;
}

export interface CompanyProfile {
  companyName: string;
  repName: string;
  phone: string;
  email: string;
  licenseNote: string;
}

export interface ReportAuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
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
  auditTrail?: ReportAuditEvent[];
}
