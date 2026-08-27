import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Download, FileText, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clearCourseRegistry,
  clearTimetable,
  confirmQuestion,
  downloadBlob,
  downloadCourseRegistryTemplate,
  hasParsedOutline,
  hasParsedTimetable,
  removeCourse,
  removeCourseRegistryEntry,
  uploadCourseRegistry,
  uploadDocument,
  upsertCourseRegistryEntry,
  type ApiError,
  type ConfirmationQuestion,
  type SessionStateDTO,
  type UploadKind,
} from "@/lib/api";

type Props = {
  state: SessionStateDTO;
  onGenerate: () => void;
};

// Radix Select throws at runtime on <SelectItem value=""> (it reserves "" to
// mean "no selection"), so a real sentinel stands in for "no specialization /
// core course" inside these two components. This sentinel is the canonical
// in-component representation everywhere -- initial state, dirty comparisons,
// and the Select's own value -- never "". Translation to/from "" happens only
// at the API request boundary (see the mutations below).
const CORE_SENTINEL = "__core__";

function ConfirmationItem({ question }: { question: ConfirmationQuestion }) {
  const [resolution, setResolution] = useState("");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => confirmQuestion(question.context ?? "", resolution),
    onSuccess: ({ state }) => {
      queryClient.setQueryData(["state"], state);
      queryClient.invalidateQueries({ queryKey: ["grid"] });
    },
  });

  return (
    <li className="rounded-md border border-border bg-muted/50 px-3 py-2.5">
      <p className="text-xs leading-relaxed text-foreground/90">{question.question}</p>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (resolution.trim()) mutation.mutate();
        }}
      >
        <Input
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="Your answer"
          className="h-7 text-xs"
          disabled={mutation.isPending}
        />
        <Button
          type="submit"
          size="sm"
          className="h-7 px-2.5 text-xs"
          disabled={mutation.isPending || !resolution.trim()}
        >
          {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Confirm"}
        </Button>
      </form>
      {mutation.isError && (
        <p className="mt-1 text-[11px] text-destructive">{(mutation.error as ApiError).message}</p>
      )}
    </li>
  );
}

function UploadButton({ kind, label }: { kind: UploadKind; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (files: File[]) => {
      setError(null);
      for (const file of files) {
        const result = await uploadDocument(kind, file);
        queryClient.setQueryData(["state"], result.state);
      }
      queryClient.invalidateQueries({ queryKey: ["grid"] });
    },
    onError: (err) => setError((err as ApiError).message ?? "Upload failed"),
  });

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          // e.target.files is a live FileList: resetting e.target.value below
          // empties this same object in place, so it must be copied to a
          // detached array before the reset, not passed through by reference.
          const selected = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          if (selected.length > 0) {
            mutation.mutate(selected);
          }
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={mutation.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {mutation.isPending ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2} />
        ) : (
          <Upload className="size-4" strokeWidth={2} />
        )}
        {label}
      </Button>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function RemoveCourseButton({ index }: { index: number }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => removeCourse(index),
    onSuccess: ({ state }) => {
      queryClient.setQueryData(["state"], state);
      queryClient.invalidateQueries({ queryKey: ["grid"] });
    },
  });

  return (
    <button
      type="button"
      aria-label="Remove this course outline"
      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? (
        <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
      ) : (
        <X className="size-3.5" strokeWidth={2.5} />
      )}
    </button>
  );
}

function ClearTimetableButton() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => clearTimetable(),
    onSuccess: ({ state }) => {
      queryClient.setQueryData(["state"], state);
      queryClient.invalidateQueries({ queryKey: ["grid"] });
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground">
          <Trash2 className="size-3.5" strokeWidth={2} />
          Clear
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear the uploaded timetable?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes every parsed timetable day, division, and minor cohort, and any open
            confirmation questions (they all originate from the timetable). Course outlines are not
            affected. You can re-upload the correct timetable right after.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
            ) : (
              "Clear timetable"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DownloadTemplateButtons() {
  const [error, setError] = useState<string | null>(null);
  const [pendingFormat, setPendingFormat] = useState<"csv" | "xlsx" | null>(null);

  const download = async (format: "csv" | "xlsx") => {
    setError(null);
    setPendingFormat(format);
    try {
      const { blob, filename } = await downloadCourseRegistryTemplate(format);
      downloadBlob(blob, filename);
    } catch (err) {
      setError((err as ApiError).message ?? "Download failed");
    } finally {
      setPendingFormat(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={pendingFormat !== null}
          onClick={() => download("csv")}
        >
          {pendingFormat === "csv" ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2} />
          ) : (
            <Download className="size-4" strokeWidth={2} />
          )}
          Template (CSV)
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={pendingFormat !== null}
          onClick={() => download("xlsx")}
        >
          {pendingFormat === "xlsx" ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2} />
          ) : (
            <Download className="size-4" strokeWidth={2} />
          )}
          Template (.xlsx)
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function RegistryUploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: uploadCourseRegistry,
    onSuccess: ({ data, state }) => {
      setError(null);
      queryClient.setQueryData(["state"], state);
      const collapsed = data.summary.rows_collapsed;
      setNotice(
        collapsed && collapsed.length > 0
          ? `${collapsed.join(", ")} appeared more than once in the upload — kept the last value.`
          : null,
      );
    },
    onError: (err) => {
      setNotice(null);
      setError((err as ApiError).message ?? "Upload failed");
    },
  });

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) mutation.mutate(file);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={mutation.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {mutation.isPending ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2} />
        ) : (
          <Upload className="size-4" strokeWidth={2} />
        )}
        Upload Filled Template
      </Button>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {notice && <p className="text-[11px] text-muted-foreground">{notice}</p>}
    </div>
  );
}

function RegistryRow({
  abbreviation,
  courseName,
  specialization,
  minors,
}: {
  abbreviation: string;
  courseName: string;
  specialization: string;
  minors: string[];
}) {
  const [name, setName] = useState(courseName);
  // "" (no specialization) is represented as CORE_SENTINEL in here, never "" --
  // see the constant's comment above. Initializing from the sentinel (not "")
  // is what keeps the very first dirty comparison below from reading true on
  // mount for an untagged row.
  const [tag, setTag] = useState(specialization || CORE_SENTINEL);
  const queryClient = useQueryClient();
  const initialTag = specialization || CORE_SENTINEL;
  const dirty = (name.trim() !== courseName && name.trim().length > 0) || tag !== initialTag;

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertCourseRegistryEntry(abbreviation, name.trim(), tag === CORE_SENTINEL ? "" : tag),
    onSuccess: ({ state }) => queryClient.setQueryData(["state"], state),
  });

  const removeMutation = useMutation({
    mutationFn: () => removeCourseRegistryEntry(abbreviation),
    onSuccess: ({ state }) => queryClient.setQueryData(["state"], state),
  });

  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-1.5">
      <span
        className="w-20 shrink-0 truncate text-xs font-semibold text-foreground"
        title={abbreviation}
      >
        {abbreviation}
      </span>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-7 flex-1 text-xs"
      />
      <Select value={tag} onValueChange={setTag}>
        <SelectTrigger className="h-7 w-36 shrink-0 text-xs">
          <SelectValue placeholder="Core" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CORE_SENTINEL} className="text-xs">
            Core
          </SelectItem>
          {minors.map((minor) => (
            <SelectItem key={minor} value={minor} className="text-xs">
              {minor}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {dirty && (
        <Button
          size="sm"
          className="h-7 shrink-0 px-2 text-[11px]"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : "Save"}
        </Button>
      )}
      <button
        type="button"
        aria-label={`Remove ${abbreviation} from the course registry`}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        disabled={removeMutation.isPending}
        onClick={() => removeMutation.mutate()}
      >
        {removeMutation.isPending ? (
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
        ) : (
          <X className="size-3.5" strokeWidth={2.5} />
        )}
      </button>
    </li>
  );
}

function AddRegistryEntryForm({ minors }: { minors: string[] }) {
  const [abbreviation, setAbbreviation] = useState("");
  const [name, setName] = useState("");
  const [tag, setTag] = useState(CORE_SENTINEL);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      upsertCourseRegistryEntry(
        abbreviation.trim(),
        name.trim(),
        tag === CORE_SENTINEL ? "" : tag,
      ),
    onSuccess: ({ state }) => {
      queryClient.setQueryData(["state"], state);
      setAbbreviation("");
      setName("");
      setTag(CORE_SENTINEL);
      setError(null);
    },
    onError: (err) => setError((err as ApiError).message ?? "Could not add that mapping"),
  });

  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (abbreviation.trim() && name.trim()) mutation.mutate();
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          value={abbreviation}
          onChange={(e) => setAbbreviation(e.target.value)}
          placeholder="Code (e.g. EAB)"
          className="h-7 w-28 shrink-0 text-xs"
          disabled={mutation.isPending}
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Course name"
          className="h-7 flex-1 text-xs"
          disabled={mutation.isPending}
        />
        <Select value={tag} onValueChange={setTag} disabled={mutation.isPending}>
          <SelectTrigger className="h-7 w-36 shrink-0 text-xs">
            <SelectValue placeholder="Core" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CORE_SENTINEL} className="text-xs">
              Core
            </SelectItem>
            {minors.map((minor) => (
              <SelectItem key={minor} value={minor} className="text-xs">
                {minor}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="submit"
          size="sm"
          className="h-7 shrink-0 px-2.5 text-xs"
          disabled={mutation.isPending || !abbreviation.trim() || !name.trim()}
        >
          {mutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <Plus className="size-3.5" strokeWidth={2.5} />
          )}
          Add
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </form>
  );
}

function ClearRegistryButton() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => clearCourseRegistry(),
    onSuccess: ({ state }) => {
      queryClient.setQueryData(["state"], state);
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground">
          <Trash2 className="size-3.5" strokeWidth={2} />
          Clear
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear the course registry?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes every abbreviation-to-course mapping you've uploaded. Timetable entries
            already resolved keep their resolved name — only future uploads lose the mapping.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
            ) : (
              "Clear registry"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function InputsPanel({ state, onGenerate }: Props) {
  const timetableParsed = hasParsedTimetable(state);
  const outlinesParsed = hasParsedOutline(state);
  const ready = timetableParsed && outlinesParsed;
  const openQuestions = state.confirmation_queue;

  const dayCount = Object.keys(state.calendar.dates).length;
  const { divisions, minors } = state.calendar.cohorts;
  const registryCount = Object.keys(state.calendar.course_registry).length;

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Schedule Inputs</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload the term timetable and course outlines to generate a schedule.
        </p>
      </div>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Course Registry
          </h3>
          {registryCount > 0 && <ClearRegistryButton />}
        </div>
        <p className="text-xs text-muted-foreground">
          A standing catalog of course code → name mappings, reused every time you upload a
          timetable — set it up once per course catalog, not once per term. Add codes below as you
          learn them, or bulk-import a spreadsheet. Whatever's registered here is recognized
          automatically instead of showing up in "Confirm Parsed Data." Minor-elective codes can
          also be tagged with a specialization (from the minors detected in your timetable) so the
          Evaluation Schedule below can label them — core courses need no tag, since they already
          show their division (A/B/C) automatically.
        </p>
        {registryCount > 0 && (
          <ul className="space-y-1.5">
            {Object.entries(state.calendar.course_registry)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([abbreviation, courseName]) => (
                <RegistryRow
                  key={abbreviation}
                  abbreviation={abbreviation}
                  courseName={courseName}
                  specialization={state.calendar.course_specializations[abbreviation] ?? ""}
                  minors={minors}
                />
              ))}
          </ul>
        )}
        <AddRegistryEntryForm minors={minors} />
        <details className="group text-xs">
          <summary className="cursor-pointer select-none font-medium text-muted-foreground hover:text-foreground">
            Bulk import from a spreadsheet
          </summary>
          <div className="mt-2 space-y-1.5">
            <p className="text-[11px] text-muted-foreground">
              Download a template listing timetable codes that still need a name (re-download any
              time to see just what's left unresolved), fill in each course name, and upload it
              back.
            </p>
            <DownloadTemplateButtons />
            <RegistryUploadButton />
          </div>
        </details>
      </section>

      <section className="space-y-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Term Timetable
        </h3>
        <p className="text-xs text-muted-foreground">
          Upload the finalized term timetable PDF. Multiple files (for example one per week) are
          merged automatically.
        </p>
        {timetableParsed && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/60 px-3.5 py-2.5">
            <Check className="size-4 text-success" strokeWidth={2.5} />
            <p className="text-xs font-semibold">
              {dayCount} day{dayCount === 1 ? "" : "s"} processed
            </p>
            <div className="ml-auto">
              <ClearTimetableButton />
            </div>
          </div>
        )}
        <UploadButton
          kind="timetable"
          label={timetableParsed ? "Upload More" : "Upload Timetable"}
        />
      </section>

      <section className="space-y-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Course Outlines
        </h3>
        <p className="text-xs text-muted-foreground">Upload one or multiple course outline PDFs.</p>
        {outlinesParsed && (
          <ul className="space-y-1.5">
            {state.calendar.courses.map((course, i) => (
              <li
                key={`${course.name}-${i}`}
                className="flex items-center gap-2.5 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs"
              >
                <FileText className="size-3.5 text-muted-foreground" strokeWidth={2} />
                <span className="truncate font-medium">{course.name}</span>
                <Check className="ml-auto size-3.5 shrink-0 text-success" strokeWidth={2.5} />
                <RemoveCourseButton index={i} />
              </li>
            ))}
          </ul>
        )}
        <UploadButton kind="course_outline" label="Upload Course Outlines" />
      </section>

      {openQuestions.length > 0 && (
        <section className="space-y-2.5 rounded-lg border border-border bg-muted/20 p-4">
          <h3 className="text-xs font-semibold text-foreground">Confirm Parsed Data</h3>
          <ul className="space-y-2">
            {openQuestions.map((q, i) => (
              <ConfirmationItem key={`${q.kind}-${q.context ?? i}`} question={q} />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
        <h3 className="text-xs font-semibold text-foreground">Scheduling Constraints</h3>
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li className="flex items-center gap-2.5">
            <Check className="size-3.5 text-primary" strokeWidth={2.5} />
            <span className="font-medium">
              {dayCount > 0
                ? `${dayCount} timetable day${dayCount === 1 ? "" : "s"} loaded`
                : "No timetable loaded yet"}
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <Check className="size-3.5 text-primary" strokeWidth={2.5} />
            <span className="font-medium">
              {divisions.length > 0
                ? `Divisions: ${divisions.join(", ")}`
                : "No divisions detected yet"}
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <Check className="size-3.5 text-primary" strokeWidth={2.5} />
            <span className="font-medium">
              {minors.length > 0 ? `Minors: ${minors.join(", ")}` : "No minor cohorts detected yet"}
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <Check className="size-3.5 text-primary" strokeWidth={2.5} />
            <span className="font-medium">
              {state.calendar.courses.length} course outline
              {state.calendar.courses.length === 1 ? "" : "s"} parsed
            </span>
          </li>
        </ul>
      </section>

      <div className="pt-1">
        <Button className="w-full shadow-sm" disabled={!ready} onClick={onGenerate}>
          Generate Evaluation Schedule
        </Button>
      </div>
    </div>
  );
}
