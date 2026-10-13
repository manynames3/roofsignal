import { ChangeEvent, CSSProperties, DragEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  FileText,
  FileDown,
  FolderOpen,
  ImagePlus,
  Info,
  Loader2,
  Menu,
  LockKeyhole,
  Printer,
  RotateCcw,
  Save,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { Brand } from "./components/Brand";
import { useInView } from "./components/motion";
import { demoScenarios, type DemoScenario } from "./demoData";
import { csvCell } from "./lib/csv";
import { assessSample, parseSampleInputs, sampleReportUrl, type SampleInputs } from "./lib/sampleAssessment";
import {
  attachAwsPhotoStorage,
  clearAwsAuthSession,
  consumeAuthSessionFromUrl,
  createAwsReport,
  createAwsShareLink,
  deleteAwsReport,
  downloadCsv,
  getAwsCrmExport,
  getAwsLoginUrl,
  getAwsLogoutUrl,
  getAwsReport,
  getSharedAwsReport,
  isAwsBackendConfigured,
  listAwsReports,
  requestAwsPhotoEvidenceSuggestions,
  requestAwsSolarEstimate,
  submitAccessRequest,
  type AccessRequestInput,
  type AwsAuthSession
} from "./lib/awsBackend";
import { requestGeminiPhotoEvidenceSuggestions } from "./lib/geminiPhotoEvidenceClient";
import {
  analyzeRoofReadiness,
  conditionFlagLabels,
  desiredOutcomeLabels,
  emptyPropertyDetails,
  formatRecommendationStatus,
  getUnsupportedFileReason,
  roofMaterialLabels,
  toUploadedPhoto
} from "./lib/roofReadiness";
import {
  analyzeSolarOpportunity,
  defaultSolarAssumptions,
  estimateSolarOpportunity,
  isPvWattsConfigured,
  roofOrientationLabels,
  shadeLevelLabels
} from "./lib/solarOpportunity";
import {
  defaultCompanyProfile,
  deleteReport,
  findSavedReport,
  loadCompanyProfile,
  loadSavedReports,
  saveCompanyProfile,
  saveReport
} from "./lib/storage";
import { isVisionAnalysisConfigured } from "./lib/visionAnalysisProvider";
import type { VisionPhotoEvidenceSuggestion } from "./lib/visionAnalysisProvider";
import type {
  CompanyProfile,
  KnownStatus,
  PhotoEvidence,
  PhotoEvidenceAnalysis,
  PhotoRiskLevel,
  PropertyDetails,
  ReadinessReport,
  RecommendationStatus,
  ReportAuditEvent,
  RoofOrientation,
  RoofRiskScores,
  SavedReadinessReport,
  ShadeLevel,
  SolarOpportunityAssumptions,
  SolarOpportunityEstimate,
  UploadedPhoto,
  VisibleConditionFlag
} from "./types/roof";

type Notice = { type: "success" | "warning" | "error"; message: string } | null;

const conditionOptions: VisibleConditionFlag[] = [
  "no-obvious-damage",
  "curling-or-lifted-shingles",
  "missing-or-damaged-shingles",
  "granule-loss-or-bare-spots",
  "damaged-flashing-or-penetrations",
  "valley-or-gutter-wear",
  "sagging-or-soft-decking",
  "interior-staining",
  "limited-or-unclear-photos"
];

const photoTagLabels: Record<VisibleConditionFlag, string> = {
  "no-obvious-damage": "No obvious damage",
  "curling-or-lifted-shingles": "Lifted/curling",
  "missing-or-damaged-shingles": "Missing/damaged",
  "granule-loss-or-bare-spots": "Granule loss",
  "damaged-flashing-or-penetrations": "Flashing/penetration",
  "valley-or-gutter-wear": "Valley/gutter wear",
  "sagging-or-soft-decking": "Decking concern",
  "interior-staining": "Interior stain",
  "limited-or-unclear-photos": "Limited/unclear"
};

const photoRiskLabels: Record<PhotoRiskLevel, string> = {
  clear: "Clear",
  monitor: "Monitor",
  "repair-review": "Repair review",
  "inspection-review": "Inspection review"
};

const statusTheme: Record<RecommendationStatus, { tone: string; icon: ReactNode }> = {
  "solar-ready": { tone: "success", icon: <CheckCircle2 size={18} /> },
  "repair-first": { tone: "warning", icon: <ShieldCheck size={18} /> },
  "replacement-first": { tone: "danger", icon: <AlertTriangle size={18} /> },
  "inspection-first": { tone: "neutral", icon: <Info size={18} /> }
};

const defaultDemoScenarioId = "replacement-first";

const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const guidedDemoCompanyProfile: CompanyProfile = {
  companyName: "Northstar Roof + Solar",
  repName: "Alex Morgan",
  phone: "(555) 014-2091",
  email: "alex@example.com",
  licenseNote: "Pre-appointment triage only. Final scope requires qualified roof review."
};

function App() {
  if (window.location.pathname.startsWith("/app")) {
    return <ReadinessApp />;
  }

  return <LandingPage />;
}

interface SampleCase {
  scenario: DemoScenario;
  report: ReadinessReport;
}

let sampleCaseCache: SampleCase | null = null;

function getSampleCase(): SampleCase {
  if (sampleCaseCache) return sampleCaseCache;
  const scenario = demoScenarios.find((item) => item.id === defaultDemoScenarioId) ?? demoScenarios[0];
  const report = analyzeRoofReadiness({
    photos: scenario.photos,
    details: scenario.details,
    photoEvidence: scenario.photoEvidence,
    solarOpportunity: estimateSolarOpportunity(scenario.details, scenario.solarAssumptions),
    visionConfigured: false,
    visionObservationUsed: false
  });
  sampleCaseCache = { scenario, report };
  return sampleCaseCache;
}

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sample = getSampleCase();
  const stepsView = useInView<HTMLDivElement>();
  const trustView = useInView<HTMLDivElement>();
  const hostedAvailable = isAwsBackendConfigured();

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className="landing-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <span className="top-sentinel" ref={sentinelRef} aria-hidden="true" />
      <header className={`landing-topbar ${scrolled ? "is-scrolled" : ""}`}>
        <a className="brand-lockup" href="/" aria-label="Roof Signal home">
          <Brand />
        </a>
        <button ref={toggleRef} className="icon-button menu-toggle" type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="landing-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav id="landing-navigation" className={`landing-nav ${menuOpen ? "is-open" : ""}`} aria-label="Landing page navigation" onClick={() => setMenuOpen(false)}>
          <a href="#problem">The report</a>
          <a href="#how-it-works">How it works</a>
          <a href="#faq">FAQ</a>
          <a className="button primary" href="/app">
            Open sample <ArrowRight size={16} />
          </a>
        </nav>
      </header>

      <main id="main" className="landing-main">
        <EvidenceHero />

        <section id="problem" className="landing-section product-section">
          <SampleReportPreview sample={sample} />
        </section>

        <section id="how-it-works" className="landing-section how-section">
          <div className="wrap">
            <p className="eyebrow">How it works</p>
            <h2>Ready for the conversation.</h2>
            <div className="steps-grid" ref={stepsView.ref} data-motion={stepsView.motion}>
              <StepCard number="01" title="Add the job" text="Roof photos, age, leak history and the homeowner's goal." index={0} />
              <StepCard number="02" title="Confirm the evidence" text="Tag the visible conditions. Keep judgment with the rep." index={1} />
              <StepCard number="03" title="Bring the next step" text="A homeowner-ready report, with print and CSV export." index={2} />
            </div>
          </div>
        </section>

        <section className="landing-section trust-section">
          <div className="wrap trust-layout">
            <div>
              <p className="eyebrow">Built for a defensible call</p>
              <h2>Nothing hidden in the score.</h2>
            </div>
            <div className="trust-grid" ref={trustView.ref} data-motion={trustView.motion}>
              <TrustItem icon={<ShieldCheck size={21} />} title="Readable rules" text="Every score traces back to provided inputs and confirmed observations." index={0} />
              <TrustItem icon={<Sparkles size={21} />} title="AI drafts. You confirm." text="Optional Gemini photo suggestions stay drafts until the rep accepts them." index={1} />
              <TrustItem icon={<FileText size={21} />} title="Triage, not an inspection" text="Not a licensed inspection, roof measurement, final solar design or permitting review." index={2} />
            </div>
          </div>
        </section>

        <section className="landing-section access-section">
          <div className={`wrap access-layout ${hostedAvailable ? "" : "local-access"}`}>
            <div>
              <p className="eyebrow">The next appointment</p>
              <h2>Start with a clearer roof conversation.</h2>
              <p>
                {hostedAvailable ? "Explore the sample. Hosted company workspaces are available by invitation." : "Explore a sample report or assess a roof with your own photos. No account needed."}
              </p>
            </div>
            {hostedAvailable ? <RequestAccessForm /> : <div className="access-demo-actions">
              <a className="button primary" href="/app">See sample report <ArrowRight size={18} /></a>
              <a className="text-link" href="/app?blank=1#workflow">Start a report <ArrowRight size={17} /></a>
            </div>}
          </div>
        </section>

        <section id="faq" className="landing-section faq-section">
          <div className="wrap">
            <p className="eyebrow">FAQ</p>
            <h2>Before you try it.</h2>
            <div className="faq-grid">
              <FaqItem title="Who is it for?" text="Residential roofing and solar reps who need to turn roof photos and job details into a consistent homeowner-ready report before an appointment." />
              <FaqItem title="Does it write the report for me?" text="Roof Signal assembles the recommendation, confirmed photo evidence, and next steps from your inputs. You still collect the photos, confirm the conditions, and review the result before printing or exporting." />
              <FaqItem title="Is the score AI?" text="No. Scores are rule-based from the inputs on the report. Optional Gemini photo suggestions are drafts and only count once a rep confirms them." />
              <FaqItem title="Where does my data go?" text="Local reports stay in this browser. Signed-in hosted reports use company-specific AWS storage and private photo access. Shared report links expire." />
              <FaqItem title="What are the limits?" text="This is pre-appointment triage, not a licensed inspection or final solar design. CRM export is a CSV, not a direct integration." />
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <a className="brand-lockup" href="/" aria-label="Roof Signal home"><Brand /></a>
        <span>Pre-appointment roof + solar triage</span>
        <a href="https://github.com/manynames3/roofsignal">Source & engineering documentation <ArrowRight size={14} /></a>
      </footer>
    </div>
  );
}

function EvidenceHero() {
  return (
    <section className="landing-hero">
      <div className="hero-copy">
        <p className="hero-eyebrow">For roofing + solar reps</p>
        <h1 className="hero-tagline">From roof photos to a homeowner-ready report.</h1>
        <p className="hero-body">Add job details and confirm visible conditions. Get the recommendation, photo evidence, and next steps in one report, ready to print or export.</p>
        <div className="hero-actions">
          <a className="button primary" href="/app?blank=1#workflow">Create a report <ArrowRight size={18} /></a>
          <a className="text-link" href="#problem">Try live sample <ArrowRight size={17} /></a>
        </div>
        <p className="promise-strip"><CheckCircle2 size={16} />Sample report. No account needed.</p>
      </div>
    </section>
  );
}

function SampleReportPreview({ sample }: { sample: SampleCase }) {
  const { scenario } = sample;
  const { solarAssumptions, photos, photoEvidence } = scenario;
  const [inputs, setInputs] = useState<SampleInputs>({ roofAgeYears: scenario.details.roofAgeYears ?? 0, knownLeaks: scenario.details.knownLeaks });
  const { details, report } = useMemo(() => assessSample(scenario, inputs), [scenario, inputs]);
  const fullReportUrl = sampleReportUrl(inputs);
  const theme = statusTheme[report.recommendation.status];
  const view = useInView<HTMLDivElement>();
  const previewPhotos = photos.slice(1, 3);
  const scoreLines = [
    { label: "Roof risk", value: report.scores.totalRisk, original: sample.report.scores.totalRisk, tone: "risk" },
    { label: "Solar readiness", value: report.scores.solarReadiness, original: sample.report.scores.solarReadiness, tone: "positive" },
    { label: "Data complete", value: report.scores.dataCompleteness, original: sample.report.scores.dataCompleteness, tone: "positive" }
  ];

  return (
    <div className="sample-overview wrap" ref={view.ref} data-motion={view.motion}>
      <div className="sample-controls">
        <div className="sample-controls-head">
          <h2>Explore a sample report</h2>
          <button className="icon-button" type="button" aria-label="Reset sample inputs" title="Reset sample inputs" onClick={() => setInputs({ roofAgeYears: scenario.details.roofAgeYears ?? 0, knownLeaks: scenario.details.knownLeaks })}><RotateCcw size={18} /></button>
        </div>
        <div className="sample-control-fields">
          <label className="sample-age-field" htmlFor="sample-roof-age">
            <span>Roof age <output htmlFor="sample-roof-age">{inputs.roofAgeYears} years</output></span>
            <input id="sample-roof-age" type="range" min="0" max="40" step="1" value={inputs.roofAgeYears} aria-valuetext={`${inputs.roofAgeYears} years`} onChange={(event) => { const roofAgeYears = Number(event.currentTarget.value); setInputs((current) => ({ ...current, roofAgeYears })); }} />
          </label>
          <label className="field" htmlFor="sample-leaks"><span>Leak history</span><select id="sample-leaks" value={inputs.knownLeaks} onChange={(event) => { const knownLeaks = event.currentTarget.value as KnownStatus; setInputs((current) => ({ ...current, knownLeaks })); }}><option value="yes">Reported</option><option value="no">None reported</option><option value="unknown">Unknown</option></select></label>
        </div>
        <p className="sample-control-note">Sample photos and confirmed conditions stay fixed. Nothing is saved.</p>
      </div>
      <div className="sample-decision">
        <p className="sample-preview-label"><FileText size={16} />Sample assessment</p>
        <p className="sr-only" role="status" aria-atomic="true">{formatRecommendationStatus(report.recommendation.status)}. Roof risk {report.scores.totalRisk} out of 100. Confidence {report.recommendation.confidence}.</p>
        <div className="decision-head">
          <span className={`status-badge ${theme.tone}`}>{theme.icon}{formatRecommendationStatus(report.recommendation.status)}</span>
          <span className="decision-confidence">Confidence <b>{report.recommendation.confidence}</b></span>
        </div>
        <h2 className="sample-recommendation">{report.recommendation.label}</h2>
        <dl className="sample-inputs" aria-label="Sample job inputs">
          <div><dt>Roof age</dt><dd>{details.roofAgeYears} years</dd></div>
          <div><dt>Leak history</dt><dd>{details.knownLeaks === "yes" ? "Reported" : details.knownLeaks === "no" ? "None reported" : "Unknown"}</dd></div>
          <div><dt>Photo evidence</dt><dd>{photos.length} photos</dd></div>
        </dl>
        <p className="sample-next"><span>Next step</span>{homeownerNextStep(report.recommendation.status)}</p>
        <div className="sample-why">
          <h3>Why this recommendation</h3>
          <p>{report.roofRiskFactors[0]}</p>
          <p className="sample-calculation">Total roof risk {report.scores.totalRisk}/100. Component risk scores: age {report.scores.roofAgeRisk}/100, confirmed conditions {report.scores.visibleConditionRisk}/100, and leaks {report.scores.leakRisk}/100.</p>
          <p>{report.recommendation.confidenceRationale}</p>
        </div>
        <a className="text-link sample-open-report" href={fullReportUrl}>Open this sample report <ArrowRight size={17} /></a>
      </div>
      <div className="sample-evidence">
        <div className="evidence-grid">
          {previewPhotos.map((photo, index) => {
            const evidence = photoEvidence.find((item) => item.photoId === photo.id);
            return (
              <figure key={photo.id}>
                <div className="evidence-photo">
                  <img src={photo.previewUrl} alt={evidence?.caption || photo.fileName} width="960" height="540" decoding="async" />
                </div>
                <figcaption><span className="evidence-view">{index === 0 ? "Roof slope" : "Roof edge"}</span>{evidence?.caption || photo.fileName}</figcaption>
              </figure>
            );
          })}
        </div>
        <div className="evidence-footer">
          <span className="evidence-source">Rep-tagged sample evidence</span>
          <a className="text-link" href={fullReportUrl}>See all {photos.length} photos <ArrowRight size={16} /></a>
        </div>
      </div>
      <div className="sample-context">
        <ul className="sample-scores">
          {scoreLines.map((line, index) => (
            <li key={line.label} style={{ "--v": line.value / 100, "--i": index } as CSSProperties}>
              <span className="sample-score-name">{line.label}</span>
              <b>{line.value}<small>/100</small></b>
              <span className="sample-score-change">{line.value !== line.original ? `Originally ${line.original}` : ""}</span>
              <span className="sample-score-track" aria-hidden="true"><i className={line.tone} /></span>
            </li>
          ))}
        </ul>
        <p className="sample-assumptions">
          Solar assumptions: {solarAssumptions.usableRoofAreaSqft?.toLocaleString()} sq ft usable, {roofOrientationLabels[solarAssumptions.roofOrientation].toLowerCase()}-facing, {shadeLevelLabels[solarAssumptions.shadeLevel].toLowerCase()}.
        </p>
        <p className="sample-limit">Pre-appointment triage. Final scope requires a qualified roof professional.</p>
      </div>
    </div>
  );
}

function StepCard({ number, title, text, index }: { number: string; title: string; text: string; index: number }) {
  return (
    <article className="step-card" style={{ "--i": index } as CSSProperties}>
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function TrustItem({ icon, title, text, index }: { icon: ReactNode; title: string; text: string; index: number }) {
  return (
    <article className="trust-item" style={{ "--i": index } as CSSProperties}>
      {icon}
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </article>
  );
}

function FaqItem({ title, text }: { title: string; text: string }) {
  return (
    <details className="faq-item">
      <summary>{title}<span aria-hidden="true">+</span></summary>
      <p>{text}</p>
    </details>
  );
}

function RequestAccessForm() {
  const [input, setInput] = useState<AccessRequestInput>({
    name: "",
    email: "",
    companyName: "",
    phone: "",
    notes: ""
  });
  const [status, setStatus] = useState<Notice>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const awsReady = isAwsBackendConfigured();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!awsReady) {
      setStatus({ type: "warning", message: "Hosted request intake is enabled after AWS environment variables are configured." });
      return;
    }

    setIsSubmitting(true);
    try {
      await submitAccessRequest(input);
      setStatus({ type: "success", message: "Request received. Hosted access requires an invitation." });
      setInput({ name: "", email: "", companyName: "", phone: "", notes: "" });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Could not submit request." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="access-form" onSubmit={handleSubmit}>
      <div className="field-grid">
        <TextField label="Name" value={input.name} onChange={(value) => setInput((current) => ({ ...current, name: value }))} placeholder="Alex Morgan" />
        <TextField label="Work email" value={input.email} onChange={(value) => setInput((current) => ({ ...current, email: value }))} placeholder="alex@roofcompany.com" />
        <TextField label="Company" value={input.companyName} onChange={(value) => setInput((current) => ({ ...current, companyName: value }))} placeholder="Summit Roof + Solar" />
        <TextField label="Phone" value={input.phone} onChange={(value) => setInput((current) => ({ ...current, phone: value }))} placeholder="(555) 014-9000" />
      </div>
      <label className="field">
        <span>Pilot notes</span>
        <textarea
          value={input.notes}
          onChange={(event) => setInput((current) => ({ ...current, notes: event.target.value }))}
          placeholder="Team size, market, CRM, and whether you sell roof + solar bundles."
          rows={3}
        />
      </label>
      {status ? <NoticeBanner notice={status} onDismiss={() => setStatus(null)} /> : null}
      <div className="access-actions">
        <button className="button primary" type="submit" disabled={isSubmitting || !awsReady}>
          {isSubmitting ? <Loader2 size={18} className="spin" /> : <ArrowRight size={18} />}
          Request hosted pilot
        </button>
        <a className="button secondary" href="/app">
          Open sample report
        </a>
      </div>
      {!awsReady ? <p className="form-note">Hosted access requests are unavailable in this demo. The sample report is available now.</p> : null}
    </form>
  );
}

function ReadinessApp() {
  const inputRevision = useRef(0);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [photoEvidence, setPhotoEvidence] = useState<PhotoEvidence[]>([]);
  const [details, setDetails] = useState<PropertyDetails>(emptyPropertyDetails);
  const [solarAssumptions, setSolarAssumptions] = useState<SolarOpportunityAssumptions>(defaultSolarAssumptions);
  const [company, setCompany] = useState<CompanyProfile>(defaultCompanyProfile);
  const [savedReports, setSavedReports] = useState<SavedReadinessReport[]>([]);
  const [activeReport, setActiveReport] = useState<SavedReadinessReport | null>(null);
  const [reportStale, setReportStale] = useState(false);
  const [activeView, setActiveView] = useState<"workflow" | "report" | "workspace">("workflow");
  const [sharedView] = useState(() => Boolean(new URLSearchParams(window.location.search).get("share")));
  const [sampleInputs] = useState(() => parseSampleInputs(new URLSearchParams(window.location.search)));
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [activeDemoScenarioId, setActiveDemoScenarioId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string>("");
  const [notice, setNotice] = useState<Notice>(null);
  const [limitsAccepted, setLimitsAccepted] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSuggestingPhotoEvidence, setIsSuggestingPhotoEvidence] = useState(false);
  const [awsAuth, setAwsAuth] = useState<AwsAuthSession | null>(null);
  const [isLoadingCloudReports, setIsLoadingCloudReports] = useState(false);
  const [isExportingCrm, setIsExportingCrm] = useState(false);

  const visionConfigured = isVisionAnalysisConfigured();
  const awsConfigured = isAwsBackendConfigured();
  const cloudMode = awsConfigured && Boolean(awsAuth);
  const pvWattsConfigured = cloudMode || isPvWattsConfigured();
  const readinessChecks = useMemo(
    () => getReadinessChecks(photos, details, solarAssumptions, photoEvidence),
    [photos, details, solarAssumptions, photoEvidence]
  );
  const dashboardReports = useMemo(
    () => savedReports.filter((report) => !report.sample && !report.id.startsWith("demo-")),
    [savedReports]
  );
  const stats = useMemo(() => buildDashboardStats(dashboardReports), [dashboardReports]);
  const activeDemoScenario = useMemo(
    () => demoScenarios.find((scenario) => scenario.id === activeDemoScenarioId) ?? null,
    [activeDemoScenarioId]
  );

  useEffect(() => {
    const session = awsConfigured ? consumeAuthSessionFromUrl() : null;
    const reports = loadSavedReports();
    const profile = loadCompanyProfile();
    const params = new URLSearchParams(window.location.search);
    // Sample overrides are a one-time handoff, never saved/share/report overrides.
    if (params.has("sampleAge") || params.has("sampleLeaks")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("sampleAge");
      url.searchParams.delete("sampleLeaks");
      window.history.replaceState({}, "", url);
    }
    const reportId = params.get("report");
    const shareId = params.get("share");
    const demoId = params.get("demo");
    const shouldStartBlank = params.get("blank") === "1";
    const linkedReport = reportId ? reports.find((report) => report.id === reportId) : null;

    setAwsAuth(session);
    setSavedReports(reports);
    setCompany(profile);

    if (shareId) {
      if (awsConfigured) void loadSharedCloudReport(shareId);
      else setNotice({ type: "error", message: "Shared reports are unavailable in this local workspace." });
      return;
    }

    if (session) {
      void refreshCloudReports(session, reportId);
      if (!reportId && !demoId && !shouldStartBlank) {
        loadDemoScenario(defaultDemoScenarioId, {
          companyOverride: profile,
          generateReport: true,
          updateUrl: false,
          sampleInputs,
          message: "Signed in. Cloud reports are loading; demo report shown for the walkthrough."
        });
      }
      return;
    }

    if (linkedReport) {
      hydrateLoadedReport(linkedReport);
      setIsDemoMode(false);
      setActiveDemoScenarioId(null);
      setNotice({ type: "success", message: "Loaded saved report from this browser." });
      return;
    }

    if (!shouldStartBlank) {
      loadDemoScenario(demoId || defaultDemoScenarioId, {
        companyOverride: profile,
        generateReport: true,
        updateUrl: Boolean(demoId),
        sampleInputs: !reportId && (!demoId || demoId === defaultDemoScenarioId) ? sampleInputs : undefined,
        message: "Sample report loaded."
      });
    }
  }, []);

  async function refreshCloudReports(session: AwsAuthSession = awsAuth!, reportId?: string | null) {
    if (!session) return;

    setIsLoadingCloudReports(true);
    try {
      const cloudReports = await listAwsReports(session);
      setSavedReports(cloudReports);

      const linkedReport = reportId ? cloudReports.find((report) => report.id === reportId) : null;
      if (linkedReport) {
        hydrateLoadedReport(linkedReport);
        setNotice({ type: "success", message: "Loaded hosted report from AWS." });
      }
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Could not load hosted reports."
      });
    } finally {
      setIsLoadingCloudReports(false);
    }
  }

  async function loadSharedCloudReport(shareId: string) {
    try {
      const sharedReport = await getSharedAwsReport(shareId);
      hydrateLoadedReport(sharedReport);
      setSavedReports([]);
      setIsDemoMode(false);
      setActiveDemoScenarioId(null);
      setLimitsAccepted(true);
      setNotice({ type: "success", message: "Loaded hosted share link." });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "That hosted share link is not available."
      });
      clearAppUrl();
    }
  }

  function hydrateLoadedReport(saved: SavedReadinessReport) {
    inputRevision.current += 1;
    const evidence = saved.report.photoEvidence ?? [];
    const solar = saved.report.solarOpportunity;
    setActiveReport(saved);
    setReportStale(false);
    setActiveView("report");
    setIsDemoMode(false);
    setActiveDemoScenarioId(null);
    setDetails(saved.details);
    setPhotoEvidence(evidence);
    setPhotos(evidence.map((item) => ({
      id: item.photoId,
      fileName: item.fileName,
      previewUrl: item.previewUrl ?? "",
      sizeBytes: 0,
      type: "image/jpeg",
      lastModified: 0
    })));
    setCompany(saved.company);
    setSolarAssumptions(saved.solarAssumptions ?? (solar ? {
      usableRoofAreaSqft: solar.usableRoofAreaSqft,
      roofOrientation: solar.roofOrientation,
      roofPitchDegrees: solar.roofPitchDegrees,
      panelWattage: solar.panelCount && solar.estimatedDcWatts
        ? solar.estimatedDcWatts / solar.panelCount : defaultSolarAssumptions.panelWattage,
      shadeLevel: solar.shadeLevel
    } : defaultSolarAssumptions));
    setLimitsAccepted(true);
  }

  function signInWithAws() {
    window.location.href = getAwsLoginUrl();
  }

  function signOutOfAws() {
    clearAwsAuthSession();
    setAwsAuth(null);
    window.location.href = getAwsLogoutUrl();
  }

  function updateDetails<K extends keyof PropertyDetails>(key: K, value: PropertyDetails[K]) {
    setDetails((current) => ({ ...current, [key]: value }));
    markReportStale();
  }

  function updateSolarAssumptions<K extends keyof SolarOpportunityAssumptions>(
    key: K,
    value: SolarOpportunityAssumptions[K]
  ) {
    setSolarAssumptions((current) => ({ ...current, [key]: value }));
    markReportStale();
  }

  function updateCompany<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    setCompany((current) => {
      const next = { ...current, [key]: value };
      saveCompanyProfile(next);
      return next;
    });
    markReportStale();
  }

  function markReportStale() {
    inputRevision.current += 1;
    if (activeReport) setReportStale(true);
  }

  function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const accepted: UploadedPhoto[] = [];
    const rejected: string[] = [];

    files.forEach((file) => {
      const reason = getUnsupportedFileReason(file);
      if (reason) {
        rejected.push(`${file.name}: ${reason}`);
        return;
      }
      accepted.push(toUploadedPhoto(file));
    });

    if (accepted.length > 0) {
      setPhotos((current) => {
        const nextPhotos = [...current, ...accepted].slice(0, 16);
        setPhotoEvidence((currentEvidence) => syncPhotoEvidenceForPhotos(nextPhotos, currentEvidence));
        return nextPhotos;
      });
      markReportStale();
    }

    setFileError(rejected.slice(0, 3).join(" "));
  }

  function removePhoto(photoId: string) {
    setPhotos((current) => {
      const photo = current.find((item) => item.id === photoId);
      if (photo?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.id !== photoId);
    });
    setPhotoEvidence((current) => current.filter((item) => item.photoId !== photoId));
    markReportStale();
  }

  function updatePhotoEvidenceCaption(photoId: string, caption: string) {
    setPhotoEvidence((current) => {
      const currentByPhotoId = new Map(current.map((item) => [item.photoId, item]));

      return photos.map((photo) => {
        const item = currentByPhotoId.get(photo.id) ?? createPhotoEvidence(photo);
        return item.photoId === photoId ? { ...item, caption, source: "rep-entered" } : item;
      });
    });
    markReportStale();
  }

  function togglePhotoEvidenceObservation(photoId: string, flag: VisibleConditionFlag) {
    const existing = photoEvidence.find((item) => item.photoId === photoId);
    const willAdd = !existing?.observations.includes(flag);

    setPhotoEvidence((current) => {
      const currentByPhotoId = new Map(current.map((item) => [item.photoId, item]));

      return photos.map((photo) => {
        const item = currentByPhotoId.get(photo.id) ?? createPhotoEvidence(photo);
        if (item.photoId !== photoId) return item;

        const nextObservations = item.observations.includes(flag)
          ? item.observations.filter((observation) => observation !== flag)
          : [...item.observations, flag];

        return {
          ...item,
          observations: nextObservations,
          source: "rep-entered"
        };
      });
    });

    if (willAdd && flag !== "no-obvious-damage") {
      setDetails((current) => addConditionFlagToDetails(current, flag));
    }

    markReportStale();
  }

  function acceptPhotoEvidenceSuggestion(photoId: string) {
    const suggestion = photoEvidence.find((item) => item.photoId === photoId);

    setPhotoEvidence((current) =>
      current.map((item) => (item.photoId === photoId ? { ...item, source: "rep-entered" } : item))
    );

    suggestion?.observations
      .filter((flag) => flag !== "no-obvious-damage")
      .forEach((flag) => setDetails((current) => addConditionFlagToDetails(current, flag)));

    markReportStale();
  }

  function rejectPhotoEvidenceSuggestion(photoId: string) {
    setPhotoEvidence((current) =>
      current.map((item) =>
        item.photoId === photoId
          ? {
              ...item,
              caption: getDefaultPhotoCaption(item.fileName),
              observations: [],
              source: "rep-entered"
            }
          : item
      )
    );
    markReportStale();
  }

  async function suggestPhotoEvidenceWithGemini() {
    if (isSuggestingPhotoEvidence) return;
    if (photos.length === 0) {
      setNotice({ type: "warning", message: "Upload roof photos before requesting Gemini suggestions." });
      return;
    }

    setIsSuggestingPhotoEvidence(true);
    const revision = inputRevision.current;

    try {
      const result = cloudMode && awsAuth
        ? await requestAwsPhotoEvidenceSuggestions(awsAuth, photos.filter((photo) => photo.previewUrl))
        : await requestGeminiPhotoEvidenceSuggestions(photos.filter((photo) => photo.previewUrl));

      if (revision !== inputRevision.current) {
        setNotice({ type: "warning", message: "Inputs changed while suggesting. Request suggestions again for the current photos." });
        return;
      }

      if (!result.configured) {
        setNotice({
          type: "warning",
          message: result.error ?? "Gemini is not configured yet. Add GEMINI_API_KEY on the server."
        });
        return;
      }

      if (result.suggestions.length === 0) {
        setNotice({ type: "warning", message: "Gemini did not return usable photo evidence suggestions." });
        return;
      }

      setPhotoEvidence((current) => mergeVisionSuggestions(photos, current, result.suggestions));
      markReportStale();
      setNotice({
        type: "success",
        message: `Gemini suggested tags for ${result.suggestions.length} photo${result.suggestions.length === 1 ? "" : "s"}. Accept or edit before sharing.`
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Gemini photo evidence suggestions failed."
      });
    } finally {
      setIsSuggestingPhotoEvidence(false);
    }
  }

  function handleConditionToggle(flag: VisibleConditionFlag) {
    setDetails((current) => {
      const hasFlag = current.visibleConditionFlags.includes(flag);
      let nextFlags = hasFlag
        ? current.visibleConditionFlags.filter((item) => item !== flag)
        : [...current.visibleConditionFlags, flag];

      if (flag === "no-obvious-damage" && !hasFlag) {
        nextFlags = ["no-obvious-damage"];
      } else if (flag !== "no-obvious-damage" && !hasFlag) {
        nextFlags = nextFlags.filter((item) => item !== "no-obvious-damage");
      }

      if (nextFlags.length === 0) nextFlags = ["limited-or-unclear-photos"];

      return { ...current, visibleConditionFlags: nextFlags };
    });
    markReportStale();
  }

  function applyDemoScenario(scenarioId: string) {
    loadDemoScenario(scenarioId, {
      generateReport: true,
      updateUrl: true,
      message: "Demo case loaded and report generated."
    });
  }

  function loadDemoScenario(
    scenarioId: string,
    options: {
      companyOverride?: CompanyProfile;
      generateReport?: boolean;
      updateUrl?: boolean;
      sampleInputs?: SampleInputs;
      message?: string;
    } = {}
  ) {
    const scenario =
      demoScenarios.find((item) => item.id === scenarioId) ??
      demoScenarios.find((item) => item.id === defaultDemoScenarioId);
    if (!scenario) return;
    inputRevision.current += 1;

    photos.forEach((photo) => {
      if (photo.previewUrl.startsWith("blob:")) URL.revokeObjectURL(photo.previewUrl);
    });

    const demoDetails = clonePropertyDetails(scenario.details);
    if (options.sampleInputs) Object.assign(demoDetails, options.sampleInputs);
    const demoPhotos = scenario.photos.map((photo) => ({ ...photo }));
    const demoEvidence = syncPhotoEvidenceForPhotos(
      demoPhotos,
      scenario.photoEvidence.map((item) => clonePhotoEvidence(item))
    );
    const demoSolarAssumptions = { ...scenario.solarAssumptions };
    const demoSolarOpportunity = estimateSolarOpportunity(demoDetails, demoSolarAssumptions);
    const demoCompany = getGuidedDemoCompanyProfile(options.companyOverride ?? company);

    setDetails(demoDetails);
    setPhotos(demoPhotos);
    setPhotoEvidence(demoEvidence);
    setSolarAssumptions(demoSolarAssumptions);
    setCompany(demoCompany);
    setActiveReport(null);
    setReportStale(false);
    setActiveView(options.generateReport ? "report" : "workflow");
    setIsDemoMode(true);
    setActiveDemoScenarioId(scenario.id);
    setLimitsAccepted(true);
    setFileError("");

    if (options.generateReport) {
      const report = analyzeRoofReadiness({
        photos: demoPhotos,
        details: demoDetails,
        photoEvidence: demoEvidence,
        solarOpportunity: demoSolarOpportunity,
        visionConfigured,
        visionObservationUsed: false
      });
      setActiveReport({
        ...buildSavedReport(report, demoDetails, demoPhotos, demoCompany, { storageMode: "demo", solarAssumptions: demoSolarAssumptions }),
        id: `demo-${scenario.id}`,
        title: `${demoDetails.homeownerName} - ${demoDetails.propertyAddress}`
      });
    }

    setNotice({ type: "success", message: options.message ?? `${scenario.label} sample loaded.` });

    if (options.updateUrl) {
      setDemoUrl(scenario.id);
    } else {
      clearReportUrl();
    }
  }

  function startBlankReport() {
    inputRevision.current += 1;
    photos.forEach((photo) => {
      if (photo.previewUrl.startsWith("blob:")) URL.revokeObjectURL(photo.previewUrl);
    });
    setDetails(emptyPropertyDetails);
    setPhotos([]);
    setPhotoEvidence([]);
    setSolarAssumptions(defaultSolarAssumptions);
    setActiveReport(null);
    setReportStale(false);
    setActiveView("workflow");
    setIsDemoMode(false);
    setActiveDemoScenarioId(null);
    setLimitsAccepted(false);
    setFileError("");
    setNotice({ type: "success", message: "Blank report workflow ready." });
    clearAppUrl();
    requestAnimationFrame(() => scrollToSection("workflow"));
  }

  function jumpToWorkflow() {
    setActiveView("workflow");
    requestAnimationFrame(() => scrollToSection("workflow"));
  }

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAnalyzing) return;

    if (!limitsAccepted) {
      setNotice({ type: "error", message: "Confirm the pre-appointment limitation before generating a report." });
      return;
    }

    setIsAnalyzing(true);
    const revision = inputRevision.current;

    function inputsChanged() {
      if (revision === inputRevision.current) return false;
      setNotice({ type: "warning", message: "Job details changed while generating. Generate again with the current inputs." });
      return true;
    }

    try {
      const evidenceForPhotos = syncPhotoEvidenceForPhotos(photos, photoEvidence);
      const reportableEvidence = getReportablePhotoEvidence(evidenceForPhotos);
      const detailsForReport = applyPhotoEvidenceToDetails(details, reportableEvidence);
      const solarOpportunity = cloudMode && awsAuth
        ? await requestAwsSolarEstimate(awsAuth, detailsForReport, solarAssumptions)
        : await analyzeSolarOpportunity(detailsForReport, solarAssumptions);
      if (inputsChanged()) return;
      const storedEvidence = cloudMode && awsAuth
        ? await attachAwsPhotoStorage(awsAuth, photos, reportableEvidence)
        : reportableEvidence;
      if (inputsChanged()) return;
      const report = analyzeRoofReadiness({
        photos,
        details: detailsForReport,
        photoEvidence: storedEvidence,
        solarOpportunity,
        visionConfigured,
        visionObservationUsed: false
      });
      const saved = buildSavedReport(report, detailsForReport, photos, company, {
        storageMode: cloudMode && awsAuth ? "hosted" : "local",
        solarAssumptions,
        sample: isDemoMode || activeReport?.sample
      });
      const persisted = cloudMode && awsAuth ? await createAwsReport(awsAuth, stripSessionPhotoUrls(saved)) : saved;
      const nextReports = cloudMode && awsAuth ? await listAwsReports(awsAuth) : saveReport(stripSessionPhotoUrls(saved));

      setSavedReports(nextReports);
      if (revision !== inputRevision.current) {
        setNotice({ type: "warning", message: "The earlier report was saved to history. Generate again with the current job details." });
        return;
      }
      setActiveReport(cloudMode && awsAuth ? persisted : saved);
      setReportStale(false);
      setActiveView("report");
      setDetails(detailsForReport);
      setPhotoEvidence(syncPhotoEvidenceForPhotos(photos, storedEvidence));
      setIsDemoMode(false);
      setActiveDemoScenarioId(null);
      setNotice({
        type: "success",
        message:
          solarOpportunity.source === "nrel-pvwatts"
            ? `Report generated with NREL PVWatts solar estimate and saved ${cloudMode ? "to AWS" : "locally"}.`
            : `Report generated with local solar opportunity estimate and saved ${cloudMode ? "to AWS" : "locally"}.`
      });
      setReportUrl((cloudMode && awsAuth ? persisted : saved).id);
      requestAnimationFrame(() => scrollToSection("report"));
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Could not generate the report."
      });
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function loadReport(reportId: string) {
    const saved = cloudMode && awsAuth ? await getAwsReportSafe(awsAuth, reportId) : findSavedReport(reportId);
    if (!saved) {
      setNotice({ type: "error", message: cloudMode ? "That hosted report is no longer available." : "That saved report is no longer available in this browser." });
      return;
    }

    hydrateLoadedReport(saved);
    setIsDemoMode(false);
    setActiveDemoScenarioId(null);
    setReportUrl(saved.id);
    setNotice({
      type: "success",
      message: cloudMode
        ? "Hosted report loaded with private photo links."
        : "Saved report loaded. Uploaded image bytes are not stored; photo evidence keeps file names, captions, and tags."
    });
    requestAnimationFrame(() => scrollToSection("report"));
  }

  async function getAwsReportSafe(session: AwsAuthSession, reportId: string) {
    try {
      return await getAwsReport(session, reportId);
    } catch {
      return null;
    }
  }

  async function removeSavedReport(reportId: string) {
    let nextReports: SavedReadinessReport[];
    try {
      nextReports = cloudMode && awsAuth
        ? await deleteAwsReport(awsAuth, reportId).then(() => savedReports.filter((report) => report.id !== reportId))
        : deleteReport(reportId);
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Could not delete that report."
      });
      return;
    }

    setSavedReports(nextReports);

    if (activeReport?.id === reportId) {
      inputRevision.current += 1;
      setActiveReport(null);
      setReportStale(false);
      clearReportUrl();
    }

    setNotice({ type: "success", message: cloudMode ? "Hosted report deleted." : "Saved report deleted." });
  }

  async function copySummary() {
    if (!activeReport) return;

    try {
      await navigator.clipboard.writeText(buildClipboardSummary(activeReport.report, activeReport.details, activeReport.company));
      setNotice({ type: "success", message: "Report summary copied." });
    } catch {
      setNotice({ type: "error", message: "Clipboard access failed. Use print export instead." });
    }
  }

  async function copyLocalLink() {
    if (!activeReport) return;

    try {
      if (cloudMode && awsAuth && !activeReport.id.startsWith("demo-")) {
        const share = await createAwsShareLink(awsAuth, activeReport.id);
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set("share", share.shareId);
        url.hash = "report";
        await navigator.clipboard.writeText(url.toString());
        setNotice({ type: "success", message: "Hosted share link copied. It works across devices until it expires." });
        return;
      }

      const url = new URL(window.location.href);
      if (activeDemoScenarioId && !savedReports.some((report) => report.id === activeReport.id)) {
        url.searchParams.delete("report");
        url.searchParams.delete("blank");
        url.searchParams.set("demo", activeDemoScenarioId);
        url.hash = "report";
      } else {
        url.searchParams.set("report", activeReport.id);
      }
      await navigator.clipboard.writeText(url.toString());
      setNotice({
        type: "success",
        message: activeDemoScenarioId
          ? "Demo link copied. It reloads the prefilled sample report."
          : "Local report link copied. It works in this browser until hosted share links are added."
      });
    } catch {
      setNotice({ type: "error", message: "Could not copy the local link." });
    }
  }

  async function exportCrmCsv() {
    if (!activeReport) return;

    if (!cloudMode || !awsAuth) {
      downloadCsv(`${activeReport.id}-crm-export.csv`, buildCrmCsv(activeReport));
      setNotice({ type: "success", message: "CRM-ready CSV downloaded." });
      return;
    }

    setIsExportingCrm(true);
    try {
      const result = await getAwsCrmExport(awsAuth, activeReport.id);
      downloadCsv(result.fileName, result.csv);
      setNotice({ type: "success", message: "CRM-ready CSV exported from AWS." });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Could not export CRM CSV."
      });
    } finally {
      setIsExportingCrm(false);
    }
  }

  if (sharedView) {
    return (
      <div className="app-shell shared-report">
        <header className="topbar"><a className="brand-lockup" href="/" aria-label="Roof Signal home"><Brand heading /></a><span className="pill muted">Shared readiness report</span></header>
        <main>
          {notice ? <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} /> : null}
          {activeReport ? <ReportSection savedReport={activeReport} onCopy={copySummary} onCopyLink={copyLocalLink} onExportCrm={exportCrmCsv} isExportingCrm={false} shareLabel="" hosted readOnly /> : <p role="status">{!awsConfigured ? "Shared reports are unavailable in this local workspace." : notice?.type === "error" ? "This report is unavailable or the link has expired." : "Loading shared report..."}</p>}
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-main">Skip to workspace</a>
      <header className="topbar">
        <a className="brand-lockup" href="/" aria-label="Roof Signal home">
          <Brand heading />
        </a>
        <div className="topbar-actions">
          <span className="pill muted">{cloudMode ? "Company workspace" : "Local workspace"}</span>
          {awsConfigured ? (
            awsAuth ? (
              <>
                <span className="pill muted">{awsAuth.email || "Signed in"}</span>
                <button className="button secondary compact-button" type="button" onClick={signOutOfAws}>
                  Sign out
                </button>
              </>
            ) : (
              <button className="button primary compact-button" type="button" onClick={signInWithAws}>
                <LockKeyhole size={16} />
                Sign in
              </button>
            )
          ) : null}
        </div>
      </header>

      <main id="workspace-main" className={activeView === "report" ? "report-first" : undefined}>
        <div className="workspace-heading" hidden={activeView === "report"}>
          <div><p className="eyebrow">Roof + solar triage</p><h2>{activeView === "report" ? "Report" : activeView === "workflow" ? "Job details" : "Workspace"}</h2></div>
          <button className="button secondary compact-button" type="button" onClick={startBlankReport}><ImagePlus size={17} />New report</button>
        </div>
        <nav className="workspace-navigation" aria-label="Workspace views">
          <button type="button" aria-pressed={activeView === "report"} onClick={() => setActiveView("report")}><FileText size={17} />Report{reportStale ? <span className="change-dot" aria-label="Inputs changed" /> : null}</button>
          <button type="button" aria-pressed={activeView === "workflow"} onClick={() => setActiveView("workflow")}><ClipboardCheck size={17} />Job details</button>
          <button type="button" aria-pressed={activeView === "workspace"} onClick={() => setActiveView("workspace")}><FolderOpen size={17} />Workspace</button>
          {activeView === "report" ? <button className="button secondary compact-button new-report-command" type="button" onClick={startBlankReport} aria-label="New report" title="New report"><ImagePlus size={17} /><span>New report</span></button> : null}
        </nav>

        {isDemoMode && activeDemoScenario && activeView === "report" ? (
          <DemoModePanel
            scenario={activeDemoScenario}
            onJumpWorkflow={jumpToWorkflow}
            onApply={applyDemoScenario}
            onReload={() => applyDemoScenario(activeDemoScenario.id)}
          />
        ) : null}

        {notice && !(isDemoMode && activeView === "report" && notice.type === "success" && notice.message === "Sample report loaded.") ? <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} /> : null}

        <div hidden={activeView !== "workspace"}>
        <div className="kpi-panel workspace-metrics" aria-label="Saved report summary">
          <MetricCard icon={<FileDown size={20} />} label="Saved reports this month" value={String(stats.reportsThisMonth)} />
          <MetricCard icon={<BriefcaseBusiness size={20} />} label="Bundle opportunities in saved reports" value={String(stats.bundleOpportunities)} />
          <MetricCard icon={<BarChart3 size={20} />} label="Average saved lead quality" value={stats.averageLeadQuality ? String(stats.averageLeadQuality) : "-"} />
        </div>
        <section className="ops-grid">
          <CompanySettings company={company} onChange={updateCompany} />
          <HostedControlsPanel awsConfigured={awsConfigured} cloudMode={cloudMode} auth={awsAuth} />
          <DemoScenarioPanel onApply={applyDemoScenario} />
          <SavedReportList
            reports={savedReports}
            activeId={activeReport?.id}
            hosted={cloudMode}
            isLoading={isLoadingCloudReports}
            onLoad={loadReport}
            onDelete={removeSavedReport}
          />
        </section>
        </div>

        <div hidden={activeView !== "workflow"}>
        <form id="workflow" className="workflow-grid" onSubmit={handleAnalyze}>
          <section className="panel upload-panel">
            <SectionHeader
              icon={<ImagePlus size={20} />}
              title="Roof photos"
              subtitle="Upload slope, shingles, valleys, gutters, flashing, attic or ceiling stains, and wide exterior shots."
            />
            <PhotoDropzone onFiles={addFiles} />
            {fileError ? <p className="form-error">{fileError}</p> : null}
            <PhotoEvidenceEditor
              photos={photos}
              evidence={photoEvidence}
              isSuggesting={isSuggestingPhotoEvidence}
              onRemove={removePhoto}
              onCaptionChange={updatePhotoEvidenceCaption}
              onObservationToggle={togglePhotoEvidenceObservation}
              onSuggestWithGemini={suggestPhotoEvidenceWithGemini}
              onAcceptSuggestion={acceptPhotoEvidenceSuggestion}
              onRejectSuggestion={rejectPhotoEvidenceSuggestion}
            />
          </section>

          <section className="panel">
            <SectionHeader
              icon={<Building2 size={20} />}
              title="Property and job details"
              subtitle="Capture the minimum details needed for a useful sales sequencing recommendation."
            />
            <div className="field-grid">
              <TextField
                label="Homeowner name"
                value={details.homeownerName}
                onChange={(value) => updateDetails("homeownerName", value)}
                placeholder="Jordan Lee"
              />
              <TextField
                label="Property address"
                value={details.propertyAddress}
                onChange={(value) => updateDetails("propertyAddress", value)}
                placeholder="Street, city, state, ZIP (U.S. address matching)"
              />
              <NumberField
                label="Roof age estimate"
                value={details.roofAgeYears}
                onChange={(value) => updateDetails("roofAgeYears", value)}
                placeholder="12"
                max={80}
              />
              <label className="field">
                <span>Roof material/type</span>
                <select
                  value={details.roofMaterial}
                  onChange={(event) => updateDetails("roofMaterial", event.target.value as PropertyDetails["roofMaterial"])}
                >
                  {Object.entries(roofMaterialLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="segmented-grid">
              <SegmentedStatus label="Known leaks" value={details.knownLeaks} onChange={(value) => updateDetails("knownLeaks", value)} />
              <SegmentedStatus label="Existing solar" value={details.existingSolar} onChange={(value) => updateDetails("existingSolar", value)} />
              <SegmentedStatus label="Utility bill available" value={details.utilityBillAvailable} onChange={(value) => updateDetails("utilityBillAvailable", value)} />
            </div>

            <label className="field">
              <span>Desired outcome</span>
              <select
                value={details.desiredOutcome}
                onChange={(event) => updateDetails("desiredOutcome", event.target.value as PropertyDetails["desiredOutcome"])}
              >
                {Object.entries(desiredOutcomeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <SolarOpportunityInputs
              assumptions={solarAssumptions}
              pvWattsConfigured={pvWattsConfigured}
              onChange={updateSolarAssumptions}
            />

            <div className="condition-section">
              <div>
                <h3>Visible condition inputs</h3>
                <p>Use what can be seen in photos or what the homeowner reported. Gemini can suggest tags if configured, but scoring uses only rep-entered or rep-accepted inputs.</p>
              </div>
              <div className="chip-grid">
                {conditionOptions.map((flag) => (
                  <label className="check-chip" key={flag}>
                    <input
                      type="checkbox"
                      checked={details.visibleConditionFlags.includes(flag)}
                      onChange={() => handleConditionToggle(flag)}
                    />
                    <span>{conditionFlagLabels[flag]}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="field">
              <span>Notes from rep</span>
              <textarea
                value={details.repNotes}
                onChange={(event) => updateDetails("repNotes", event.target.value)}
                placeholder="Homeowner mentioned 2018 storm repair near rear valley. Wants solar if roof timing makes sense."
                rows={4}
              />
            </label>

            <ReadinessCheckList checks={readinessChecks} />

            <label className="limit-confirmation">
              <input
                type="checkbox"
                checked={limitsAccepted}
                onChange={(event) => setLimitsAccepted(event.target.checked)}
              />
              <span>
                I understand this is pre-appointment visible-risk triage and sales guidance, not a licensed roof,
                structural, insurance, utility, or permitting determination.
              </span>
            </label>

            <div className="analyze-row">
              <div className="mode-note">
                <Sparkles size={18} />
                {cloudMode
                  ? "AWS hosted mode: reports save to DynamoDB, photos upload privately to S3, Gemini and NREL run server-side."
                  : visionConfigured
                  ? "Vision adapter flag is enabled. Confirm any suggested photo tags before generating."
                  : "Rule-based report. Gemini photo suggestions are optional and must be confirmed before scoring."}
              </div>
              <button className="button primary" type="submit" disabled={isAnalyzing}>
                {isAnalyzing ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
                {isAnalyzing ? "Generating report..." : "Generate and save report"}
              </button>
            </div>
          </section>
        </form>
        </div>

        <div hidden={activeView !== "report"}>
        {reportStale ? <div className="stale-report" role="status"><AlertTriangle size={18} /><span>Inputs changed. This is the last saved report.</span><button className="button secondary compact-button" type="button" onClick={jumpToWorkflow}>Review & regenerate<ArrowRight size={16} /></button></div> : null}
        {activeReport ? (
          <ReportSection
            savedReport={activeReport}
            onCopy={copySummary}
            onCopyLink={copyLocalLink}
            onExportCrm={exportCrmCsv}
            isExportingCrm={isExportingCrm}
            shareLabel={cloudMode ? "Copy hosted link" : "Copy local link"}
            hosted={cloudMode}
            stale={reportStale}
          />
        ) : (
          <ReportPlaceholder visionConfigured={visionConfigured} />
        )}
        </div>
      </main>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function NoticeBanner({ notice, onDismiss }: { notice: NonNullable<Notice>; onDismiss: () => void }) {
  return (
    <div className={`notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
      <span>{notice.message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss message">
        <X size={16} />
      </button>
    </div>
  );
}

function DemoModePanel({
  scenario,
  onJumpWorkflow,
  onApply,
  onReload,
}: {
  scenario: DemoScenario;
  onJumpWorkflow: () => void;
  onApply: (scenarioId: string) => void;
  onReload: () => void;
}) {
  return (
    <section className="demo-mode-panel" aria-label="Guided sample status">
      <div className="demo-mode-copy">
        <span className="sample-context-label">Sample assessment</span>
      </div>
      <div className="demo-mode-actions">
        <label className="field sample-case-field"><span className="sr-only">Sample case</span><select value={scenario.id} onChange={(event) => onApply(event.target.value)}>{demoScenarios.map((sample) => <option key={sample.id} value={sample.id}>{sample.label}</option>)}</select></label>
        <button className="icon-button" type="button" onClick={onJumpWorkflow} title="Review inputs" aria-label="Review inputs">
          <ClipboardCheck size={17} />
        </button>
        <button className="icon-button" type="button" onClick={onReload} title="Reset sample" aria-label="Reset sample">
          <RotateCcw size={17} />
        </button>
      </div>
    </section>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="section-header">
      <div className="section-icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function CompanySettings({
  company,
  onChange
}: {
  company: CompanyProfile;
  onChange: <K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) => void;
}) {
  return (
    <section className="panel mini-panel">
      <SectionHeader icon={<Settings size={20} />} title="Company branding" subtitle="Saved locally and printed on reports." />
      <div className="compact-field-grid">
        <TextField label="Company" value={company.companyName} onChange={(value) => onChange("companyName", value)} placeholder="BrightPeak Roof + Solar" />
        <TextField label="Rep" value={company.repName} onChange={(value) => onChange("repName", value)} placeholder="Alex Morgan" />
        <TextField label="Phone" value={company.phone} onChange={(value) => onChange("phone", value)} placeholder="(555) 014-2091" />
        <TextField label="Email" value={company.email} onChange={(value) => onChange("email", value)} placeholder="alex@company.com" />
      </div>
      <label className="field">
        <span>Report footer note</span>
        <textarea value={company.licenseNote} onChange={(event) => onChange("licenseNote", event.target.value)} rows={2} />
      </label>
    </section>
  );
}

function HostedControlsPanel({
  awsConfigured,
  cloudMode,
  auth
}: {
  awsConfigured: boolean;
  cloudMode: boolean;
  auth: AwsAuthSession | null;
}) {
  const modeLabel = cloudMode ? "Hosted workspace active" : awsConfigured ? "Hosted workspace available" : "Local demo mode";

  return (
    <section className="panel mini-panel">
      <SectionHeader icon={<ShieldCheck size={20} />} title="Hosted workspace" subtitle="Optional hosted storage and access." />
      <div className="control-status">
        <strong>{modeLabel}</strong>
        <span>{cloudMode ? `Company scope: ${auth?.companyId || "Unassigned"}` : awsConfigured ? "Sign in to use company-separated hosted reports." : "Reports stay in this browser. Hosted storage is not configured."}</span>
      </div>
      <div className="control-list">
        <div>
          <span>Team roles</span>
          <strong>{cloudMode ? `${auth?.role || "Unassigned"} role active` : "Invite-only accounts"}</strong>
          <p>Company access is assigned by an administrator. Hosted changes are restricted to report owners and admins.</p>
        </div>
        <div>
          <span>Retention</span>
          <strong>Default: 90-day reports/photos</strong>
          <p>Hosted retention is configurable. Share links default to 30 days; storage cleanup is asynchronous.</p>
        </div>
        <div>
          <span>Report context</span>
          <strong>Browser-authored provenance</strong>
          <p>Report context records inputs and scoring. It can be edited and is not an immutable audit log.</p>
        </div>
      </div>
    </section>
  );
}

function DemoScenarioPanel({ onApply }: { onApply: (scenarioId: string) => void }) {
  return (
    <section className="panel mini-panel">
      <SectionHeader icon={<Sparkles size={20} />} title="Demo scenarios" subtitle="Load a realistic buyer-demo case." />
      <div className="scenario-stack">
        {demoScenarios.map((scenario) => (
          <button className="scenario-button" type="button" key={scenario.id} onClick={() => onApply(scenario.id)}>
            <strong>{scenario.label}</strong>
            <span>{scenario.summary}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SavedReportList({
  reports,
  activeId,
  hosted,
  isLoading,
  onLoad,
  onDelete
}: {
  reports: SavedReadinessReport[];
  activeId?: string;
  hosted: boolean;
  isLoading: boolean;
  onLoad: (reportId: string) => void;
  onDelete: (reportId: string) => void;
}) {
  return (
    <section className="panel mini-panel">
      <SectionHeader
        icon={isLoading ? <Loader2 size={20} className="spin" /> : <FolderOpen size={20} />}
        title="Saved reports"
        subtitle={hosted ? "Hosted AWS reports for this company." : "Client-only history for pilot demos."}
      />
      {reports.length === 0 ? (
        <div className="empty-list">{isLoading ? "Loading reports..." : "No saved reports yet."}</div>
      ) : (
        <div className="saved-list">
          {reports.slice(0, 5).map((report) => (
            <div className={`saved-row ${activeId === report.id ? "active" : ""}`} key={report.id}>
              <button type="button" onClick={() => onLoad(report.id)}>
                <strong>{report.title}</strong>
                <span>{formatDate(report.createdAt)} - {report.report.recommendation.label}</span>
              </button>
              <button className="icon-button danger" type="button" aria-label={`Delete ${report.title}`} onClick={() => onDelete(report.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PhotoDropzone({ onFiles }: { onFiles: (files: FileList | File[]) => void }) {
  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    onFiles(event.dataTransfer.files);
  }

  return (
    <label className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <UploadCloud size={34} />
      <strong>Drop roof photos here</strong>
      <span>or choose JPG, PNG, WebP, HEIC/HEIF up to 12 MB each</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
        multiple
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          if (event.target.files) onFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </label>
  );
}

function PhotoEvidenceEditor({
  photos,
  evidence,
  isSuggesting,
  onRemove,
  onCaptionChange,
  onObservationToggle,
  onSuggestWithGemini,
  onAcceptSuggestion,
  onRejectSuggestion
}: {
  photos: UploadedPhoto[];
  evidence: PhotoEvidence[];
  isSuggesting: boolean;
  onRemove: (photoId: string) => void;
  onCaptionChange: (photoId: string, caption: string) => void;
  onObservationToggle: (photoId: string, flag: VisibleConditionFlag) => void;
  onSuggestWithGemini: () => void;
  onAcceptSuggestion: (photoId: string) => void;
  onRejectSuggestion: (photoId: string) => void;
}) {
  if (photos.length === 0) {
    return (
      <div className="empty-preview">
        <ImagePlus size={26} />
        <p>No photos uploaded yet. The report can run, but confidence and photo evidence will be limited.</p>
      </div>
    );
  }

  const evidenceByPhotoId = new Map(evidence.map((item) => [item.photoId, item]));
  const confirmedEvidence = evidence.filter((item) => item.source !== "vision-suggested");
  const confirmedTags = confirmedEvidence.reduce((sum, item) => sum + item.observations.length, 0);
  const riskSignals = confirmedEvidence.flatMap((item) => item.observations).filter((flag) => flag !== "no-obvious-damage").length;
  const suggestedCount = evidence.filter((item) => item.source === "vision-suggested").length;

  return (
    <div className="photo-evidence-editor">
      <div className="photo-evidence-intro">
        <div>
          <strong>Photo evidence analysis</strong>
          <span>Photos become report evidence when a rep confirms tags. Accepted tags directly update visible-condition risk, leak risk, urgency, and confidence.</span>
        </div>
        <button className="button secondary compact-button" type="button" onClick={onSuggestWithGemini} disabled={isSuggesting || !photos.some((photo) => photo.previewUrl)}>
          {isSuggesting ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          {isSuggesting ? "Suggesting..." : "Suggest tags with Gemini"}
        </button>
      </div>
      <div className="photo-analysis-strip" aria-label="Photo analysis summary">
        <PhotoAnalysisMetric label="Photos in report" value={String(photos.length)} />
        <PhotoAnalysisMetric label="Confirmed tags" value={String(confirmedTags)} />
        <PhotoAnalysisMetric label="Risk signals used" value={String(riskSignals)} />
        <PhotoAnalysisMetric label="AI drafts pending" value={String(suggestedCount)} />
      </div>
      {photos.map((photo) => {
        const item = evidenceByPhotoId.get(photo.id) ?? createPhotoEvidence(photo);
        const isVisionSuggested = item.source === "vision-suggested";

        return (
          <article className={`photo-evidence-card ${isVisionSuggested ? "vision-suggested" : ""}`} key={photo.id}>
            <div className="photo-card-image">
              {photo.previewUrl ? <img src={photo.previewUrl} alt={`Uploaded roof photo ${photo.fileName}`} /> : <div className="missing-photo"><ImagePlus size={24} /><span>Image not stored locally. Reattach to review.</span></div>}
              <button type="button" aria-label={`Remove ${photo.fileName}`} onClick={() => onRemove(photo.id)}>
                <Trash2 size={16} />
              </button>
            </div>
            <label className="field compact-field">
              <span>Caption</span>
              <input
                value={item.caption}
                onChange={(event) => onCaptionChange(photo.id, event.target.value)}
                placeholder="Example: lifted shingles near rear slope"
              />
            </label>
            <div className="photo-tag-list" aria-label={`Visible observations for ${photo.fileName}`}>
              {conditionOptions.map((flag) => (
                <label className={`photo-tag ${item.observations.includes(flag) ? "active" : ""}`} key={flag}>
                  <input
                    type="checkbox"
                    checked={item.observations.includes(flag)}
                    onChange={() => onObservationToggle(photo.id, flag)}
                  />
                  <span>{photoTagLabels[flag]}</span>
                </label>
              ))}
            </div>
            {isVisionSuggested ? (
              <div className="suggestion-actions">
                <span>Gemini suggestion. Confirm before it affects scoring.</span>
                <button type="button" onClick={() => onAcceptSuggestion(photo.id)}>
                  Accept
                </button>
                <button type="button" onClick={() => onRejectSuggestion(photo.id)}>
                  Reject
                </button>
              </div>
            ) : null}
            <p className="photo-file-name" title={photo.fileName}>{photo.fileName}</p>
          </article>
        );
      })}
    </div>
  );
}

function PhotoAnalysisMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PhotoEvidenceReport({ evidence, analysis }: { evidence: PhotoEvidence[]; analysis: PhotoEvidenceAnalysis[] }) {
  if (evidence.length === 0) return null;

  const analysisByPhotoId = new Map(analysis.map((item) => [item.photoId, item]));

  return (
    <section className="photo-evidence-report">
      <div className="report-section-heading">
        <p className="eyebrow">Photo Evidence Analysis</p>
        <h3>What the uploaded photos changed</h3>
        <span>Risk levels come from rep-confirmed tags. Gemini can draft tags, but unaccepted suggestions stay out of scoring and homeowner reports.</span>
      </div>
      <div className="photo-evidence-grid">
        {evidence.map((item) => {
          const photoAnalysis = analysisByPhotoId.get(item.photoId);
          return (
            <article className="photo-evidence-report-card" key={item.photoId}>
              <PhotoEvidenceImage evidence={item} />
              <div>
                <div className="photo-report-title">
                  <strong>{item.caption || "Roof photo evidence"}</strong>
                  {photoAnalysis ? <span className={`risk-chip ${photoAnalysis.riskLevel}`}>{photoRiskLabels[photoAnalysis.riskLevel]}</span> : null}
                </div>
                <span className="photo-file-name" title={item.fileName}>{item.fileName}</span>
                <p className="photo-impact">{photoAnalysis?.summary ?? "Photo included as job context."}</p>
                <p className="photo-impact muted-impact">{photoAnalysis?.reportImpact ?? "No scoring impact recorded."}</p>
                <div className="report-tag-list">
                  {item.observations.length > 0 ? (
                    item.observations.map((flag) => <span key={flag}>{photoTagLabels[flag]}</span>)
                  ) : (
                    <span>No specific observation tagged</span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PhotoEvidenceImage({ evidence }: { evidence: PhotoEvidence }) {
  const [failed, setFailed] = useState(false);

  if (!evidence.previewUrl || failed) {
    return (
      <div className="photo-fallback">
        <ImagePlus size={22} />
        <span>Image not stored</span>
      </div>
    );
  }

  return (
    <img
      src={evidence.previewUrl}
      alt={`Roof photo evidence ${evidence.fileName}`}
      onError={() => setFailed(true)}
    />
  );
}
function TextField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  min = 0,
  max
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        placeholder={placeholder}
      />
    </label>
  );
}

function SegmentedStatus({
  label,
  value,
  onChange
}: {
  label: string;
  value: KnownStatus;
  onChange: (value: KnownStatus) => void;
}) {
  return (
    <div className="segmented-field">
      <span>{label}</span>
      <div className="segmented-control">
        {(["yes", "no", "unknown"] as KnownStatus[]).map((option) => (
          <button
            className={value === option ? "active" : ""}
            key={option}
            type="button"
            aria-label={`${label}: ${option}`}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function SolarOpportunityInputs({
  assumptions,
  pvWattsConfigured,
  onChange
}: {
  assumptions: SolarOpportunityAssumptions;
  pvWattsConfigured: boolean;
  onChange: <K extends keyof SolarOpportunityAssumptions>(key: K, value: SolarOpportunityAssumptions[K]) => void;
}) {
  const estimatedPanels =
    assumptions.usableRoofAreaSqft && assumptions.usableRoofAreaSqft > 0
      ? Math.max(1, Math.floor(assumptions.usableRoofAreaSqft / 21.5))
      : null;
  const estimatedWatts = estimatedPanels ? estimatedPanels * assumptions.panelWattage : null;

  return (
    <section className="solar-input-card">
      <div className="solar-input-heading">
        <div className="section-icon">
          <Sun size={20} />
        </div>
        <div>
          <h3>Solar opportunity inputs</h3>
          <p>
            Estimate solar potential from address-level data plus rep-confirmed roof assumptions. Final design still needs
            site survey, shading review, setbacks, and installer modeling.
          </p>
        </div>
      </div>

      <div className="field-grid">
        <NumberField
          label="Usable roof area"
          value={assumptions.usableRoofAreaSqft}
          onChange={(value) => onChange("usableRoofAreaSqft", value)}
          placeholder="520"
        />
        <label className="field">
          <span>Primary solar roof direction</span>
          <select
            value={assumptions.roofOrientation}
            onChange={(event) => onChange("roofOrientation", event.target.value as RoofOrientation)}
          >
            {Object.entries(roofOrientationLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Roof pitch degrees"
          value={assumptions.roofPitchDegrees}
          onChange={(value) => onChange("roofPitchDegrees", value)}
          placeholder="24"
        />
        <NumberField
          label="Panel wattage"
          value={assumptions.panelWattage}
          onChange={(value) => onChange("panelWattage", value ?? 410)}
          placeholder="410"
        />
      </div>

      <label className="field">
        <span>Shade level</span>
        <select value={assumptions.shadeLevel} onChange={(event) => onChange("shadeLevel", event.target.value as ShadeLevel)}>
          {Object.entries(shadeLevelLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="solar-estimate-preview">
        <span>{estimatedWatts ? `${estimatedWatts.toLocaleString()} W DC estimate` : "Add usable roof area for watt estimate"}</span>
        <span>{estimatedPanels ? `${estimatedPanels} panels assumed` : "Panel count pending"}</span>
        <span>{pvWattsConfigured ? "NREL PVWatts enabled" : "Local estimate until NREL key is added"}</span>
      </div>
    </section>
  );
}

function ReadinessCheckList({ checks }: { checks: string[] }) {
  return (
    <section className="readiness-checks">
      <div>
        <strong>Before sharing</strong>
        <span>{checks.length === 0 ? "Ready for a high-confidence report." : `${checks.length} item${checks.length === 1 ? "" : "s"} to confirm.`}</span>
      </div>
      {checks.length > 0 ? (
        <ul>
          {checks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ReportSection({
  savedReport,
  onCopy,
  onCopyLink,
  onExportCrm,
  isExportingCrm,
  shareLabel,
  hosted,
  readOnly = false,
  stale = false
}: {
  savedReport: SavedReadinessReport;
  onCopy: () => void;
  onCopyLink: () => void;
  onExportCrm: () => void;
  isExportingCrm: boolean;
  shareLabel: string;
  hosted: boolean;
  readOnly?: boolean;
  stale?: boolean;
}) {
  const { report, details, company } = savedReport;
  const theme = statusTheme[report.recommendation.status];

  return (
    <section id="report" className="report-shell">
      <div className="report-toolbar">
        <div>
          <p className="eyebrow">Roof + solar readiness</p>
          <h2>{details.homeownerName || "Homeowner"} - {details.propertyAddress || "Address pending"}</h2>
        </div>
      </div>

      <article className="report-card">
        {savedReport.sample || savedReport.id.startsWith("demo-") ? <p className="sample-label">Sample report</p> : null}

        <section id="report-decision" className="report-part report-decision" aria-labelledby="report-decision-title">
          <ReportPartLabel id="report-decision-title" number="01" title="Decision" note="The call, and how sure it is." />
          <div className="report-part-body">
            <div className="report-hero">
              <div>
                <span className={`status-badge ${theme.tone}`}>
                  {theme.icon}
                  {formatRecommendationStatus(report.recommendation.status)}
                </span>
                <h3>{report.recommendation.label}</h3>
                <p>Based on provided job details and confirmed observations. Final scope requires a qualified roof professional.</p>
              </div>
              <div className="confidence-card">
                <span>Confidence</span>
                <strong>{report.recommendation.confidence}</strong>
                <p>{report.recommendation.confidenceRationale}</p>
              </div>
            </div>

            <div className="report-meta">
              <span>{report.assessmentMode === "vision-assisted" ? "Vision-assisted" : "Rule-based from provided inputs"}</span>
              <span>{savedReport.photoCount} photo{savedReport.photoCount === 1 ? "" : "s"} referenced</span>
              <span>Generated {formatDate(savedReport.createdAt)}</span>
            </div>
          </div>
        </section>

        <nav className="report-index" aria-label="Report sections">
          <a href="#report-decision"><span>01</span>Decision</a>
          <a href="#report-evidence"><span>02</span>Evidence</a>
          <a href="#report-assumptions"><span>03</span>Assumptions</a>
          <a href="#report-next-step"><span>04</span>Next step</a>
        </nav>
        <div className="toolbar-actions report-actions" aria-label="Report actions">
          {!readOnly ? <>
            <button className="button secondary" type="button" onClick={onCopy} disabled={stale}><Clipboard size={17} />Copy summary</button>
            <button className="button secondary" type="button" onClick={onCopyLink} disabled={stale}><Share2 size={17} />{shareLabel}</button>
            <button className="button secondary" type="button" onClick={onExportCrm} disabled={isExportingCrm || stale}>{isExportingCrm ? <Loader2 size={17} className="spin" /> : <FileDown size={17} />}CRM CSV</button>
          </> : null}
          <button className="button secondary" type="button" onClick={() => window.print()} disabled={stale}><Printer size={17} />Print report</button>
        </div>
        <header className="report-brand">
          <div>
            <span>{company.companyName || "Company name pending"}</span>
            <strong>Roof/Solar Readiness Report</strong>
          </div>
          <div>
            {company.repName ? <span>{company.repName}</span> : null}
            {company.phone ? <span>{company.phone}</span> : null}
            {company.email ? <span>{company.email}</span> : null}
          </div>
        </header>

        <section id="report-evidence" className="report-part" aria-labelledby="report-evidence-title">
          <ReportPartLabel id="report-evidence-title" number="02" title="Evidence" note="Scores, photos and the rules behind them." />
          <div className="report-part-body">
            <ScoreBoard scores={report.scores} />

            <div className="report-grid">
              <ReportBlock title="Key observations" items={report.keyObservations} />
              <ReportBlock title="Roof risk factors" items={report.roofRiskFactors} />
            </div>

            <PhotoEvidenceReport evidence={report.photoEvidence ?? []} analysis={report.photoAnalysis ?? []} />

            <AnalysisTraceReport report={report} />
          </div>
        </section>

        <section id="report-assumptions" className="report-part" aria-labelledby="report-assumptions-title">
          <ReportPartLabel id="report-assumptions-title" number="03" title="Assumptions" note="What the solar view takes as given." />
          <div className="report-part-body">
            <SolarOpportunityReport estimate={report.solarOpportunity} />

            <div className="report-grid">
              <ReportBlock title="Solar readiness factors" items={report.solarReadinessFactors} />
            </div>
          </div>
        </section>

        <section id="report-next-step" className="report-part" aria-labelledby="report-next-step-title">
          <ReportPartLabel id="report-next-step-title" number="04" title="Next step" note="What to do, and what to ask." />
          <div className="report-part-body">
            <div className="next-action">
              <div>
                <p className="eyebrow">Next step</p>
                <h3>{homeownerNextStep(report.recommendation.status)}</h3>
              </div>
            </div>

            <div className="report-grid">
              <ReportBlock title="Questions to ask homeowner" items={report.questionsToAsk} />
            </div>
          </div>
        </section>

        {!readOnly ? <details className="rep-briefing internal-only">
          <summary><BriefcaseBusiness size={18} />Rep briefing <span>Internal / excluded from print and shared reports</span></summary>
          <div className="rep-briefing-content">
            <h3>{report.recommendation.recommendedSalesPath}</h3>
            <p>{report.suggestedTalkTrack}</p>
            <p><strong>Next sales action:</strong> {report.recommendation.nextBestAction}</p>
            <p><strong>Lead quality:</strong> {report.leadQualityScore}/100</p>
            {details.repNotes ? <p><strong>Rep notes:</strong> {details.repNotes}</p> : null}
            <AuditTrailReport events={savedReport.auditTrail ?? []} hosted={hosted} />
          </div>
        </details> : null}

        <p className="disclaimer">{report.disclaimer}</p>
        {company.licenseNote ? <p className="company-note">{company.licenseNote}</p> : null}
        <div className="report-colophon"><span className="brand-lockup"><Brand /></span><span>Pre-appointment readiness</span></div>
      </article>
    </section>
  );
}

function ReportPartLabel({ id, number, title, note }: { id: string; number: string; title: string; note: string }) {
  return (
    <div className="report-part-label">
      <span>{number}</span>
      <h2 id={id}>{title}</h2>
      <p>{note}</p>
    </div>
  );
}

function AnalysisTraceReport({ report }: { report: ReadinessReport }) {
  if (!report.analysisTrace?.length) return null;

  return (
    <section className="trace-card">
      <div className="report-section-heading">
        <p className="eyebrow">Why this answer</p>
        <h3>Decision trace</h3>
        <span>Each report shows which inputs, APIs, and rules shaped the recommendation.</span>
      </div>
      <div className="trace-grid">
        {report.analysisTrace.map((item) => (
          <article className="trace-item" key={`${item.label}-${item.source}`}>
            <span>{item.source}</span>
            <strong>{item.label}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AuditTrailReport({ events, hosted }: { events: ReportAuditEvent[]; hosted: boolean }) {
  const visibleEvents = events.length
    ? events
    : [
        {
          id: "audit-placeholder",
          timestamp: new Date().toISOString(),
          actor: "Roof Signal",
          action: "Audit trail unavailable for older report",
          detail: "Generate the report again to attach source, scoring, storage, and export audit events."
        }
      ];

  return (
    <section className="audit-card">
      <div className="report-section-heading">
        <p className="eyebrow">Audit Trail</p>
        <h3>Report provenance and controls</h3>
        <span>{hosted ? "Hosted reports keep this audit trail in the company workspace." : "Demo/local reports keep this audit trail in the saved report payload."}</span>
      </div>
      <div className="audit-list">
        {visibleEvents.slice(0, 6).map((event) => (
          <div className="audit-row" key={event.id}>
            <span>{formatDate(event.timestamp)}</span>
            <strong>{event.action}</strong>
            <p>{event.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportPlaceholder({ visionConfigured }: { visionConfigured: boolean }) {
  return (
    <section className="report-shell">
      <div className="report-placeholder">
        <div className="section-icon">
          <FileDown size={20} />
        </div>
        <div>
          <p className="eyebrow">No report yet</p>
          <h2>Add the job details, confirm the limits, then generate the report.</h2>
          <p>
            You will get the decision, the evidence and scores behind it, the assumptions, and a next step with questions for the homeowner.
            It prints, copies and exports to CSV, and carries the pre-appointment disclaimer.
          </p>
          <span className="pill muted">
            {visionConfigured ? "Vision flag enabled - confirmation required" : "Rule-based report - Gemini suggestions optional"}
          </span>
        </div>
      </div>
    </section>
  );
}

function SolarOpportunityReport({ estimate }: { estimate?: SolarOpportunityEstimate }) {
  if (!estimate) return null;

  const maxMonthlyProduction = Math.max(...estimate.monthlyProductionKwh, 1);

  return (
    <section className="solar-report-card">
      <div className="solar-report-header">
        <div>
          <p className="eyebrow">Solar Opportunity</p>
          <h3>{estimate.source === "nrel-pvwatts" ? "NREL PVWatts production estimate" : "Preliminary local solar estimate"}</h3>
          <span>
            Score {estimate.solarScore}/100 · {estimate.confidence} confidence ·{" "}
            {estimate.geocode.status === "matched" ? "Address matched" : "Address-level data pending"}
          </span>
        </div>
        <div className="solar-score">
          <Sun size={20} />
          <strong>{estimate.solarScore}</strong>
          <span>Solar score</span>
        </div>
      </div>

      <div className="solar-kpi-grid">
        <SolarKpi label="System size" value={estimate.systemCapacityKw ? `${estimate.systemCapacityKw} kW DC` : "Pending"} />
        <SolarKpi label="Estimated watts" value={estimate.estimatedDcWatts ? `${estimate.estimatedDcWatts.toLocaleString()} W` : "Pending"} />
        <SolarKpi label="Annual production" value={estimate.annualProductionKwh ? `${estimate.annualProductionKwh.toLocaleString()} kWh` : "Pending"} />
        <SolarKpi label="Panels assumed" value={estimate.panelCount ? String(estimate.panelCount) : "Pending"} />
      </div>

      <div className="solar-detail-grid">
        <div>
          <h4>Roof assumptions</h4>
          <ul>
            <li>Usable area: {estimate.usableRoofAreaSqft ? `${estimate.usableRoofAreaSqft.toLocaleString()} sq ft` : "Pending"}</li>
            <li>Direction: {roofOrientationLabels[estimate.roofOrientation]}</li>
            <li>Pitch: {estimate.roofPitchDegrees ?? 20} degrees</li>
            <li>Shade: {shadeLevelLabels[estimate.shadeLevel]}</li>
          </ul>
        </div>
        <div>
          <h4>Data source</h4>
          <ul>
            <li>{estimate.source === "nrel-pvwatts" ? "NREL PVWatts API" : "Local fallback model"}</li>
            <li>{estimate.geocode.matchedAddress ?? estimate.geocode.message ?? "Coordinates not available"}</li>
            <li>
              {estimate.sunHoursPerDay
                ? `${estimate.sunHoursPerDay.toFixed(1)} kWh/m2/day solar resource`
                : "Sun resource available when PVWatts returns data"}
            </li>
            <li>
              {estimate.capacityFactorPercent
                ? `${estimate.capacityFactorPercent}% estimated capacity factor`
                : "Capacity factor pending"}
            </li>
          </ul>
        </div>
      </div>

      <div className="solar-explain">
        <strong>Why this estimate looks this way</strong>
        <p>
          {estimate.source === "nrel-pvwatts"
            ? "Roof Signal sent the matched address coordinates, assumed system size, roof direction, pitch, and standard losses to NREL PVWatts. PVWatts returned the monthly and annual production estimate; roof area, shade, setbacks, and final layout still need field confirmation."
            : "Roof Signal used a local fallback model because a signed-in PVWatts result was not available for this report. The estimate applies the rep-entered usable area, panel wattage, roof direction, pitch, and shade assumptions."}
        </p>
      </div>

      {estimate.monthlyProductionKwh.length > 0 ? (
        <div className="monthly-solar-chart" aria-label="Estimated monthly solar production">
          {estimate.monthlyProductionKwh.map((value, index) => (
            <div className="monthly-solar-bar" key={monthLabels[index]}>
              <span style={{ height: `${Math.max(12, (value / maxMonthlyProduction) * 100)}%` }} />
              <small>{monthLabels[index]}</small>
            </div>
          ))}
        </div>
      ) : null}

      <div className="solar-notes-grid">
        <ReportBlock title="Solar assumptions" items={estimate.assumptions} />
        <ReportBlock title="Solar estimate cautions" items={estimate.warnings.length ? estimate.warnings : ["No estimate cautions entered."]} />
      </div>
    </section>
  );
}

function SolarKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="solar-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScoreBoard({ scores }: { scores: RoofRiskScores }) {
  const scoreItems = [
    { label: "Roof age risk", value: scores.roofAgeRisk, polarity: "risk" },
    { label: "Visible condition risk", value: scores.visibleConditionRisk, polarity: "risk" },
    { label: "Leak risk", value: scores.leakRisk, polarity: "risk" },
    { label: "Solar readiness", value: scores.solarReadiness, polarity: "positive" },
    { label: "Urgency", value: scores.urgency, polarity: "risk" },
    { label: "Data completeness", value: scores.dataCompleteness, polarity: "positive" }
  ];

  return (
    <section className="score-board">
      {scoreItems.map((item, index) => (
        <div className="score-item" key={item.label} style={{ "--i": index } as CSSProperties}>
          <div className="score-label">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
          <div className="score-track">
            <span className={item.polarity === "positive" ? "positive" : "risk"} style={{ "--v": Math.min(Math.max(item.value, 0), 100) / 100 } as CSSProperties} />
          </div>
        </div>
      ))}
    </section>
  );
}

function ReportBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="report-block">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function getReadinessChecks(
  photos: UploadedPhoto[],
  details: PropertyDetails,
  solarAssumptions: SolarOpportunityAssumptions,
  photoEvidence: PhotoEvidence[]
): string[] {
  const checks: string[] = [];
  const unconfirmedSuggestions = photoEvidence.filter((item) => item.source === "vision-suggested").length;

  if (photos.length === 0) checks.push("Add roof photos or expect low confidence.");
  if (!details.homeownerName.trim()) checks.push("Add homeowner name for a shareable report.");
  if (!details.propertyAddress.trim()) checks.push("Add property address for report context.");
  if (details.roofAgeYears === null) checks.push("Confirm estimated roof age.");
  if (details.roofMaterial === "unknown") checks.push("Confirm roof material/type.");
  if (details.knownLeaks === "unknown") checks.push("Confirm leak history.");
  if (details.desiredOutcome === "unknown") checks.push("Confirm desired outcome.");
  if (details.visibleConditionFlags.includes("limited-or-unclear-photos")) checks.push("Replace unclear photos or keep inspection-first confidence.");
  if (!solarAssumptions.usableRoofAreaSqft) checks.push("Add usable roof area for solar wattage and production estimate.");
  if (solarAssumptions.roofOrientation === "unknown") checks.push("Confirm primary solar roof direction.");
  if (solarAssumptions.shadeLevel === "unknown") checks.push("Confirm shade level for solar score.");
  if (unconfirmedSuggestions > 0) {
    checks.push(`Accept, edit, or reject ${unconfirmedSuggestions} Gemini photo suggestion${unconfirmedSuggestions === 1 ? "" : "s"} before sharing.`);
  }

  return checks;
}

function createPhotoEvidence(photo: UploadedPhoto): PhotoEvidence {
  return {
    photoId: photo.id,
    fileName: photo.fileName,
    previewUrl: photo.previewUrl,
    caption: getDefaultPhotoCaption(photo.fileName),
    observations: [],
    source: "rep-entered"
  };
}

function clonePhotoEvidence(evidence: PhotoEvidence): PhotoEvidence {
  return {
    ...evidence,
    observations: [...evidence.observations]
  };
}

function syncPhotoEvidenceForPhotos(photos: UploadedPhoto[], evidence: PhotoEvidence[]): PhotoEvidence[] {
  const evidenceByPhotoId = new Map(evidence.map((item) => [item.photoId, item]));

  return photos.map((photo) => {
    const existing = evidenceByPhotoId.get(photo.id);

    return {
      photoId: photo.id,
      fileName: photo.fileName,
      previewUrl: existing?.previewUrl ?? photo.previewUrl,
      storageKey: existing?.storageKey,
      caption: existing?.caption ?? getDefaultPhotoCaption(photo.fileName),
      observations: [...(existing?.observations ?? [])],
      source: existing?.source ?? "rep-entered"
    };
  });
}

function mergeVisionSuggestions(
  photos: UploadedPhoto[],
  currentEvidence: PhotoEvidence[],
  suggestions: VisionPhotoEvidenceSuggestion[]
): PhotoEvidence[] {
  const evidenceByPhotoId = new Map(currentEvidence.map((item) => [item.photoId, item]));
  const suggestionsByPhotoId = new Map(suggestions.map((suggestion) => [suggestion.photoId, suggestion]));

  return photos.map((photo) => {
    const current = evidenceByPhotoId.get(photo.id) ?? createPhotoEvidence(photo);
    const suggestion = suggestionsByPhotoId.get(photo.id);

    if (!suggestion) return current;

    const hasRepConfirmedInput =
      current.source === "rep-entered" &&
      (current.observations.length > 0 || current.caption.trim() !== getDefaultPhotoCaption(photo.fileName));

    if (hasRepConfirmedInput) return current;

    return {
      ...current,
      caption: suggestion.caption.trim() || current.caption,
      observations: [...suggestion.observations],
      source: "vision-suggested"
    };
  });
}

function getReportablePhotoEvidence(evidence: PhotoEvidence[]): PhotoEvidence[] {
  return evidence.filter((item) => item.source !== "vision-suggested");
}

function getDefaultPhotoCaption(fileName: string): string {
  const cleanName = fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleanName ? `Roof photo: ${cleanName}` : "Roof photo uploaded for readiness review.";
}

function addConditionFlagToDetails(details: PropertyDetails, flag: VisibleConditionFlag): PropertyDetails {
  if (details.visibleConditionFlags.includes(flag)) return details;

  if (flag === "no-obvious-damage") {
    return {
      ...details,
      visibleConditionFlags: ["no-obvious-damage"]
    };
  }

  return {
    ...details,
    visibleConditionFlags: [
      ...details.visibleConditionFlags.filter(
        (item) => item !== "no-obvious-damage" && (flag === "limited-or-unclear-photos" || item !== "limited-or-unclear-photos")
      ),
      flag
    ]
  };
}

function applyPhotoEvidenceToDetails(details: PropertyDetails, evidence: PhotoEvidence[]): PropertyDetails {
  const observations = Array.from(new Set(evidence.flatMap((item) => item.observations)));
  const riskObservations = observations.filter((flag) => flag !== "no-obvious-damage");

  if (riskObservations.length > 0) {
    return riskObservations.reduce((current, flag) => addConditionFlagToDetails(current, flag), details);
  }

  if (observations.includes("no-obvious-damage")) {
    return addConditionFlagToDetails(details, "no-obvious-damage");
  }

  return details;
}

function getGuidedDemoCompanyProfile(profile: CompanyProfile): CompanyProfile {
  const companyName = profile.companyName.trim();

  return {
    companyName:
      companyName && companyName !== defaultCompanyProfile.companyName
        ? companyName
        : guidedDemoCompanyProfile.companyName,
    repName: profile.repName.trim() || guidedDemoCompanyProfile.repName,
    phone: profile.phone.trim() || guidedDemoCompanyProfile.phone,
    email: profile.email.trim() || guidedDemoCompanyProfile.email,
    licenseNote: profile.licenseNote.trim() || guidedDemoCompanyProfile.licenseNote
  };
}

function stripSessionPhotoUrls(report: SavedReadinessReport): SavedReadinessReport {
  return {
    ...report,
    report: {
      ...report.report,
      photoEvidence: report.report.photoEvidence.map((item) => ({
        ...item,
        previewUrl: item.previewUrl?.startsWith("blob:") ? undefined : item.previewUrl
      }))
    }
  };
}

function buildDashboardStats(reports: SavedReadinessReport[]) {
  const now = new Date();
  const reportsThisMonth = reports.filter((report) => {
    const createdAt = new Date(report.createdAt);
    return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
  }).length;
  const bundleOpportunities = reports.filter(
    (report) =>
      report.report.recommendation.status === "replacement-first" ||
      report.report.recommendation.status === "repair-first" ||
      report.details.desiredOutcome === "roof-and-solar"
  ).length;
  const averageLeadQuality =
    reports.length === 0
      ? 0
      : Math.round(reports.reduce((sum, report) => sum + report.report.leadQualityScore, 0) / reports.length);

  return { reportsThisMonth, bundleOpportunities, averageLeadQuality };
}

function buildSavedReport(
  report: ReadinessReport,
  details: PropertyDetails,
  photos: UploadedPhoto[],
  company: CompanyProfile,
  options: { storageMode?: "demo" | "local" | "hosted"; solarAssumptions?: SolarOpportunityAssumptions; sample?: boolean } = {}
): SavedReadinessReport {
  const createdAt = report.generatedAt;
  const storageMode = options.storageMode ?? "local";

  return {
    id: createId(),
    title: `${details.homeownerName || "Homeowner"} - ${details.propertyAddress || "Address pending"}`,
    createdAt,
    details,
    report,
    company,
    solarAssumptions: options.solarAssumptions ? { ...options.solarAssumptions } : undefined,
    sample: storageMode === "demo" || Boolean(options.sample),
    photoCount: photos.length,
    photoNames: photos.map((photo) => photo.fileName),
    auditTrail: buildReportAuditTrail(report, details, company, storageMode)
  };
}

function buildReportAuditTrail(
  report: ReadinessReport,
  details: PropertyDetails,
  company: CompanyProfile,
  storageMode: "demo" | "local" | "hosted"
): ReportAuditEvent[] {
  const actor = company.repName || company.email || "Roof Signal user";
  const generatedAt = report.generatedAt;
  const taggedPhotoAnalysisCount = report.photoAnalysis.filter((item) => item.observations.length > 0).length;
  const storageDetail =
    storageMode === "hosted"
      ? "Saved to AWS with company-scoped DynamoDB records, private S3 photo storage, 90-day retention, and 30-day share link policy."
      : storageMode === "demo"
      ? "Generated from the guided demo dataset; report is not a professional inspection or production solar design."
      : "Saved to browser local storage for demo use; sign in to use hosted company-separated storage.";

  return [
    {
      id: `${report.generatedAt}-generated`,
      timestamp: generatedAt,
      actor,
      action: "Report generated",
      detail: `${details.homeownerName || "Homeowner"} report generated with ${report.assessmentMode} assessment mode.`
    },
    {
      id: `${report.generatedAt}-photo-evidence`,
      timestamp: generatedAt,
      actor,
      action: "Photo evidence applied",
      detail: `${report.photoEvidence.length} uploaded photo${report.photoEvidence.length === 1 ? "" : "s"} and ${taggedPhotoAnalysisCount} tagged photo analysis item${taggedPhotoAnalysisCount === 1 ? "" : "s"} were included.`
    },
    {
      id: `${report.generatedAt}-recommendation`,
      timestamp: generatedAt,
      actor: "Roof Signal scoring",
      action: "Recommendation calculated",
      detail: `${report.recommendation.label} selected from total roof risk ${report.scores.totalRisk}/100 and solar readiness ${report.scores.solarReadiness}/100.`
    },
    {
      id: `${report.generatedAt}-solar-source`,
      timestamp: generatedAt,
      actor: "Roof Signal solar estimate",
      action: "Solar source recorded",
      detail: report.solarOpportunity
        ? `${report.solarOpportunity.source === "nrel-pvwatts" ? "NREL PVWatts" : "Local fallback"} estimate saved with ${report.solarOpportunity.confidence} confidence.`
        : "No solar production estimate was attached."
    },
    {
      id: `${report.generatedAt}-storage`,
      timestamp: generatedAt,
      actor: "Roof Signal workspace",
      action: "Storage policy attached",
      detail: storageDetail
    }
  ];
}

function buildClipboardSummary(report: ReadinessReport, details: PropertyDetails, company: CompanyProfile): string {
  const photoEvidence = report.photoEvidence ?? [];
  const photoEvidenceLines = photoEvidence.length
    ? [
        "Photo evidence:",
        ...photoEvidence.map((item) => {
          const tags = item.observations.length
            ? item.observations.map((flag) => photoTagLabels[flag]).join(", ")
            : "No specific observation tagged";
          return `- ${item.caption || item.fileName}: ${tags}`;
        })
      ]
    : [];
  const solarOpportunityLines = report.solarOpportunity
    ? [
        "Solar opportunity:",
        `- Source: ${report.solarOpportunity.source === "nrel-pvwatts" ? "NREL PVWatts" : "Local assumption model"}`,
        `- Solar score: ${report.solarOpportunity.solarScore}/100 (${report.solarOpportunity.confidence} confidence)`,
        `- System size: ${report.solarOpportunity.systemCapacityKw ? `${report.solarOpportunity.systemCapacityKw} kW DC` : "Pending"}`,
        `- Annual production: ${report.solarOpportunity.annualProductionKwh ? `${report.solarOpportunity.annualProductionKwh.toLocaleString()} kWh` : "Pending"}`
      ]
    : [];

  return [
    `${company.companyName || "Roof Signal"} Readiness Report`,
    `Homeowner: ${details.homeownerName || "Pending"}`,
    `Property: ${details.propertyAddress || "Pending"}`,
    `Status: ${formatRecommendationStatus(report.recommendation.status)}`,
    `Confidence: ${report.recommendation.confidence}`,
    `Next step: ${homeownerNextStep(report.recommendation.status)}`,
    ...solarOpportunityLines,
    ...photoEvidenceLines,
    `Disclaimer: ${report.disclaimer}`
  ].join("\n");
}

function buildCrmCsv(savedReport: SavedReadinessReport): string {
  const recommendation = savedReport.report.recommendation;
  const row = [
    savedReport.id,
    savedReport.createdAt,
    savedReport.details.homeownerName,
    savedReport.details.propertyAddress,
    recommendation.status,
    recommendation.confidence,
    String(savedReport.report.leadQualityScore),
    recommendation.recommendedSalesPath,
    recommendation.nextBestAction,
    savedReport.company.repName,
    savedReport.company.email,
    savedReport.company.companyName
  ];

  return [
    [
      "report_id",
      "created_at",
      "homeowner_name",
      "property_address",
      "status",
      "confidence",
      "lead_quality_score",
      "recommended_sales_path",
      "next_best_action",
      "rep_name",
      "rep_email",
      "company"
    ].join(","),
    row.map(csvCell).join(",")
  ].join("\n");
}

function homeownerNextStep(status: RecommendationStatus): string {
  return status === "solar-ready"
    ? "Confirm roof condition and site measurements before solar design."
    : status === "repair-first"
    ? "Review roof repairs with a qualified professional before solar."
    : status === "replacement-first"
    ? "Review roof replacement timing before planning solar."
    : "Arrange an in-person roof review before choosing a project scope.";
}

function scrollToSection(id: string) {
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  document.getElementById(id)?.scrollIntoView({ behavior, block: "start" });
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `report-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clonePropertyDetails(details: PropertyDetails): PropertyDetails {
  return {
    ...details,
    visibleConditionFlags: [...details.visibleConditionFlags]
  };
}

function setReportUrl(reportId: string) {
  const url = new URL(window.location.href);
  url.searchParams.delete("demo");
  url.searchParams.delete("blank");
  url.searchParams.set("report", reportId);
  url.hash = "report";
  window.history.replaceState({}, "", url);
}

function setDemoUrl(scenarioId: string) {
  const url = new URL(window.location.href);
  url.searchParams.delete("report");
  url.searchParams.delete("blank");
  url.searchParams.set("demo", scenarioId);
  url.hash = "report";
  window.history.replaceState({}, "", url);
}

function clearReportUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("report")) return;
  url.searchParams.delete("report");
  window.history.replaceState({}, "", url);
}

function clearAppUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("report");
  url.searchParams.delete("demo");
  url.searchParams.set("blank", "1");
  url.hash = "workflow";
  window.history.replaceState({}, "", url);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export default App;
