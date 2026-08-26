// Typed client for the backend (a separate deployment -- see
// ai-evaluation-scheduler-backend -- called cross-origin via API_BASE_URL).
// Every call carries X-Session-Id; after every mutating call the full
// session state is re-fetched and mirrored into memory and localStorage.
// If the backend ever answers 404 for a session (the process restarted and
// forgot it, or it never existed), the client silently restores the
// mirror via /api/state/restore and retries the original call once. See
// the backend's app/main.py's require_session for the server side of this
// contract.

// Empty by default so local dev works against vite.config.ts's /api proxy
// with zero config. Set VITE_API_BASE_URL (see .env.example) to call a
// deployed backend directly, e.g. https://your-backend.up.railway.app --
// no trailing slash.
const API_BASE_URL = (import.meta.env["VITE_API_BASE_URL"] ?? "").replace(/\/$/, "");

const SESSION_ID = "office";
const MIRROR_KEY = "evaluation-studio:session-state";

// ---------------------------------------------------------------------------
// Domain types (mirror backend/app/schemas.py and backend/app/engine.py)
// ---------------------------------------------------------------------------

export type EvaluationType = "quiz" | "midterm" | "endterm" | "group" | "other";

export interface Evaluation {
  name: string;
  type: EvaluationType;
  weightage: number | null;
  timing_note: string | null;
  in_scope: boolean;
}

export interface CourseOutline {
  name: string;
  code: string | null;
  term: string | null;
  instructor: string | null;
  evaluations: Evaluation[];
}

export type CohortKind = "division" | "minor" | "banner" | "unknown";
export type EntryKind = "class" | "existing_assessment" | "banner" | "unknown";

export interface TimetableEntry {
  raw_label: string;
  row_label: string;
  cohort_kind: CohortKind;
  cohort_id: string | null;
  course_guess: string | null;
  session_numbers: number[];
  start: number | null;
  end: number | null;
  entry_kind: EntryKind;
  confidence: number;
}

export interface TimetableDay {
  date: string;
  holiday: boolean;
  entries: TimetableEntry[];
}

export interface ConfirmationQuestion {
  kind: string;
  question: string;
  context: string | null;
}

export interface CohortRegistry {
  divisions: string[];
  minors: string[];
}

export interface CalendarState {
  dates: Record<string, TimetableDay>;
  cohorts: CohortRegistry;
  courses: CourseOutline[];
  questions: ConfirmationQuestion[];
  course_registry: Record<string, string>;
}

export interface PendingRequest {
  fields: Record<string, unknown>;
  missing_fields: string[];
}

export type AssessmentType = "quiz" | "midterm" | "endterm";

export interface ScheduleRequest {
  course: string;
  name: string;
  type: AssessmentType;
  scope: string;
  duration_minutes: number | null;
  after_session: number | null;
  window_start: string | null;
  window_end: string | null;
  overrides: string[];
}

export interface Candidate {
  date: string;
  start: number;
  end: number;
  score: number;
  reasons: string[];
}

export interface BlockedDate {
  date: string;
  start: number;
  end: number;
  reason: string;
}

export interface Proposal {
  id: string;
  request: ScheduleRequest;
  candidates: Candidate[];
  blocked: BlockedDate[];
  warnings: string[];
  questions: ConfirmationQuestion[];
}

export interface AffectedAssessment {
  raw_label: string;
  date: string;
  start: number | null;
  end: number | null;
  reproposal: Proposal;
}

export interface Impact {
  date: string;
  affected: AffectedAssessment[];
}

export interface SessionStateDTO {
  session_id: string;
  calendar: CalendarState;
  confirmation_queue: ConfirmationQuestion[];
  pending_request: PendingRequest | null;
  proposal_history: Proposal[];
  state_version: number;
}

export interface ChatReply {
  action: string;
  reply: string;
  proposal: Proposal | null;
  impact: Impact | null;
  questions: ConfirmationQuestion[];
  awaiting: string[];
  state_version: number;
}

export interface GridEntry {
  raw_label: string;
  course: string | null;
  cohort_kind: CohortKind;
  cohort_id: string | null;
  session_numbers: number[];
  start: number | null;
  end: number | null;
  start_time: string | null;
  end_time: string | null;
  confidence: number;
}

export interface GridDay {
  date: string;
  weekday: string;
  holiday: boolean;
  classes: GridEntry[];
  assessments: GridEntry[];
}

export interface GridResponse {
  week_start: string;
  days: GridDay[];
}

export type UploadKind = "course_outline" | "timetable";

export interface UploadSummary {
  kind: UploadKind;
  course?: CourseOutline;
  days_parsed?: number;
  dates?: string[];
}

export interface UploadResult {
  summary: UploadSummary;
  confirmation_questions: ConfirmationQuestion[];
  state_version: number;
}

export interface ConfirmResult {
  message: string;
  remaining_questions: ConfirmationQuestion[];
  state_version: number;
}

export interface CourseRegistryUploadResult {
  summary: {
    added_or_updated: number;
    rows_collapsed?: string[];
  };
  state_version: number;
}

export interface StatusResult {
  status: string;
  state_version: number;
}

export interface Mirrored<T> {
  data: T;
  state: SessionStateDTO;
}

export const EMPTY_SESSION_STATE: SessionStateDTO = {
  session_id: SESSION_ID,
  calendar: {
    dates: {},
    cohorts: { divisions: [], minors: [] },
    courses: [],
    questions: [],
    course_registry: {},
  },
  confirmation_queue: [],
  pending_request: null,
  proposal_history: [],
  state_version: 0,
};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (body.detail != null) return JSON.stringify(body.detail);
  } catch {
    // body wasn't JSON; fall through
  }
  try {
    const text = await res.text();
    if (text) return text;
  } catch {
    // ignore
  }
  return res.statusText || `Request failed with status ${res.status}`;
}

// ---------------------------------------------------------------------------
// Local mirror (memory + localStorage)
// ---------------------------------------------------------------------------

let memoryMirror: SessionStateDTO | null = null;

export function loadMirror(): SessionStateDTO {
  if (memoryMirror) return memoryMirror;
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(MIRROR_KEY);
      if (raw) {
        memoryMirror = JSON.parse(raw) as SessionStateDTO;
        return memoryMirror;
      }
    } catch {
      // corrupt or inaccessible storage; fall back to empty
    }
  }
  memoryMirror = { ...EMPTY_SESSION_STATE };
  return memoryMirror;
}

function saveMirror(state: SessionStateDTO): void {
  memoryMirror = state;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(MIRROR_KEY, JSON.stringify(state));
    } catch {
      // storage unavailable or full; memory copy still holds for this tab
    }
  }
}

// ---------------------------------------------------------------------------
// Low-level request plumbing
// ---------------------------------------------------------------------------

async function restoreMirrorOnBackend(mirror: SessionStateDTO): Promise<void> {
  await fetch(`${API_BASE_URL}/api/state/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Session-Id": SESSION_ID },
    body: JSON.stringify(mirror),
  });
}

async function request<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Session-Id", SESSION_ID);

  const res = await fetch(`${API_BASE_URL}/api${path}`, { ...init, headers });

  if (res.status === 404 && !isRetry) {
    await restoreMirrorOnBackend(loadMirror());
    return request<T>(path, init, true);
  }

  if (!res.ok) {
    throw new ApiError(await errorDetail(res), res.status);
  }

  return (await res.json()) as T;
}

export async function fetchState(): Promise<SessionStateDTO> {
  const state = await request<SessionStateDTO>("/state", { method: "GET" });
  saveMirror(state);
  return state;
}

async function requestAndMirror<T>(path: string, init: RequestInit): Promise<Mirrored<T>> {
  const data = await request<T>(path, init);
  let state: SessionStateDTO;
  try {
    state = await fetchState();
  } catch {
    state = loadMirror();
  }
  return { data, state };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function uploadDocument(
  kind: UploadKind,
  file: File,
): Promise<Mirrored<UploadResult>> {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", file);
  return requestAndMirror<UploadResult>("/upload", { method: "POST", body: form });
}

export async function uploadCourseRegistry(
  file: File,
): Promise<Mirrored<CourseRegistryUploadResult>> {
  const form = new FormData();
  form.append("file", file);
  return requestAndMirror<CourseRegistryUploadResult>("/course-registry", {
    method: "POST",
    body: form,
  });
}

export async function clearCourseRegistry(): Promise<Mirrored<StatusResult>> {
  return requestAndMirror<StatusResult>("/course-registry", { method: "DELETE" });
}

export async function downloadCourseRegistryTemplate(
  format: "csv" | "xlsx",
): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers({ "X-Session-Id": SESSION_ID });
  const res = await fetch(`${API_BASE_URL}/api/course-registry/template?format=${format}`, {
    headers,
  });
  if (!res.ok) {
    throw new ApiError(await errorDetail(res), res.status);
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? `course_registry_template.${format}`;
  const blob = await res.blob();
  return { blob, filename };
}

export async function upsertCourseRegistryEntry(
  abbreviation: string,
  courseName: string,
): Promise<Mirrored<StatusResult>> {
  return requestAndMirror<StatusResult>(`/course-registry/${encodeURIComponent(abbreviation)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ course_name: courseName }),
  });
}

export async function removeCourseRegistryEntry(
  abbreviation: string,
): Promise<Mirrored<StatusResult>> {
  return requestAndMirror<StatusResult>(`/course-registry/${encodeURIComponent(abbreviation)}`, {
    method: "DELETE",
  });
}

export async function removeCourse(index: number): Promise<Mirrored<StatusResult>> {
  return requestAndMirror<StatusResult>(`/course/${index}`, { method: "DELETE" });
}

export async function clearTimetable(): Promise<Mirrored<StatusResult>> {
  return requestAndMirror<StatusResult>("/timetable", { method: "DELETE" });
}

export async function confirmQuestion(
  context: string,
  resolution: string,
): Promise<Mirrored<ConfirmResult>> {
  return requestAndMirror<ConfirmResult>("/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context, resolution }),
  });
}

export async function sendChatMessage(message: string): Promise<Mirrored<ChatReply>> {
  return requestAndMirror<ChatReply>("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

export async function approveCandidate(
  proposalId: string,
  candidateIndex: number,
): Promise<Mirrored<StatusResult>> {
  return requestAndMirror<StatusResult>("/schedule/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal_id: proposalId, candidate_index: candidateIndex }),
  });
}

export async function fetchGrid(weekStart: string): Promise<GridResponse> {
  return request<GridResponse>(`/grid?week_start=${encodeURIComponent(weekStart)}`, {
    method: "GET",
  });
}

export async function importState(file: File): Promise<Mirrored<StatusResult>> {
  const form = new FormData();
  form.append("file", file);
  return requestAndMirror<StatusResult>("/import", { method: "POST", body: form });
}

export async function exportState(): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers({ "X-Session-Id": SESSION_ID });
  const res = await fetch(`${API_BASE_URL}/api/export`, { headers });
  if (!res.ok) {
    throw new ApiError(await errorDetail(res), res.status);
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? `session_${SESSION_ID}.json`;
  const blob = await res.blob();
  return { blob, filename };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Developer Options (admin) API
//
// Deliberately separate from request()/requestAndMirror() above: admin
// calls carry X-Admin-Token instead of X-Session-Id, and must surface a
// 401 (wrong token) vs. 503 (server not configured) distinctly rather than
// triggering request()'s session-mirror-restore-and-retry logic, which is
// specific to the X-Session-Id contract and unrelated to admin auth.
// ---------------------------------------------------------------------------

const ADMIN_TOKEN_KEY = "evaluation-studio:admin-token";

export function getStoredAdminToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    // storage unavailable; token still works for the rest of this page load
  }
}

export function clearStoredAdminToken(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export interface AdminSettings {
  llm_api_key_masked: string | null;
  llm_base_url: string;
  model_parse: string;
  model_narrate: string;
  model_fallback: string;
  extra_intent_instructions: string;
  extra_narrate_instructions: string;
  extra_outline_instructions: string;
}

export interface AdminSettingsUpdatePayload {
  llm_api_key?: string;
  llm_base_url?: string;
  model_parse?: string;
  model_narrate?: string;
  model_fallback?: string;
  extra_intent_instructions?: string;
  extra_narrate_instructions?: string;
  extra_outline_instructions?: string;
}

export interface AdminSettingsUpdateResult {
  status: string;
  changed: string[];
}

export type AdminTestStatus = "ok" | "auth_error" | "rate_limited" | "other_error";

export interface AdminTestResult {
  status: AdminTestStatus;
  model: string;
}

async function adminRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Admin-Token", token);
  const res = await fetch(`${API_BASE_URL}/api${path}`, { ...init, headers });
  if (!res.ok) {
    throw new ApiError(await errorDetail(res), res.status);
  }
  return (await res.json()) as T;
}

export async function getAdminSettings(token: string): Promise<AdminSettings> {
  return adminRequest<AdminSettings>("/admin/settings", token, { method: "GET" });
}

export async function updateAdminSettings(
  token: string,
  payload: AdminSettingsUpdatePayload,
): Promise<AdminSettingsUpdateResult> {
  return adminRequest<AdminSettingsUpdateResult>("/admin/settings", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function testAdminConnection(token: string): Promise<AdminTestResult> {
  return adminRequest<AdminTestResult>("/admin/settings/test", token, { method: "POST" });
}

export async function rotateAdminToken(
  token: string,
  newToken: string,
): Promise<{ status: string }> {
  return adminRequest<{ status: string }>("/admin/token", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_token: newToken }),
  });
}

export function generateRandomAdminToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Derived helpers (pure, used by UI components)
// ---------------------------------------------------------------------------

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(isoDate: string, days: number): string {
  const parts = isoDate.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatWindow(start: number, end: number): string {
  return `${formatMinutes(start)} to ${formatMinutes(end)}`;
}

export function hasParsedTimetable(state: SessionStateDTO): boolean {
  return Object.keys(state.calendar.dates).length > 0;
}

export function hasParsedOutline(state: SessionStateDTO): boolean {
  return state.calendar.courses.length > 0;
}

export function totalAssessmentCount(state: SessionStateDTO): number {
  let count = 0;
  for (const day of Object.values(state.calendar.dates)) {
    for (const entry of day.entries) {
      if (entry.entry_kind === "banner" || entry.entry_kind === "existing_assessment") count += 1;
    }
  }
  return count;
}

export function latestProposal(state: SessionStateDTO): Proposal | null {
  const history = state.proposal_history;
  return history[history.length - 1] ?? null;
}

export function findMatchingCandidate(
  history: Proposal[],
  date: string,
  start: number | null,
  end: number | null,
): { proposal: Proposal; candidate: Candidate } | null {
  if (start == null || end == null) return null;
  for (const proposal of [...history].reverse()) {
    const candidate = proposal.candidates.find(
      (c) => c.date === date && c.start === start && c.end === end,
    );
    if (candidate) return { proposal, candidate };
  }
  return null;
}
