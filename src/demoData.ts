import type { PropertyDetails, UploadedPhoto } from "./types/roof";

export interface DemoScenario {
  id: string;
  label: string;
  summary: string;
  details: PropertyDetails;
  photos: UploadedPhoto[];
}

function demoPhoto(id: string, fileName: string, label: string, accent: string): UploadedPhoto {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#edf4ee"/><path d="M24 284 236 124l184 160Z" fill="#9fb8ad"/><path d="M196 284 418 104l198 180Z" fill="#789f92"/><path d="M64 284h520v136H64z" fill="#fffaf0"/><path d="M170 210h190v18H170zm-28 36h246v18H142zm-32 36h314v18H110z" fill="${accent}"/><text x="40" y="62" font-family="Arial" font-size="26" font-weight="700" fill="#18211d">${label}</text></svg>`;

  return {
    id,
    fileName,
    previewUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    sizeBytes: 184000,
    type: "image/jpeg",
    lastModified: Date.now()
  };
}

export const demoScenarios: DemoScenario[] = [
  {
    id: "solar-ready",
    label: "Solar-ready lead",
    summary: "Newer roof, clear photos, no leak history.",
    photos: [
      demoPhoto("demo-ready-1", "front-slope.jpg", "Wide front slope", "#0e7a4f"),
      demoPhoto("demo-ready-2", "rear-slope.jpg", "Rear slope", "#177e89"),
      demoPhoto("demo-ready-3", "gutters.jpg", "Gutter edge", "#0e7a4f"),
      demoPhoto("demo-ready-4", "flashing.jpg", "Flashing view", "#177e89")
    ],
    details: {
      homeownerName: "Maya Carter",
      propertyAddress: "1840 Ridgeview Lane",
      roofAgeYears: 6,
      roofMaterial: "asphalt-shingle",
      knownLeaks: "no",
      existingSolar: "no",
      utilityBillAvailable: "yes",
      desiredOutcome: "solar-only",
      repNotes: "Homeowner wants solar first and has a current utility bill ready.",
      visibleConditionFlags: ["no-obvious-damage"]
    }
  },
  {
    id: "repair-first",
    label: "Tune-up before solar",
    summary: "Moderate age with flashing and gutter concerns.",
    photos: [
      demoPhoto("demo-repair-1", "valley-wear.jpg", "Valley wear", "#b7791f"),
      demoPhoto("demo-repair-2", "flashing-detail.jpg", "Flashing detail", "#b7791f"),
      demoPhoto("demo-repair-3", "wide-exterior.jpg", "Wide exterior", "#177e89")
    ],
    details: {
      homeownerName: "Jordan Lee",
      propertyAddress: "742 Oak Ridge Dr",
      roofAgeYears: 13,
      roofMaterial: "asphalt-shingle",
      knownLeaks: "no",
      existingSolar: "no",
      utilityBillAvailable: "yes",
      desiredOutcome: "roof-and-solar",
      repNotes: "Homeowner is open to roof corrections if they protect the solar installation.",
      visibleConditionFlags: ["damaged-flashing-or-penetrations", "valley-or-gutter-wear"]
    }
  },
  {
    id: "replacement-first",
    label: "Replacement-first bundle",
    summary: "Older roof, visible wear, and leak history.",
    photos: [
      demoPhoto("demo-replace-1", "curling-shingles.jpg", "Curling shingles", "#b13d37"),
      demoPhoto("demo-replace-2", "interior-stain.jpg", "Ceiling stain", "#b13d37"),
      demoPhoto("demo-replace-3", "granule-loss.jpg", "Granule loss", "#b7791f")
    ],
    details: {
      homeownerName: "Sam Rivera",
      propertyAddress: "29 Cedar Point Road",
      roofAgeYears: 23,
      roofMaterial: "asphalt-shingle",
      knownLeaks: "yes",
      existingSolar: "no",
      utilityBillAvailable: "yes",
      desiredOutcome: "roof-and-solar",
      repNotes: "Homeowner mentioned water staining near rear bedroom after heavy rain.",
      visibleConditionFlags: [
        "curling-or-lifted-shingles",
        "granule-loss-or-bare-spots",
        "interior-staining"
      ]
    }
  }
];
