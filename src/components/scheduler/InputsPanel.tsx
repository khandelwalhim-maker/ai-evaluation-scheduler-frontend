import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmQuestion,
  hasParsedOutline,
  hasParsedTimetable,
  uploadDocument,
  type ApiError,
  type ConfirmationQuestion,
  type SessionStateDTO,
  type UploadKind,
} from "@/lib/api";

type Props = {
  state: SessionStateDTO;
  onGenerate: () => void;
};

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

export function InputsPanel({ state, onGenerate }: Props) {
  const timetableParsed = hasParsedTimetable(state);
  const outlinesParsed = hasParsedOutline(state);
  const ready = timetableParsed && outlinesParsed;
  const openQuestions = state.confirmation_queue;

  const dayCount = Object.keys(state.calendar.dates).length;
  const { divisions, minors } = state.calendar.cohorts;

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Schedule Inputs</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload the term timetable and course outlines to generate a schedule.
        </p>
      </div>

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
