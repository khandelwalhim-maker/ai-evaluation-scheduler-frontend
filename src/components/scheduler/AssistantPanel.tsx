import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  approveCandidate,
  formatWindow,
  sendChatMessage,
  type AffectedAssessment,
  type ApiError,
  type Impact,
  type Proposal,
} from "@/lib/api";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  proposal?: Proposal | null;
  impact?: Impact | null;
};

const SUGGESTIONS = [
  "Why was this slot selected?",
  "Show alternatives",
  "What happens if Friday becomes a holiday?",
];

const INITIAL: ChatMessage[] = [
  {
    id: "m0",
    role: "assistant",
    text: "Hi! I can schedule evaluations, explain a proposal, apply holidays, and help you explore schedule changes.",
  },
];

function ApproveButton({
  proposalId,
  index,
  approved,
  onApprove,
  pending,
}: {
  proposalId: string;
  index: number;
  approved: boolean;
  pending: boolean;
  onApprove: (proposalId: string, index: number) => void;
}) {
  return (
    <Button
      size="sm"
      variant={approved ? "secondary" : "outline"}
      className="h-6 shrink-0 px-2 text-[11px]"
      disabled={pending || approved}
      onClick={() => onApprove(proposalId, index)}
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : approved ? "Approved" : "Approve"}
    </Button>
  );
}

function ProposalCard({
  proposal,
  approvedKey,
  onApprove,
  pending,
}: {
  proposal: Proposal;
  approvedKey: string | null;
  pending: boolean;
  onApprove: (proposalId: string, index: number) => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-eval-border bg-eval-bg/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-eval-fg">
        {proposal.request.name}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {proposal.candidates.map((candidate, i) => (
          <li key={i} className="rounded-md border border-border bg-card px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-semibold text-foreground">
                {i + 1}. {candidate.date} {formatWindow(candidate.start, candidate.end)}
              </span>
              <ApproveButton
                proposalId={proposal.id}
                index={i}
                approved={approvedKey === `${proposal.id}:${i}`}
                pending={pending}
                onApprove={onApprove}
              />
            </div>
            <ul className="mt-1 space-y-0.5">
              {candidate.reasons.map((reason, ri) => (
                <li key={ri} className="text-[11px] text-muted-foreground">
                  {reason}
                </li>
              ))}
            </ul>
          </li>
        ))}
        {proposal.candidates.length === 0 && (
          <li className="text-[11px] text-muted-foreground">No feasible candidates were found.</li>
        )}
      </ul>
      {proposal.warnings.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {proposal.warnings.map((warning, i) => (
            <p key={i} className="text-[11px] text-muted-foreground">
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ImpactCard({
  impact,
  approvedKey,
  onApprove,
  pending,
}: {
  impact: Impact;
  approvedKey: string | null;
  pending: boolean;
  onApprove: (proposalId: string, index: number) => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-eval-border bg-eval-bg/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-eval-fg">
        Impact Detected
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {impact.affected.length} evaluation{impact.affected.length === 1 ? "" : "s"} affected on{" "}
        {impact.date}
      </p>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Proposed Changes
      </p>
      <ul className="mt-1.5 space-y-2">
        {impact.affected.map((affected, ai) => (
          <AffectedItem
            key={ai}
            affected={affected}
            approvedKey={approvedKey}
            pending={pending}
            onApprove={onApprove}
          />
        ))}
      </ul>
    </div>
  );
}

function AffectedItem({
  affected,
  approvedKey,
  pending,
  onApprove,
}: {
  affected: AffectedAssessment;
  approvedKey: string | null;
  pending: boolean;
  onApprove: (proposalId: string, index: number) => void;
}) {
  const { start, end } = affected;
  return (
    <li className="rounded-md border border-border bg-card px-2.5 py-2">
      <div className="text-[11px] font-semibold text-foreground">{affected.raw_label}</div>
      <div className="text-[11px] text-muted-foreground">
        was {affected.date}
        {start != null && end != null ? ` ${formatWindow(start, end)}` : ""}
      </div>
      {affected.reproposal.candidates.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {affected.reproposal.candidates.map((candidate, ci) => (
            <li key={ci} className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-foreground">
                to {candidate.date} {formatWindow(candidate.start, candidate.end)}
              </span>
              <ApproveButton
                proposalId={affected.reproposal.id}
                index={ci}
                approved={approvedKey === `${affected.reproposal.id}:${ci}`}
                pending={pending}
                onApprove={onApprove}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">No feasible re-proposal was found.</p>
      )}
    </li>
  );
}

export function AssistantPanel({
  pendingMessage,
  onMessageConsumed,
}: {
  pendingMessage?: string | null;
  onMessageConsumed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL);
  const [value, setValue] = useState("");
  const [awaitingDuration, setAwaitingDuration] = useState(false);
  const [approvedKey, setApprovedKey] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const chatMutation = useMutation({
    mutationFn: (message: string) => sendChatMessage(message),
    onSuccess: ({ data, state }) => {
      queryClient.setQueryData(["state"], state);
      queryClient.invalidateQueries({ queryKey: ["grid"] });
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.reply,
          proposal: data.proposal,
          impact: data.impact,
        },
      ]);
      const waitingOnDuration = data.awaiting.includes("duration_minutes");
      setAwaitingDuration(waitingOnDuration);
      if (waitingOnDuration) {
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    onError: (err) => {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `The assistant is unavailable right now: ${(err as ApiError).message ?? "unknown error"}.`,
        },
      ]);
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ proposalId, index }: { proposalId: string; index: number }) =>
      approveCandidate(proposalId, index),
    onSuccess: ({ state }, variables) => {
      queryClient.setQueryData(["state"], state);
      queryClient.invalidateQueries({ queryKey: ["grid"] });
      setApprovedKey(`${variables.proposalId}:${variables.index}`);
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Candidate ${variables.index + 1} has been approved and added to the calendar.`,
        },
      ]);
    },
    onError: (err) => {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Could not approve that candidate: ${(err as ApiError).message ?? "unknown error"}.`,
        },
      ]);
    },
  });

  const send = (text: string) => {
    if (!text.trim() || chatMutation.isPending) return;
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text }]);
    setValue("");
    setAwaitingDuration(false);
    chatMutation.mutate(text);
  };

  useEffect(() => {
    if (pendingMessage) {
      setOpen(true);
      send(pendingMessage);
      onMessageConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMessage]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-primary/20 transition-transform hover:scale-105 active:scale-95"
        aria-label="Open scheduling assistant"
      >
        <MessageSquare className="size-5" strokeWidth={2} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex w-[min(92vw,380px)] max-h-[min(80vh,640px)] flex-col rounded-xl border border-border bg-card shadow-2xl shadow-foreground/5">
      <div className="flex items-start justify-between border-b border-border bg-muted/30 px-4 py-3.5">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" strokeWidth={2} />
            <h2 className="text-sm font-semibold tracking-tight">Scheduling Assistant</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Question or modify the suggested schedule.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close assistant"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id}>
            <div
              className={`max-w-[92%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-foreground"
              }`}
            >
              {m.text}
            </div>
            {m.proposal && (
              <ProposalCard
                proposal={m.proposal}
                approvedKey={approvedKey}
                pending={approveMutation.isPending}
                onApprove={(proposalId, index) => approveMutation.mutate({ proposalId, index })}
              />
            )}
            {m.impact && (
              <ImpactCard
                impact={m.impact}
                approvedKey={approvedKey}
                pending={approveMutation.isPending}
                onApprove={(proposalId, index) => approveMutation.mutate({ proposalId, index })}
              />
            )}
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="space-y-2 border-t border-border bg-muted/20 p-3">
        {awaitingDuration && (
          <Badge variant="secondary" className="font-medium">
            Enter duration in minutes
          </Badge>
        )}
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(value);
          }}
        >
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask about the schedule…"
            className="h-9 text-xs"
            disabled={chatMutation.isPending}
          />
          <Button
            type="submit"
            size="icon"
            className="size-9 shrink-0 shadow-sm"
            disabled={chatMutation.isPending}
          >
            <Send className="size-4" strokeWidth={2} />
          </Button>
        </form>
      </div>
    </div>
  );
}
