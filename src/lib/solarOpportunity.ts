import type {
  ConfidenceLevel,
  PropertyDetails,
  RoofOrientation,
  ShadeLevel,
  SolarGeocodeResult,
  SolarOpportunityAssumptions,
  SolarOpportunityEstimate
} from "../types/roof";

const PANEL_AREA_SQFT = 21.5;
const DEFAULT_PANEL_WATTAGE = 410;
const LOCAL_KWH_PER_KW_YEAR = 1250;
const SOLAR_API_TIMEOUT_MS = 5500;

const monthlyProductionShape = [0.065, 0.073, 0.087, 0.095, 0.102, 0.104, 0.104, 0.096, 0.087, 0.076, 0.059, 0.052];

export const roofOrientationLabels: Record<RoofOrientation, string> = {
  south: "South",
  "south-east": "Southeast",
  "south-west": "Southwest",
  east: "East",
  west: "West",
  north: "North",
  unknown: "Unknown"
};

export const shadeLevelLabels: Record<ShadeLevel, string> = {
  low: "Low shade",
  moderate: "Moderate shade",
  heavy: "Heavy shade",
  unknown: "Unknown shade"
};

const orientationAzimuth: Record<RoofOrientation, number | null> = {
  south: 180,
  "south-east": 135,
  "south-west": 225,
  east: 90,
  west: 270,
  north: 0,
  unknown: null
};

const orientationFactor: Record<RoofOrientation, number> = {
  south: 1,
  "south-east": 0.94,
  "south-west": 0.94,
  east: 0.84,
  west: 0.84,
  north: 0.55,
  unknown: 0.82
};

const shadeFactor: Record<ShadeLevel, number> = {
  low: 1,
  moderate: 0.82,
  heavy: 0.58,
  unknown: 0.85
};

export const defaultSolarAssumptions: SolarOpportunityAssumptions = {
  usableRoofAreaSqft: 520,
  roofOrientation: "south-west",
  roofPitchDegrees: 24,
  panelWattage: DEFAULT_PANEL_WATTAGE,
  shadeLevel: "moderate"
};

interface PvWattsResponse {
  outputs?: {
    ac_annual?: number;
    ac_monthly?: number[];
    solrad_annual?: number;
    capacity_factor?: number;
  };
  errors?: string[];
}

export function isPvWattsConfigured(): boolean {
  return Boolean(import.meta.env.VITE_NREL_API_KEY?.trim());
}

export function estimateSolarOpportunity(
  details: PropertyDetails,
  assumptions: SolarOpportunityAssumptions,
  geocode: SolarGeocodeResult = { provider: "us-census", status: "not-found" }
): SolarOpportunityEstimate {
  const system = estimateSystemCapacity(assumptions);
  const localAnnualProduction =
    system.systemCapacityKw === null
      ? null
      : Math.round(
          system.systemCapacityKw *
            LOCAL_KWH_PER_KW_YEAR *
            orientationFactor[assumptions.roofOrientation] *
            shadeFactor[assumptions.shadeLevel]
        );

  return buildSolarOpportunityEstimate({
    details,
    assumptions,
    geocode,
    source: "local-assumption",
    annualProductionKwh: localAnnualProduction,
    monthlyProductionKwh: distributeMonthlyProduction(localAnnualProduction),
    sunHoursPerDay: null,
    capacityFactorPercent: null
  });
}

export async function analyzeSolarOpportunity(
  details: PropertyDetails,
  assumptions: SolarOpportunityAssumptions
): Promise<SolarOpportunityEstimate> {
  const geocode = await geocodeAddress(details.propertyAddress);
  const localEstimate = estimateSolarOpportunity(details, assumptions, geocode);

  if (!isPvWattsConfigured() || geocode.status !== "matched" || !geocode.latitude || !geocode.longitude) {
    return localEstimate;
  }

  const system = estimateSystemCapacity(assumptions);
  const azimuth = orientationAzimuth[assumptions.roofOrientation];

  if (!system.systemCapacityKw || azimuth === null) {
    return localEstimate;
  }

  try {
    const pvWatts = await fetchPvWatts({
      latitude: geocode.latitude,
      longitude: geocode.longitude,
      systemCapacityKw: system.systemCapacityKw,
      azimuth,
      tilt: assumptions.roofPitchDegrees ?? 20
    });

    if (!pvWatts.outputs?.ac_annual) {
      return {
        ...localEstimate,
        warnings: [
          ...localEstimate.warnings,
          ...(pvWatts.errors?.length ? pvWatts.errors : ["NREL PVWatts did not return production data."])
        ]
      };
    }

    return buildSolarOpportunityEstimate({
      details,
      assumptions,
      geocode,
      source: "nrel-pvwatts",
      annualProductionKwh: Math.round(pvWatts.outputs.ac_annual),
      monthlyProductionKwh: (pvWatts.outputs.ac_monthly ?? []).map((value) => Math.round(value)),
      sunHoursPerDay: pvWatts.outputs.solrad_annual ?? null,
      capacityFactorPercent: pvWatts.outputs.capacity_factor ? Math.round(pvWatts.outputs.capacity_factor * 10) / 10 : null
    });
  } catch (error) {
    return {
      ...localEstimate,
      warnings: [...localEstimate.warnings, getErrorMessage(error, "NREL PVWatts estimate failed; using local assumptions.")]
    };
  }
}

function estimateSystemCapacity(assumptions: SolarOpportunityAssumptions) {
  if (!assumptions.usableRoofAreaSqft || assumptions.usableRoofAreaSqft <= 0 || assumptions.panelWattage <= 0) {
    return {
      panelCount: null,
      systemCapacityKw: null,
      estimatedDcWatts: null
    };
  }

  const panelCount = Math.max(1, Math.floor(assumptions.usableRoofAreaSqft / PANEL_AREA_SQFT));
  const estimatedDcWatts = panelCount * assumptions.panelWattage;

  return {
    panelCount,
    systemCapacityKw: Math.round((estimatedDcWatts / 1000) * 10) / 10,
    estimatedDcWatts
  };
}

function buildSolarOpportunityEstimate({
  details,
  assumptions,
  geocode,
  source,
  annualProductionKwh,
  monthlyProductionKwh,
  sunHoursPerDay,
  capacityFactorPercent
}: {
  details: PropertyDetails;
  assumptions: SolarOpportunityAssumptions;
  geocode: SolarGeocodeResult;
  source: "local-assumption" | "nrel-pvwatts";
  annualProductionKwh: number | null;
  monthlyProductionKwh: number[];
  sunHoursPerDay: number | null;
  capacityFactorPercent: number | null;
}): SolarOpportunityEstimate {
  const system = estimateSystemCapacity(assumptions);
  const warnings = getSolarWarnings(details, assumptions, geocode, source);
  const confidence = getSolarConfidence(assumptions, geocode, source);

  return {
    source,
    geocode,
    solarScore: scoreSolarOpportunity(assumptions, source, geocode, annualProductionKwh, system.systemCapacityKw),
    confidence,
    confidenceRationale: getSolarConfidenceRationale(confidence, source, geocode, assumptions),
    usableRoofAreaSqft: assumptions.usableRoofAreaSqft,
    panelCount: system.panelCount,
    systemCapacityKw: system.systemCapacityKw,
    estimatedDcWatts: system.estimatedDcWatts,
    annualProductionKwh,
    monthlyProductionKwh,
    roofOrientation: assumptions.roofOrientation,
    roofPitchDegrees: assumptions.roofPitchDegrees,
    shadeLevel: assumptions.shadeLevel,
    sunHoursPerDay,
    capacityFactorPercent,
    assumptions: getSolarAssumptionNotes(assumptions, source),
    warnings
  };
}

async function geocodeAddress(address: string): Promise<SolarGeocodeResult> {
  if (!address.trim()) {
    return { provider: "us-census", status: "not-found", message: "Property address is missing." };
  }

  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  try {
    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) {
      return { provider: "us-census", status: "error", message: `U.S. Census geocoder returned ${response.status}.` };
    }

    const payload = await response.json() as {
      result?: {
        addressMatches?: Array<{
          matchedAddress?: string;
          coordinates?: {
            x?: number;
            y?: number;
          };
        }>;
      };
    };
    const match = payload.result?.addressMatches?.[0];

    if (!match?.coordinates?.x || !match.coordinates.y) {
      return { provider: "us-census", status: "not-found", message: "Address could not be geocoded." };
    }

    return {
      provider: "us-census",
      status: "matched",
      matchedAddress: match.matchedAddress,
      latitude: match.coordinates.y,
      longitude: match.coordinates.x
    };
  } catch (error) {
    return { provider: "us-census", status: "error", message: getErrorMessage(error, "Address geocoding failed.") };
  }
}

async function fetchPvWatts({
  latitude,
  longitude,
  systemCapacityKw,
  azimuth,
  tilt
}: {
  latitude: number;
  longitude: number;
  systemCapacityKw: number;
  azimuth: number;
  tilt: number;
}): Promise<PvWattsResponse> {
  const url = new URL("https://developer.nrel.gov/api/pvwatts/v8.json");
  url.searchParams.set("api_key", import.meta.env.VITE_NREL_API_KEY);
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("system_capacity", String(systemCapacityKw));
  url.searchParams.set("azimuth", String(azimuth));
  url.searchParams.set("tilt", String(tilt));
  url.searchParams.set("array_type", "1");
  url.searchParams.set("module_type", "0");
  url.searchParams.set("losses", "14");
  url.searchParams.set("timeframe", "monthly");

  const response = await fetchWithTimeout(url.toString());
  if (!response.ok) throw new Error(`NREL PVWatts returned ${response.status}.`);
  return response.json() as Promise<PvWattsResponse>;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), SOLAR_API_TIMEOUT_MS);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function distributeMonthlyProduction(annualProductionKwh: number | null): number[] {
  if (annualProductionKwh === null) return [];
  return monthlyProductionShape.map((share) => Math.round(annualProductionKwh * share));
}

function scoreSolarOpportunity(
  assumptions: SolarOpportunityAssumptions,
  source: "local-assumption" | "nrel-pvwatts",
  geocode: SolarGeocodeResult,
  annualProductionKwh: number | null,
  systemCapacityKw: number | null
): number {
  let score = 42;

  score += orientationFactor[assumptions.roofOrientation] * 25;
  score += shadeFactor[assumptions.shadeLevel] * 18;
  if (source === "nrel-pvwatts") score += 8;
  if (geocode.status === "matched") score += 5;
  if (annualProductionKwh && systemCapacityKw) {
    const kwhPerKw = annualProductionKwh / systemCapacityKw;
    if (kwhPerKw >= 1450) score += 8;
    else if (kwhPerKw >= 1200) score += 4;
  }
  if (!assumptions.usableRoofAreaSqft) score -= 22;
  if (assumptions.roofOrientation === "unknown") score -= 14;
  if (assumptions.shadeLevel === "unknown") score -= 8;
  if (assumptions.roofOrientation === "north") score -= 18;
  if (assumptions.shadeLevel === "heavy") score -= 16;

  return Math.min(100, Math.max(0, Math.round(score)));
}

function getSolarConfidence(
  assumptions: SolarOpportunityAssumptions,
  geocode: SolarGeocodeResult,
  source: "local-assumption" | "nrel-pvwatts"
): ConfidenceLevel {
  if (!assumptions.usableRoofAreaSqft || assumptions.roofOrientation === "unknown") return "low";
  if (source === "nrel-pvwatts" && geocode.status === "matched" && assumptions.shadeLevel !== "unknown") return "high";
  return "medium";
}

function getSolarConfidenceRationale(
  confidence: ConfidenceLevel,
  source: "local-assumption" | "nrel-pvwatts",
  geocode: SolarGeocodeResult,
  assumptions: SolarOpportunityAssumptions
): string {
  if (confidence === "low") {
    return "Low because usable roof area or roof direction still needs confirmation.";
  }

  if (confidence === "medium") {
    return source === "nrel-pvwatts" && geocode.status === "matched"
      ? "Medium because production uses address-level solar data, but roof area and shading are still rep-entered assumptions."
      : "Medium because the estimate uses rep-entered roof assumptions and a local production model.";
  }

  return "High for pre-appointment triage because address-level PVWatts data and key roof assumptions are available.";
}

function getSolarAssumptionNotes(
  assumptions: SolarOpportunityAssumptions,
  source: "local-assumption" | "nrel-pvwatts"
): string[] {
  return [
    `Usable roof area entered: ${assumptions.usableRoofAreaSqft ? `${assumptions.usableRoofAreaSqft} sq ft` : "not provided"}.`,
    `Primary solar roof direction: ${roofOrientationLabels[assumptions.roofOrientation]}.`,
    `Roof pitch assumption: ${assumptions.roofPitchDegrees ?? 20} degrees.`,
    `Panel wattage assumption: ${assumptions.panelWattage} W.`,
    `Shade assumption: ${shadeLevelLabels[assumptions.shadeLevel]}.`,
    source === "nrel-pvwatts"
      ? "Production estimate uses NREL PVWatts with address coordinates."
      : "Production estimate uses a local fallback model until NREL PVWatts is configured or address geocoding succeeds."
  ];
}

function getSolarWarnings(
  details: PropertyDetails,
  assumptions: SolarOpportunityAssumptions,
  geocode: SolarGeocodeResult,
  source: "local-assumption" | "nrel-pvwatts"
): string[] {
  const warnings: string[] = [];

  if (!details.propertyAddress.trim()) warnings.push("Add a property address to enable address-level solar data.");
  if (geocode.status !== "matched") warnings.push(geocode.message ?? "Address coordinates were not available.");
  if (source === "local-assumption") warnings.push("NREL PVWatts is not active for this estimate; production is approximate.");
  if (!assumptions.usableRoofAreaSqft) warnings.push("Usable roof area is missing, so system size and production cannot be estimated.");
  if (assumptions.roofOrientation === "unknown") warnings.push("Roof direction is unknown; ask the rep to confirm the primary solar-facing plane.");
  if (assumptions.shadeLevel === "unknown") warnings.push("Shade has not been confirmed from site conditions.");
  if (assumptions.roofOrientation === "north") warnings.push("North-facing roof planes usually reduce solar production.");
  if (assumptions.shadeLevel === "heavy") warnings.push("Heavy shade may materially reduce production and should be reviewed on site.");

  return warnings;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
