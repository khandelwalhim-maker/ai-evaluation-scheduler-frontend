import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  approveCandidate,
  findMatchingCandidate,
  formatWindow,
  type ApiError,
  type GridEntry,
  type Proposal,
} from "@/lib/api";

type Props = {
  date: string;
  entry: GridEntry;
  proposalHistory: Proposal[];
  onClose: () => void;
  onAsk: (text: string) => void;
};

export function EvaluationDetail({ date, entry, proposalHistory, onClose, onAsk }: Props) {
  const queryClient = useQueryClient();
  const match = findMatchingCandidate(proposalHistory, date, entry.start, entry.end);

  const approveMutation = useMutation({
    mutationFn: ({ proposalId, index }: { proposalId: string; index: number }) =>
      approveCandidate(proposalId, index),
    onSuccess: ({ state }) => {
      queryClient.setQueryData(["state"], state);
      queryClient.invalidateQueries({ queryKey: ["grid"] });
    },
  });

  const label = entry.course ?? entry.raw_label;
  const { start, end } = entry;

  return (
    <div className="rounded-xl border border-eval-border bg-eval-bg/50 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{label}</h3>
          <p className="text-xs text-muted-foreground">{entry.raw_label}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close details"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>

      <div className="mt-4 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Scheduled Slot
        </p>
        <p className="text-sm font-medium text-foreground">
          {date}
          {start != null && end != null ? ` · ${formatWindow(start, end)}` : ""}
        </p>
      </div>

      {match ? (
        <>
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Why this slot?
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {match.candidate.reasons.map((reason, i) => (
                <li key={i} className="text-xs leading-relaxed text-muted-foreground">
                  {reason}
                </li>
              ))}
              {match.candidate.reasons.length === 0 && (
                <li className="text-xs leading-relaxed text-muted-foreground">
                  No penalties applied; this was the strongest candidate.
                </li>
              )}
            </ul>
          </div>

          {match.proposal.candidates.length > 1 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Other candidates from this request
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {match.proposal.candidates.map((candidate, i) => {
                  const isCurrent =
                    candidate.date === date &&
                    candidate.start === entry.start &&
                    candidate.end === entry.end;
                  return (
                    <li
                      key={`${candidate.date}-${candidate.start}-${i}`}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
                    >
                      <span className="text-xs font-medium text-foreground">
                        {candidate.date} {formatWindow(candidate.start, candidate.end)}
                        {isCurrent ? " (current)" : ""}
                      </span>
                      {!isCurrent && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs"
                          disabled={approveMutation.isPending}
                          onClick={() =>
                            approveMutation.mutate({ proposalId: match.proposal.id, index: i })
                          }
                        >
                          {approveMutation.isPending ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            "Approve"
                          )}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {approveMutation.isError && (
                <p className="mt-1.5 text-[11px] text-destructive">
                  {(approveMutation.error as ApiError).message}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          This entry came directly from the uploaded timetable, so no scheduling rationale is
          available for it.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onAsk(`Why was ${label} scheduled at this time?`)}>
          Ask Assistant
        </Button>
      </div>
    </div>
  );
}
