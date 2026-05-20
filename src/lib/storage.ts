import type { CompanyProfile, SavedReadinessReport } from "../types/roof";

const REPORTS_KEY = "roofsignal.savedReports.v1";
const COMPANY_KEY = "roofsignal.companyProfile.v1";

export const defaultCompanyProfile: CompanyProfile = {
  companyName: "RoofSignal Demo Company",
  repName: "",
  phone: "",
  email: "",
  licenseNote: "Pre-appointment triage only. Final scope requires qualified roof review."
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function loadCompanyProfile(): CompanyProfile {
  if (!canUseStorage()) return defaultCompanyProfile;
  return { ...defaultCompanyProfile, ...parseJson<Partial<CompanyProfile>>(localStorage.getItem(COMPANY_KEY), {}) };
}

export function saveCompanyProfile(profile: CompanyProfile): void {
  if (!canUseStorage()) return;
  localStorage.setItem(COMPANY_KEY, JSON.stringify(profile));
}

export function loadSavedReports(): SavedReadinessReport[] {
  if (!canUseStorage()) return [];
  return parseJson<SavedReadinessReport[]>(localStorage.getItem(REPORTS_KEY), []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function saveReport(report: SavedReadinessReport): SavedReadinessReport[] {
  if (!canUseStorage()) return [report];

  const reports = loadSavedReports();
  const nextReports = [report, ...reports.filter((item) => item.id !== report.id)].slice(0, 50);
  localStorage.setItem(REPORTS_KEY, JSON.stringify(nextReports));
  return nextReports;
}

export function deleteReport(reportId: string): SavedReadinessReport[] {
  if (!canUseStorage()) return [];

  const nextReports = loadSavedReports().filter((item) => item.id !== reportId);
  localStorage.setItem(REPORTS_KEY, JSON.stringify(nextReports));
  return nextReports;
}

export function findSavedReport(reportId: string): SavedReadinessReport | null {
  return loadSavedReports().find((report) => report.id === reportId) ?? null;
}
