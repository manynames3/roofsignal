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

const roofPhotoAssets = {
  granuleWear: { fileName: "granule-wear-slope.jpg", sizeBytes: 172120 },
  liftedShingles: { fileName: "lifted-shingles-debris.jpg", sizeBytes: 447779 },
  peeledDecking: { fileName: "peeled-shingles-decking.jpg", sizeBytes: 210668 },
  nailPop: { fileName: "nail-pop-chalk.jpg", sizeBytes: 771159 },
  chimneyFlashing: { fileName: "chimney-flashing-damage.jpg", sizeBytes: 120597 },
  missingPatch: { fileName: "missing-shingle-patch.jpg", sizeBytes: 130366 }
} as const;

type RoofPhotoAssetKey = keyof typeof roofPhotoAssets;

function roofPhoto(id: string, assetKey: RoofPhotoAssetKey): UploadedPhoto {
  const asset = roofPhotoAssets[assetKey];

  return {
    id,
    fileName: asset.fileName,
    previewUrl: `/demo-roof-photos/${asset.fileName}`,
    sizeBytes: asset.sizeBytes,
    type: "image/jpeg",
    lastModified: DEMO_LAST_MODIFIED
  };
}

function evidence(
  photoId: string,
  assetKey: RoofPhotoAssetKey,
  caption: string,
  observations: VisibleConditionFlag[]
): PhotoEvidence {
  const asset = roofPhotoAssets[assetKey];

  return {
    photoId,
    fileName: asset.fileName,
    caption,
    observations,
    source: "demo"
  };
}

export const demoScenarios: DemoScenario[] = [
  {
    id: "solar-ready",
    label: "Solar-ready lead",
    summary: "Newer roof lead using the uploaded photo set, no reported leak history.",
    photos: [
      roofPhoto("demo-ready-1", "granuleWear"),
      roofPhoto("demo-ready-2", "missingPatch"),
      roofPhoto("demo-ready-3", "chimneyFlashing")
    ],
    photoEvidence: [
      evidence("demo-ready-1", "granuleWear", "Wide slope photo included for roof-plane context.", []),
      evidence("demo-ready-2", "missingPatch", "Ridge and slope photo included for appointment confirmation.", []),
      evidence("demo-ready-3", "chimneyFlashing", "Flashing-area photo included for final field confirmation.", [])
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
    summary: "Moderate age using uploaded photos with localized repair concerns.",
    photos: [
      roofPhoto("demo-repair-1", "nailPop"),
      roofPhoto("demo-repair-2", "chimneyFlashing"),
      roofPhoto("demo-repair-3", "missingPatch"),
      roofPhoto("demo-repair-4", "granuleWear")
    ],
    photoEvidence: [
      evidence("demo-repair-1", "nailPop", "Close-up photo shows a nail pop or puncture that should be corrected before solar.", ["damaged-flashing-or-penetrations"]),
      evidence("demo-repair-2", "chimneyFlashing", "Chimney flashing area should be reviewed before final solar design.", ["damaged-flashing-or-penetrations"]),
      evidence("demo-repair-3", "missingPatch", "Localized missing-shingle or patch area should be addressed before panels go on.", ["missing-or-damaged-shingles"]),
      evidence("demo-repair-4", "granuleWear", "Wide slope photo provides broader roof context for the appointment.", [])
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
      visibleConditionFlags: [
        "damaged-flashing-or-penetrations",
        "missing-or-damaged-shingles",
        "valley-or-gutter-wear"
      ]
    }
  },
  {
    id: "replacement-first",
    label: "Replacement-first bundle",
    summary:
      "Older roof with lifted shingles, exposed decking, a nail pop, damaged flashing, and prior patching.",
    photos: [
      roofPhoto("demo-replace-1", "granuleWear"),
      roofPhoto("demo-replace-2", "liftedShingles"),
      roofPhoto("demo-replace-3", "peeledDecking"),
      roofPhoto("demo-replace-4", "nailPop"),
      roofPhoto("demo-replace-5", "chimneyFlashing"),
      roofPhoto("demo-replace-6", "missingPatch")
    ],
    photoEvidence: [
      evidence("demo-replace-1", "granuleWear", "Aged asphalt shingles show surface wear and dark bare-looking areas.", ["granule-loss-or-bare-spots"]),
      evidence("demo-replace-2", "liftedShingles", "Multiple lifted shingles and debris are visible across the slope.", ["curling-or-lifted-shingles", "missing-or-damaged-shingles"]),
      evidence("demo-replace-3", "peeledDecking", "Roof edge shows peeled-back shingles with exposed underlayment or decking.", ["missing-or-damaged-shingles", "valley-or-gutter-wear"]),
      evidence("demo-replace-4", "nailPop", "Close-up photo documents a nail pop or puncture marked for review.", ["damaged-flashing-or-penetrations"]),
      evidence("demo-replace-5", "chimneyFlashing", "Chimney area shows flashing and shingle interface concerns.", ["damaged-flashing-or-penetrations"]),
      evidence("demo-replace-6", "missingPatch", "Patch or missing-shingle area near the ridge should be inspected before solar quoting.", ["missing-or-damaged-shingles"])
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
