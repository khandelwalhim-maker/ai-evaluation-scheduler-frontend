import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/scheduler/Sidebar";
import { InputsPanel } from "@/components/scheduler/InputsPanel";
import { TimetableGrid, entryKey } from "@/components/scheduler/TimetableGrid";
import { EvaluationDetail } from "@/components/scheduler/EvaluationDetail";
import { AssistantPanel } from "@/components/scheduler/AssistantPanel";
import {
  addDays,
  fetchGrid,
  fetchState,
  latestProposal,
  startOfWeek,
  toIsoDate,
  totalAssessmentCount,
  type GridEntry,
} from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Evaluation Scheduler — SPJIMR PGP2 Term IV" },
      {
        name: "description",
        content:
          "Single-page scheduling workspace to upload inputs, generate evaluation slots, visualize the timetable and refine it with an AI assistant.",
      },
      { property: "og:title", content: "AI Evaluation Scheduler — SPJIMR PGP2 Term IV" },
      {
        property: "og:description",
        content:
          "Upload, generate, visualize, question, modify and approve the evaluation schedule in one workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchedulerWorkspace,
});

function SchedulerWorkspace() {
  const [weekStart, setWeekStart] = useState(() => toIsoDate(startOfWeek(new Date())));
  const [selected, setSelected] = useState<{ date: string; entry: GridEntry } | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const stateQuery = useQuery({ queryKey: ["state"], queryFn: fetchState });
  const gridQuery = useQuery({
    queryKey: ["grid", weekStart],
    queryFn: () => fetchGrid(weekStart),
  });

  const state = stateQuery.data;

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">
          {stateQuery.isError ? "Could not reach the backend. Retrying…" : "Loading workspace…"}
        </p>
      </div>
    );
  }

  const proposalHistory = state.proposal_history;
  const latest = latestProposal(state);
  const selectedKey = selected ? entryKey(selected.date, selected.entry) : null;

  const counters = [
    { label: "Evaluations", value: String(totalAssessmentCount(state)) },
    { label: "Conflicts", value: String(latest?.blocked.length ?? 0) },
    { label: "Preferences Unmet", value: String(latest?.warnings.length ?? 0) },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-card px-6 py-4 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            AI Evaluation Scheduler
          </h1>
          <p className="text-xs font-medium text-muted-foreground">PGP2 • Term IV</p>
        </header>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
          <InputsPanel
            state={state}
            onGenerate={() =>
              setPendingMessage(
                "What courses and evaluations do you know about so far, and what should we schedule first?",
              )
            }
          />

          <section className="flex min-w-0 flex-1 flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Evaluation Schedule
                </h2>
                <span className="mt-1.5 inline-flex rounded-full bg-eval-bg px-2.5 py-0.5 text-[11px] font-semibold text-eval-fg">
                  Live from backend
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => setWeekStart((w) => addDays(w, -7))}
                  aria-label="Previous week"
                >
                  <ChevronLeft className="size-4" strokeWidth={2} />
                </Button>
                <span className="text-xs font-medium text-muted-foreground">
                  Week of {weekStart}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => setWeekStart((w) => addDays(w, 7))}
                  aria-label="Next week"
                >
                  <ChevronRight className="size-4" strokeWidth={2} />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {counters.map((c) => (
                <div
                  key={c.label}
                  className="rounded-lg border border-border bg-muted/40 px-4 py-3"
                >
                  <div className="text-base font-semibold text-foreground">{c.value}</div>
                  <div className="text-[11px] font-medium text-muted-foreground">{c.label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-5 text-[11px] font-medium text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm border border-class-border bg-class-bg" />{" "}
                Regular Class
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm border border-eval-border bg-eval-bg" />{" "}
                Evaluation
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm bg-holiday-bg" /> Holiday / Unavailable
              </span>
            </div>

            <TimetableGrid
              grid={gridQuery.data}
              isLoading={gridQuery.isLoading}
              selectedKey={selectedKey}
              onSelectAssessment={(date, entry) => setSelected({ date, entry })}
              courseSpecializations={state.calendar.course_specializations}
            />

            {selected && (
              <EvaluationDetail
                date={selected.date}
                entry={selected.entry}
                proposalHistory={proposalHistory}
                onClose={() => setSelected(null)}
                onAsk={(text) => setPendingMessage(text)}
              />
            )}
          </section>
        </div>

        <AssistantPanel
          pendingMessage={pendingMessage}
          onMessageConsumed={() => setPendingMessage(null)}
        />
      </main>
    </div>
  );
}
