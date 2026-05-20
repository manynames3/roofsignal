import { ChangeEvent, DragEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  FileText,
  FileDown,
  FolderOpen,
  Home,
  ImagePlus,
  Info,
  LockKeyhole,
  MessageSquareWarning,
  Printer,
  Route,
  Save,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  Zap
} from "lucide-react";
import { demoScenarios, type DemoScenario } from "./demoData";
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
  defaultCompanyProfile,
  deleteReport,
  findSavedReport,
  loadCompanyProfile,
  loadSavedReports,
  saveCompanyProfile,
  saveReport
} from "./lib/storage";
import { isVisionAnalysisConfigured } from "./lib/visionAnalysisProvider";
import type {
  CompanyProfile,
  KnownStatus,
  PhotoEvidence,
  PropertyDetails,
  ReadinessReport,
  RecommendationStatus,
  RoofRiskScores,
  SavedReadinessReport,
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

const statusTheme: Record<RecommendationStatus, { tone: string; icon: ReactNode }> = {
  "solar-ready": { tone: "success", icon: <CheckCircle2 size={18} /> },
  "repair-first": { tone: "warning", icon: <ShieldCheck size={18} /> },
  "replacement-first": { tone: "danger", icon: <AlertTriangle size={18} /> },
  "inspection-first": { tone: "neutral", icon: <Info size={18} /> }
};

const defaultDemoScenarioId = "replacement-first";

function App() {
  if (window.location.pathname.startsWith("/app")) {
    return <ReadinessApp />;
  }

  return <LandingPage />;
}

function LandingPage() {
  return (
    <div className="landing-shell">
      <header className="landing-topbar">
        <a className="brand-lockup" href="/" aria-label="RoofSignal home">
          <div className="brand-mark">
            <Home size={22} />
          </div>
          <div>
            <p className="eyebrow">RoofSignal</p>
            <strong>Roof/Solar Readiness Agent</strong>
          </div>
        </a>
        <nav className="landing-nav" aria-label="Landing page navigation">
          <a href="#problem">Problem</a>
          <a href="#how-it-works">How it works</a>
          <a href="#faq">FAQ</a>
          <a className="button secondary" href="/app">
            Open live demo
          </a>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="eyebrow">For roof + solar sales teams</span>
            <h1>Stop pitching solar before you know if the roof changes the sale.</h1>
            <p>
              RoofSignal helps reps turn roof photos and basic job details into a pre-appointment readiness report:
              solar-first, roof tune-up first, replacement-first, or inspection-first.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="/app">
                Launch prefilled demo
                <ArrowRight size={18} />
              </a>
              <a className="button ghost" href="/app?blank=1#workflow">
                Start blank report
              </a>
            </div>
            <div className="promise-strip">
              <CheckCircle2 size={18} />
              <span>One clear sales path before the appointment, with transparent rule-based scoring and homeowner-safe language.</span>
            </div>
          </div>
          <div className="landing-product-card" aria-label="Product preview">
            <div className="preview-header">
              <span>Generated readiness report</span>
              <strong>Roof replacement should be discussed before solar</strong>
            </div>
            <div className="preview-score-grid">
              <PreviewScore label="Roof age risk" value="76" tone="risk" />
              <PreviewScore label="Leak risk" value="88" tone="risk" />
              <PreviewScore label="Lead quality" value="90" tone="positive" />
            </div>
            <div className="preview-guidance">
              <span>Next best action</span>
              <p>Schedule an in-person roof inspection and prepare a roof + solar bundle option.</p>
            </div>
          </div>
        </section>

        <section id="problem" className="landing-section split-section">
          <div>
            <p className="eyebrow">The broken workflow</p>
            <h2>Reps walk into appointments with photos, guesses, and no consistent sales path.</h2>
          </div>
          <div className="pain-list">
            <PainItem title="Solar gets pitched before roof timing is clear" text="That creates awkward homeowner conversations when the roof later needs work." />
            <PainItem title="Roof concerns live in scattered notes" text="A few photos, a text thread, and a memory of a leak are not enough for a repeatable process." />
            <PainItem title="Bundle opportunities are easy to miss" text="Older roofs and moderate repair needs should shape the offer before the rep quotes solar-only." />
          </div>
        </section>

        <section className="landing-section solution-section">
          <p className="eyebrow">The product</p>
          <h2>A readiness report that tells the rep what conversation to lead with.</h2>
          <div className="solution-grid">
            <SolutionCard icon={<UploadCloud size={22} />} title="Collect the roof context" text="Upload roof photos and enter age, material, leak history, existing solar, utility bill status, and homeowner goal." />
            <SolutionCard icon={<BarChart3 size={22} />} title="Score the risk openly" text="Roof age, visible condition, leak risk, urgency, solar readiness, data completeness, and lead quality are scored in plain view." />
            <SolutionCard icon={<MessageSquareWarning size={22} />} title="Give the rep a safer script" text="The report includes what to say, what to avoid saying, next best action, and bundle positioning." />
          </div>
        </section>

        <section className="landing-section benefits-section">
          <p className="eyebrow">Why teams use it</p>
          <h2>Built around the sales decision that actually matters.</h2>
          <div className="benefit-grid">
            <BenefitCard title="Avoid bad sequencing" text="Do not sell a solar-first story when the roof should shape the project scope." />
            <BenefitCard title="Increase bundle clarity" text="Flag roof + solar opportunities before the appointment instead of discovering them late." />
            <BenefitCard title="Standardize rep judgment" text="Give new and experienced reps the same triage language and scoring structure." />
            <BenefitCard title="Reduce trust risk" text="Use cautious homeowner-safe language that does not pretend to replace an inspection." />
          </div>
        </section>

        <section id="how-it-works" className="landing-section how-section">
          <p className="eyebrow">How it works</p>
          <h2>Three steps before the rep walks in.</h2>
          <div className="steps-grid">
            <StepCard number="1" title="Upload roof photos" text="Use slope, shingles, valleys, gutters, flashing, wide exterior, and interior stain photos when available." />
            <StepCard number="2" title="Add job details" text="Enter roof age, material, leak status, existing solar, utility bill status, homeowner goal, and rep notes." />
            <StepCard number="3" title="Generate the report" text="Save a branded readiness report with scores, sales path, homeowner questions, next action, and print export." />
          </div>
        </section>

        <section className="landing-section usecase-section">
          <p className="eyebrow">Use cases</p>
          <h2>Specific moments where this earns its keep.</h2>
          <div className="usecase-grid">
            <UseCase title="Pre-qualify solar appointments" text="Know if solar-first is reasonable before the rep starts savings and system-size conversations." />
            <UseCase title="Prepare roof + solar bundle offers" text="Identify older roofs, leaks, and visible wear that should lead to a bundled conversation." />
            <UseCase title="Train appointment setters" text="Give setters a structured way to collect roof context before handing the appointment to sales." />
            <UseCase title="Create a homeowner-facing handoff" text="Print or copy a report that explains the tradeoff without fearmongering." />
          </div>
        </section>

        <section className="landing-section differentiation-section">
          <p className="eyebrow">Why not the usual workaround?</p>
          <h2>Generic tools do not give reps a roof/solar sales path.</h2>
          <div className="objection-grid">
            <Objection title="ChatGPT" text="It can draft text, but it does not enforce a repeatable roof/solar scoring workflow or sales-path output." />
            <Objection title="Spreadsheets" text="They can store fields, but they do not produce a homeowner-ready report, talk track, and next-best-action." />
            <Objection title="Zapier or n8n" text="They move data between tools. They do not decide whether the rep should lead solar, repair, replacement, or inspection." />
            <Objection title="Manual review" text="It depends on the rep. RoofSignal makes the triage consistent enough to review, train, and improve." />
          </div>
        </section>

        <section className="landing-section trust-section">
          <div>
            <p className="eyebrow">Trust boundaries</p>
            <h2>Clear about what it does and what it does not do.</h2>
          </div>
          <div className="trust-grid">
            <TrustItem icon={<ShieldCheck size={21} />} title="Rule-based MVP today" text="Recommendations come from transparent scoring, not hidden or fake AI results." />
            <TrustItem icon={<LockKeyhole size={21} />} title="Client-side pilot mode" text="Saved reports and branding are stored in this browser for demos. Hosted accounts are not built yet." />
            <TrustItem icon={<FileText size={21} />} title="No inspection claim" text="Reports are pre-appointment triage and do not replace a licensed roofer, engineer, inspector, utility, or permitting authority." />
          </div>
        </section>

        <section className="landing-section access-section">
          <div>
            <p className="eyebrow">Access</p>
            <h2>Use the builder now, or request a paid pilot when hosted reports are ready.</h2>
            <p>
              Billing is not live in this repo. The right next commercial step is a small paid pilot with branded reports,
              saved history, and hosted share links.
            </p>
          </div>
          <div className="access-actions">
            <a className="button primary" href="/app">
              Launch prefilled demo
              <ArrowRight size={18} />
            </a>
            <a className="button secondary" href="/app?blank=1#workflow">
              Start blank report
            </a>
          </div>
        </section>

        <section id="faq" className="landing-section faq-section">
          <p className="eyebrow">FAQ</p>
          <h2>Questions a sales manager will ask.</h2>
          <div className="faq-grid">
            <FaqItem title="Who is this for?" text="Residential roofing, solar, and roof+solar teams that need a consistent pre-appointment triage workflow." />
            <FaqItem title="What setup is required?" text="For the current MVP, no account is required. Open the builder, load a demo or upload photos, enter job details, and generate a local report." />
            <FaqItem title="Is my data safe?" text="The current demo stores saved reports in the browser local storage. Do not treat it as production storage for sensitive homeowner data until backend privacy controls are added." />
            <FaqItem title="What does this replace?" text="It replaces loose pre-appointment notes, inconsistent rep judgment, and manual roof/solar sales-path checklists." />
            <FaqItem title="What does it not do yet?" text="It does not provide hosted accounts, cross-device report links, billing, CRM sync, or licensed inspection conclusions." />
            <FaqItem title="How is this different from generic AI tools?" text="It is a specific workflow with constrained outputs, sales guidance, transparent scores, and homeowner-safe disclaimers." />
          </div>
        </section>
      </main>
    </div>
  );
}

function PreviewScore({ label, value, tone }: { label: string; value: string; tone: "risk" | "positive" }) {
  return (
    <div className="preview-score">
      <span>{label}</span>
      <strong>{value}</strong>
      <div className="score-track">
        <span className={tone} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function PainItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="pain-item">
      <AlertTriangle size={20} />
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function SolutionCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="landing-card">
      <div className="section-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function BenefitCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="benefit-card">
      <CheckCircle2 size={20} />
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function StepCard({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <article className="step-card">
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function UseCase({ title, text }: { title: string; text: string }) {
  return (
    <article className="usecase-card">
      <CalendarCheck size={20} />
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function Objection({ title, text }: { title: string; text: string }) {
  return (
    <article className="objection-card">
      <Route size={20} />
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function TrustItem({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="trust-item">
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
    <article className="faq-item">
      <ClipboardCheck size={19} />
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </article>
  );
}

function ReadinessApp() {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [photoEvidence, setPhotoEvidence] = useState<PhotoEvidence[]>([]);
  const [details, setDetails] = useState<PropertyDetails>(emptyPropertyDetails);
  const [company, setCompany] = useState<CompanyProfile>(defaultCompanyProfile);
  const [savedReports, setSavedReports] = useState<SavedReadinessReport[]>([]);
  const [activeReport, setActiveReport] = useState<SavedReadinessReport | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [activeDemoScenarioId, setActiveDemoScenarioId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string>("");
  const [notice, setNotice] = useState<Notice>(null);
  const [limitsAccepted, setLimitsAccepted] = useState(false);

  const visionConfigured = isVisionAnalysisConfigured();
  const readinessChecks = useMemo(() => getReadinessChecks(photos, details), [photos, details]);
  const dashboardReports = useMemo(
    () => (isDemoMode && activeReport ? [activeReport, ...savedReports] : savedReports),
    [activeReport, isDemoMode, savedReports]
  );
  const stats = useMemo(() => buildDashboardStats(dashboardReports), [dashboardReports]);
  const activeDemoScenario = useMemo(
    () => demoScenarios.find((scenario) => scenario.id === activeDemoScenarioId) ?? null,
    [activeDemoScenarioId]
  );

  useEffect(() => {
    const reports = loadSavedReports();
    const profile = loadCompanyProfile();
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get("report");
    const demoId = params.get("demo");
    const shouldStartBlank = params.get("blank") === "1";
    const linkedReport = reportId ? reports.find((report) => report.id === reportId) : null;

    setSavedReports(reports);
    setCompany(profile);

    if (linkedReport) {
      setActiveReport(linkedReport);
      setDetails(linkedReport.details);
      setPhotoEvidence(linkedReport.report.photoEvidence ?? []);
      setLimitsAccepted(true);
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
        message: "Prefilled demo loaded with sample photos, job details, and a generated report."
      });
    }
  }, []);

  function updateDetails<K extends keyof PropertyDetails>(key: K, value: PropertyDetails[K]) {
    setDetails((current) => ({ ...current, [key]: value }));
    setActiveReport(null);
    clearReportUrl();
  }

  function updateCompany<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    setCompany((current) => {
      const next = { ...current, [key]: value };
      saveCompanyProfile(next);
      return next;
    });
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
      setActiveReport(null);
      clearReportUrl();
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
    setActiveReport(null);
    clearReportUrl();
  }

  function updatePhotoEvidenceCaption(photoId: string, caption: string) {
    setPhotoEvidence((current) => {
      const currentByPhotoId = new Map(current.map((item) => [item.photoId, item]));

      return photos.map((photo) => {
        const item = currentByPhotoId.get(photo.id) ?? createPhotoEvidence(photo);
        return item.photoId === photoId ? { ...item, caption, source: "rep-entered" } : item;
      });
    });
    setActiveReport(null);
    clearReportUrl();
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

    setActiveReport(null);
    clearReportUrl();
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
    setActiveReport(null);
    clearReportUrl();
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
      message?: string;
    } = {}
  ) {
    const scenario =
      demoScenarios.find((item) => item.id === scenarioId) ??
      demoScenarios.find((item) => item.id === defaultDemoScenarioId);
    if (!scenario) return;

    photos.forEach((photo) => {
      if (photo.previewUrl.startsWith("blob:")) URL.revokeObjectURL(photo.previewUrl);
    });

    const demoDetails = clonePropertyDetails(scenario.details);
    const demoPhotos = scenario.photos.map((photo) => ({ ...photo }));
    const demoEvidence = syncPhotoEvidenceForPhotos(
      demoPhotos,
      scenario.photoEvidence.map((item) => clonePhotoEvidence(item))
    );
    const demoCompany = options.companyOverride ?? company;

    setDetails(demoDetails);
    setPhotos(demoPhotos);
    setPhotoEvidence(demoEvidence);
    setActiveReport(null);
    setIsDemoMode(true);
    setActiveDemoScenarioId(scenario.id);
    setLimitsAccepted(true);
    setFileError("");

    if (options.generateReport) {
      const report = analyzeRoofReadiness({
        photos: demoPhotos,
        details: demoDetails,
        photoEvidence: demoEvidence,
        visionConfigured,
        visionObservationUsed: false
      });
      setActiveReport({
        ...buildSavedReport(report, demoDetails, demoPhotos, demoCompany),
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
    photos.forEach((photo) => {
      if (photo.previewUrl.startsWith("blob:")) URL.revokeObjectURL(photo.previewUrl);
    });
    setDetails(emptyPropertyDetails);
    setPhotos([]);
    setPhotoEvidence([]);
    setActiveReport(null);
    setIsDemoMode(false);
    setActiveDemoScenarioId(null);
    setLimitsAccepted(false);
    setFileError("");
    setNotice({ type: "success", message: "Blank report workflow ready." });
    clearAppUrl();
    requestAnimationFrame(() => document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth" }));
  }

  function jumpToReport() {
    document.getElementById(activeReport ? "report" : "workflow")?.scrollIntoView({ behavior: "smooth" });
  }

  function jumpToWorkflow() {
    document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth" });
  }

  function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!limitsAccepted) {
      setNotice({ type: "error", message: "Confirm the pre-appointment limitation before generating a report." });
      return;
    }

    const evidenceForPhotos = syncPhotoEvidenceForPhotos(photos, photoEvidence);
    const detailsForReport = applyPhotoEvidenceToDetails(details, evidenceForPhotos);
    const report = analyzeRoofReadiness({
      photos,
      details: detailsForReport,
      photoEvidence: evidenceForPhotos,
      visionConfigured,
      visionObservationUsed: false
    });
    const saved = buildSavedReport(report, detailsForReport, photos, company);
    const nextReports = saveReport(stripSessionPhotoUrls(saved));

    setSavedReports(nextReports);
    setActiveReport(saved);
    setDetails(detailsForReport);
    setPhotoEvidence(evidenceForPhotos);
    setIsDemoMode(false);
    setActiveDemoScenarioId(null);
    setNotice({ type: "success", message: "Report generated and saved locally." });
    setReportUrl(saved.id);
    requestAnimationFrame(() => document.getElementById("report")?.scrollIntoView({ behavior: "smooth" }));
  }

  function loadReport(reportId: string) {
    const saved = findSavedReport(reportId);
    if (!saved) {
      setNotice({ type: "error", message: "That saved report is no longer available in this browser." });
      return;
    }

    setActiveReport(saved);
    setDetails(saved.details);
    setPhotoEvidence(saved.report.photoEvidence ?? []);
    setPhotos([]);
    setLimitsAccepted(true);
    setIsDemoMode(false);
    setActiveDemoScenarioId(null);
    setReportUrl(saved.id);
    setNotice({
      type: "success",
      message: "Saved report loaded. Uploaded image bytes are not stored; photo evidence keeps file names, captions, and tags."
    });
    requestAnimationFrame(() => document.getElementById("report")?.scrollIntoView({ behavior: "smooth" }));
  }

  function removeSavedReport(reportId: string) {
    const nextReports = deleteReport(reportId);
    setSavedReports(nextReports);

    if (activeReport?.id === reportId) {
      setActiveReport(null);
      clearReportUrl();
    }

    setNotice({ type: "success", message: "Saved report deleted." });
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

  const workflowSteps = isDemoMode
    ? ["Review demo inputs", "Show recommendation", "Explain scores", "Print or share"]
    : ["Upload photos", "Add job details", "Confirm limits", "Generate report"];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Home size={22} />
          </div>
          <div>
            <p className="eyebrow">RoofSignal</p>
            <h1>Roof/Solar Readiness Agent</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="pill muted">Client-side pilot MVP</span>
          <span className="pill success">Rule-based triage active</span>
        </div>
      </header>

      <main>
        <section className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Pre-appointment triage for roof + solar teams</span>
            <h2>Know the right sales path before the appointment.</h2>
            <p>
              Generate a branded, homeowner-friendly readiness report that helps reps decide whether to lead with
              solar, roof tune-up, roof replacement, or an in-person inspection.
            </p>
            <div className="hero-actions">
              <button
                className="button primary"
                type="button"
                onClick={isDemoMode ? jumpToReport : () => applyDemoScenario(defaultDemoScenarioId)}
              >
                <Sparkles size={18} />
                {isDemoMode ? "Show demo report" : "Load guided demo"}
              </button>
              <button className="button ghost" type="button" onClick={startBlankReport}>
                <UploadCloud size={18} />
                Start blank report
              </button>
            </div>
          </div>
          <div className="kpi-panel" aria-label="Dashboard summary">
            <MetricCard icon={<FileDown size={20} />} label="Reports generated this month" value={String(stats.reportsThisMonth)} />
            <MetricCard icon={<BriefcaseBusiness size={20} />} label="Bundle opportunities flagged" value={String(stats.bundleOpportunities)} />
            <MetricCard icon={<BarChart3 size={20} />} label="Average lead quality" value={stats.averageLeadQuality ? String(stats.averageLeadQuality) : "-"} />
          </div>
        </section>

        {isDemoMode && activeDemoScenario ? (
          <DemoModePanel
            scenario={activeDemoScenario}
            reportReady={Boolean(activeReport)}
            onJumpReport={jumpToReport}
            onJumpWorkflow={jumpToWorkflow}
            onReload={() => applyDemoScenario(activeDemoScenario.id)}
            onStartBlank={startBlankReport}
          />
        ) : null}

        <section className="progress-strip" aria-label="Workflow steps">
          {workflowSteps.map((step, index) => (
            <div className="progress-step" key={step}>
              <span>{index + 1}</span>
              {step}
            </div>
          ))}
        </section>

        {notice ? <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} /> : null}

        <section className="ops-grid">
          <CompanySettings company={company} onChange={updateCompany} />
          <DemoScenarioPanel onApply={applyDemoScenario} />
          <SavedReportList reports={savedReports} activeId={activeReport?.id} onLoad={loadReport} onDelete={removeSavedReport} />
        </section>

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
              onRemove={removePhoto}
              onCaptionChange={updatePhotoEvidenceCaption}
              onObservationToggle={togglePhotoEvidenceObservation}
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
                placeholder="742 Oak Ridge Dr"
              />
              <NumberField
                label="Roof age estimate"
                value={details.roofAgeYears}
                onChange={(value) => updateDetails("roofAgeYears", value)}
                placeholder="12"
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

            <div className="condition-section">
              <div>
                <h3>Visible condition inputs</h3>
                <p>Use what can be seen in photos or what the homeowner reported. The MVP does not inspect photos automatically.</p>
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
                {visionConfigured
                  ? "Vision adapter flag is enabled, but no provider is connected in this client-only MVP."
                  : "Rule-based from provided inputs. AI vision requires a future server-side provider."}
              </div>
              <button className="button primary" type="submit">
                <Save size={18} />
                Generate and save report
              </button>
            </div>
          </section>
        </form>

        {activeReport ? (
          <ReportSection
            savedReport={activeReport}
            onCopy={copySummary}
            onCopyLink={copyLocalLink}
          />
        ) : (
          <ReportPlaceholder visionConfigured={visionConfigured} />
        )}
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
    <div className={`notice ${notice.type}`}>
      <span>{notice.message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss message">
        x
      </button>
    </div>
  );
}

function DemoModePanel({
  scenario,
  reportReady,
  onJumpReport,
  onJumpWorkflow,
  onReload,
  onStartBlank
}: {
  scenario: DemoScenario;
  reportReady: boolean;
  onJumpReport: () => void;
  onJumpWorkflow: () => void;
  onReload: () => void;
  onStartBlank: () => void;
}) {
  return (
    <section className="demo-mode-panel" aria-label="Guided demo status">
      <div className="demo-mode-copy">
        <span className="eyebrow">Guided demo ready</span>
        <h2>{scenario.label}: {scenario.details.homeownerName}</h2>
        <p>
          The sample is already prefilled with {scenario.photos.length} roof photos, job details, roof condition inputs,
          the pre-appointment limitation acknowledgement, and a generated readiness report.
        </p>
        <div className="demo-facts" aria-label="Demo facts">
          <span>{scenario.details.roofAgeYears ?? "Unknown"} year roof</span>
          <span>{roofMaterialLabels[scenario.details.roofMaterial]}</span>
          <span>Leaks: {scenario.details.knownLeaks}</span>
          <span>{desiredOutcomeLabels[scenario.details.desiredOutcome]}</span>
        </div>
      </div>
      <div className="demo-mode-actions">
        <button className="button primary" type="button" onClick={onJumpReport}>
          <FileDown size={17} />
          {reportReady ? "View generated report" : "View workflow"}
        </button>
        <button className="button secondary" type="button" onClick={onJumpWorkflow}>
          <ClipboardCheck size={17} />
          Review inputs
        </button>
        <button className="button secondary" type="button" onClick={onReload}>
          <Sparkles size={17} />
          Reset demo
        </button>
        <button className="button ghost" type="button" onClick={onStartBlank}>
          <ImagePlus size={17} />
          Start blank
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
  onLoad,
  onDelete
}: {
  reports: SavedReadinessReport[];
  activeId?: string;
  onLoad: (reportId: string) => void;
  onDelete: (reportId: string) => void;
}) {
  return (
    <section className="panel mini-panel">
      <SectionHeader icon={<FolderOpen size={20} />} title="Saved reports" subtitle="Client-only history for pilot demos." />
      {reports.length === 0 ? (
        <div className="empty-list">No saved reports yet.</div>
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
  onRemove,
  onCaptionChange,
  onObservationToggle
}: {
  photos: UploadedPhoto[];
  evidence: PhotoEvidence[];
  onRemove: (photoId: string) => void;
  onCaptionChange: (photoId: string, caption: string) => void;
  onObservationToggle: (photoId: string, flag: VisibleConditionFlag) => void;
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

  return (
    <div className="photo-evidence-editor">
      <div className="photo-evidence-intro">
        <strong>Photo evidence</strong>
        <span>Add a short caption and tag what the photo visibly supports. These notes appear in the report.</span>
      </div>
      {photos.map((photo) => {
        const item = evidenceByPhotoId.get(photo.id) ?? createPhotoEvidence(photo);
        return (
          <article className="photo-evidence-card" key={photo.id}>
            <div className="photo-card-image">
              <img src={photo.previewUrl} alt={`Uploaded roof photo ${photo.fileName}`} />
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
            <p className="photo-file-name" title={photo.fileName}>{photo.fileName}</p>
          </article>
        );
      })}
    </div>
  );
}

function PhotoEvidenceReport({ evidence }: { evidence: PhotoEvidence[] }) {
  if (evidence.length === 0) return null;

  return (
    <section className="photo-evidence-report">
      <div className="report-section-heading">
        <p className="eyebrow">Photo Evidence</p>
        <h3>Rep-confirmed photo notes</h3>
        <span>These observations are based on uploaded photos and rep input, not an automated roof inspection.</span>
      </div>
      <div className="photo-evidence-grid">
        {evidence.map((item) => (
          <article className="photo-evidence-report-card" key={item.photoId}>
            <PhotoEvidenceImage evidence={item} />
            <div>
              <strong>{item.caption || "Roof photo evidence"}</strong>
              <span className="photo-file-name" title={item.fileName}>{item.fileName}</span>
              <div className="report-tag-list">
                {item.observations.length > 0 ? (
                  item.observations.map((flag) => <span key={flag}>{photoTagLabels[flag]}</span>)
                ) : (
                  <span>No specific observation tagged</span>
                )}
              </div>
            </div>
          </article>
        ))}
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
  placeholder
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        max="80"
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
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
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
  onCopyLink
}: {
  savedReport: SavedReadinessReport;
  onCopy: () => void;
  onCopyLink: () => void;
}) {
  const { report, details, company } = savedReport;
  const theme = statusTheme[report.recommendation.status];

  return (
    <section id="report" className="report-shell">
      <div className="report-toolbar">
        <div>
          <p className="eyebrow">Generated readiness report</p>
          <h2>{details.homeownerName || "Homeowner"} - {details.propertyAddress || "Address pending"}</h2>
        </div>
        <div className="toolbar-actions">
          <button className="button secondary" type="button" onClick={onCopy}>
            <Clipboard size={17} />
            Copy summary
          </button>
          <button className="button secondary" type="button" onClick={onCopyLink}>
            <Share2 size={17} />
            Copy local link
          </button>
          <button className="button secondary" type="button" onClick={() => window.print()}>
            <Printer size={17} />
            Print report
          </button>
        </div>
      </div>

      <article className="report-card">
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

        <div className="report-hero">
          <div>
            <span className={`status-badge ${theme.tone}`}>
              {theme.icon}
              {report.recommendation.label}
            </span>
            <h3>{report.recommendation.recommendedSalesPath}</h3>
            <p>{report.suggestedTalkTrack}</p>
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

        <ScoreBoard scores={report.scores} leadQualityScore={report.leadQualityScore} />

        <div className="report-grid">
          <ReportBlock title="Key observations" items={report.keyObservations} />
          <ReportBlock title="Roof risk factors" items={report.roofRiskFactors} />
          <ReportBlock title="Solar readiness factors" items={report.solarReadinessFactors} />
          <ReportBlock title="Questions to ask homeowner" items={report.questionsToAsk} />
        </div>

        <PhotoEvidenceReport evidence={report.photoEvidence ?? []} />

        <section className="next-action">
          <div>
            <p className="eyebrow">Next Best Action</p>
            <h3>{report.recommendation.nextBestAction}</h3>
          </div>
          <div className="placeholder-stack" aria-label="Product readiness status">
            <span>Branding active</span>
            <span>Local history active</span>
            <span>Hosted share links next</span>
          </div>
        </section>

        <p className="disclaimer">{report.disclaimer}</p>
        {company.licenseNote ? <p className="company-note">{company.licenseNote}</p> : null}
      </article>
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
          <p className="eyebrow">Readiness report</p>
          <h2>Complete the job details, confirm limitations, and generate a saved homeowner-ready report.</h2>
          <p>
            The report will include transparent scores, photo evidence, homeowner questions, next action, branded print export,
            copyable summary, local history, and the required pre-appointment disclaimer.
          </p>
          <span className="pill muted">
            {visionConfigured ? "Vision flag enabled - provider still required" : "Rule-based MVP - server-side AI ready later"}
          </span>
        </div>
      </div>
    </section>
  );
}

function ScoreBoard({ scores, leadQualityScore }: { scores: RoofRiskScores; leadQualityScore: number }) {
  const scoreItems = [
    { label: "Roof age risk", value: scores.roofAgeRisk, polarity: "risk" },
    { label: "Visible condition risk", value: scores.visibleConditionRisk, polarity: "risk" },
    { label: "Leak risk", value: scores.leakRisk, polarity: "risk" },
    { label: "Solar readiness", value: scores.solarReadiness, polarity: "positive" },
    { label: "Urgency", value: scores.urgency, polarity: "risk" },
    { label: "Lead quality", value: leadQualityScore, polarity: "positive" }
  ];

  return (
    <section className="score-board">
      {scoreItems.map((item) => (
        <div className="score-item" key={item.label}>
          <div className="score-label">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
          <div className="score-track">
            <span className={item.polarity === "positive" ? "positive" : "risk"} style={{ width: `${item.value}%` }} />
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

function getReadinessChecks(photos: UploadedPhoto[], details: PropertyDetails): string[] {
  const checks: string[] = [];

  if (photos.length === 0) checks.push("Add roof photos or expect low confidence.");
  if (!details.homeownerName.trim()) checks.push("Add homeowner name for a shareable report.");
  if (!details.propertyAddress.trim()) checks.push("Add property address for report context.");
  if (details.roofAgeYears === null) checks.push("Confirm estimated roof age.");
  if (details.roofMaterial === "unknown") checks.push("Confirm roof material/type.");
  if (details.knownLeaks === "unknown") checks.push("Confirm leak history.");
  if (details.desiredOutcome === "unknown") checks.push("Confirm desired outcome.");
  if (details.visibleConditionFlags.includes("limited-or-unclear-photos")) checks.push("Replace unclear photos or keep inspection-first confidence.");

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
      caption: existing?.caption ?? getDefaultPhotoCaption(photo.fileName),
      observations: [...(existing?.observations ?? [])],
      source: existing?.source ?? "rep-entered"
    };
  });
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
  company: CompanyProfile
): SavedReadinessReport {
  const createdAt = report.generatedAt;

  return {
    id: createId(),
    title: `${details.homeownerName || "Homeowner"} - ${details.propertyAddress || "Address pending"}`,
    createdAt,
    details,
    report,
    company,
    photoCount: photos.length,
    photoNames: photos.map((photo) => photo.fileName)
  };
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

  return [
    `${company.companyName || "RoofSignal"} Readiness Report`,
    `Homeowner: ${details.homeownerName || "Pending"}`,
    `Property: ${details.propertyAddress || "Pending"}`,
    `Status: ${formatRecommendationStatus(report.recommendation.status)}`,
    `Confidence: ${report.recommendation.confidence}`,
    `Sales path: ${report.recommendation.recommendedSalesPath}`,
    `Next action: ${report.recommendation.nextBestAction}`,
    `Talk track: ${report.suggestedTalkTrack}`,
    ...photoEvidenceLines,
    `Disclaimer: ${report.disclaimer}`
  ].join("\n");
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
