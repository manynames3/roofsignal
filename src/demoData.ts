import type { PhotoEvidence, PropertyDetails, UploadedPhoto, VisibleConditionFlag } from "./types/roof";

export interface DemoScenario {
  id: string;
  label: string;
  summary: string;
  details: PropertyDetails;
  photos: UploadedPhoto[];
  photoEvidence: PhotoEvidence[];
}

const DEMO_LAST_MODIFIED = new Date("2026-05-20T00:00:00.000Z").getTime();

function demoPhoto(id: string, fileName: string, label: string, accent: string): UploadedPhoto {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#edf4ee"/><path d="M24 284 236 124l184 160Z" fill="#9fb8ad"/><path d="M196 284 418 104l198 180Z" fill="#789f92"/><path d="M64 284h520v136H64z" fill="#fffaf0"/><path d="M170 210h190v18H170zm-28 36h246v18H142zm-32 36h314v18H110z" fill="${accent}"/><text x="40" y="62" font-family="Arial" font-size="26" font-weight="700" fill="#18211d">${label}</text></svg>`;

  return {
    id,
    fileName,
    previewUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    sizeBytes: 184000,
    type: "image/jpeg",
    lastModified: DEMO_LAST_MODIFIED
  };
}

function roofDamagePhoto(id: string, fileName: string, sizeBytes: number): UploadedPhoto {
  return {
    id,
    fileName,
    previewUrl: `/demo-roof-photos/${fileName}`,
    sizeBytes,
    type: "image/jpeg",
    lastModified: DEMO_LAST_MODIFIED
  };
}

function evidence(
  photoId: string,
  fileName: string,
  caption: string,
  observations: VisibleConditionFlag[]
): PhotoEvidence {
  return {
    photoId,
    fileName,
    caption,
    observations,
    source: "demo"
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
    photoEvidence: [
      evidence("demo-ready-1", "front-slope.jpg", "Wide front slope with no obvious damage in the sample photo.", ["no-obvious-damage"]),
      evidence("demo-ready-2", "rear-slope.jpg", "Rear slope appears clean enough for a solar-first discussion.", ["no-obvious-damage"]),
      evidence("demo-ready-3", "gutters.jpg", "Gutter edge included to document roof perimeter context.", ["no-obvious-damage"]),
      evidence("demo-ready-4", "flashing.jpg", "Flashing view included for appointment confirmation.", ["no-obvious-damage"])
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
    photoEvidence: [
      evidence("demo-repair-1", "valley-wear.jpg", "Valley area shows wear that should be checked before final solar design.", ["valley-or-gutter-wear"]),
      evidence("demo-repair-2", "flashing-detail.jpg", "Flashing detail needs roofer review before panels are installed.", ["damaged-flashing-or-penetrations"]),
      evidence("demo-repair-3", "wide-exterior.jpg", "Wide exterior shot provides roof-plane context for the appointment.", [])
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
    summary:
      "Older roof with lifted shingles, exposed decking, a nail pop, damaged flashing, and prior patching.",
    photos: [
      roofDamagePhoto("demo-replace-1", "granule-wear-slope.jpg", 172120),
      roofDamagePhoto("demo-replace-2", "lifted-shingles-debris.jpg", 447779),
      roofDamagePhoto("demo-replace-3", "peeled-shingles-decking.jpg", 210668),
      roofDamagePhoto("demo-replace-4", "nail-pop-chalk.jpg", 771159),
      roofDamagePhoto("demo-replace-5", "chimney-flashing-damage.jpg", 120597),
      roofDamagePhoto("demo-replace-6", "missing-shingle-patch.jpg", 130366)
    ],
    photoEvidence: [
      evidence("demo-replace-1", "granule-wear-slope.jpg", "Aged asphalt shingles show surface wear and dark bare-looking areas.", ["granule-loss-or-bare-spots"]),
      evidence("demo-replace-2", "lifted-shingles-debris.jpg", "Multiple lifted shingles and debris are visible across the slope.", ["curling-or-lifted-shingles", "missing-or-damaged-shingles"]),
      evidence("demo-replace-3", "peeled-shingles-decking.jpg", "Roof edge shows peeled-back shingles with exposed underlayment or decking.", ["missing-or-damaged-shingles", "valley-or-gutter-wear"]),
      evidence("demo-replace-4", "nail-pop-chalk.jpg", "Close-up photo documents a nail pop or puncture marked for review.", ["damaged-flashing-or-penetrations"]),
      evidence("demo-replace-5", "chimney-flashing-damage.jpg", "Chimney area shows flashing and shingle interface concerns.", ["damaged-flashing-or-penetrations"]),
      evidence("demo-replace-6", "missing-shingle-patch.jpg", "Patch or missing-shingle area near the ridge should be inspected before solar quoting.", ["missing-or-damaged-shingles"])
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
      repNotes:
        "Photo set shows lifted shingles, exposed decking at the eave, a nail pop, damaged chimney flashing, and a prior patch or missing-shingle area. Homeowner mentioned water staining near the rear bedroom after heavy rain.",
      visibleConditionFlags: [
        "curling-or-lifted-shingles",
        "missing-or-damaged-shingles",
        "granule-loss-or-bare-spots",
        "damaged-flashing-or-penetrations",
        "valley-or-gutter-wear"
      ]
    }
  }
];
