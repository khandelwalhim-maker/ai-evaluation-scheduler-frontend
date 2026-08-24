import { cn } from "@/lib/utils";
import { formatWindow, type GridDay, type GridEntry, type GridResponse } from "@/lib/api";

type Props = {
  grid: GridResponse | undefined;
  isLoading: boolean;
  selectedKey: string | null;
  onSelectAssessment: (date: string, entry: GridEntry) => void;
};

export function entryKey(date: string, entry: GridEntry): string {
  return `${date}|${entry.raw_label}|${entry.start ?? "?"}`;
}

type Row = { kind: "class" | "assessment"; entry: GridEntry };

function rowsFor(day: GridDay): Row[] {
  const rows: Row[] = [
    ...day.classes.map((entry): Row => ({ kind: "class", entry })),
    ...day.assessments.map((entry): Row => ({ kind: "assessment", entry })),
  ];
  return rows.sort((a, b) => (a.entry.start ?? 0) - (b.entry.start ?? 0));
}

export function TimetableGrid({ grid, isLoading, selectedKey, onSelectAssessment }: Props) {
  if (isLoading && !grid) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center text-xs text-muted-foreground">
        Loading timetable…
      </div>
    );
  }

  if (!grid) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center text-xs text-muted-foreground">
        No timetable data yet. Upload a term timetable to see it here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[980px] grid-cols-7 gap-2">
        {grid.days.map((day) => {
          const rows = rowsFor(day);
          return (
            <div
              key={day.date}
              className={cn(
                "flex min-h-[220px] flex-col gap-2 rounded-lg border p-2",
                day.holiday
                  ? "border-holiday-bg/60 bg-holiday-bg/20"
                  : "border-border/60 bg-background",
              )}
            >
              <div
                className={cn(
                  "rounded-md px-1 py-1.5 text-center",
                  day.holiday
                    ? "bg-holiday-bg text-holiday-fg"
                    : "bg-muted/40 text-muted-foreground",
                )}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wider">
                  {day.weekday.slice(0, 3)}
                </div>
                <div className="text-[10px] font-medium opacity-75">{day.date.slice(5)}</div>
                {day.holiday && <div className="mt-0.5 text-[10px] font-medium">Holiday</div>}
              </div>

              <div className="flex flex-1 flex-col gap-1.5">
                {rows.length === 0 && (
                  <p className="py-4 text-center text-[10px] text-muted-foreground/60">
                    No entries
                  </p>
                )}
                {rows.map((row, index) => {
                  // entryKey is content-derived (used only to match the
                  // currently-selected card across refetches) and is not
                  // guaranteed unique -- e.g. the same course/time recurs
                  // once per division. The React key must be, so it uses
                  // this row's position instead.
                  const reactKey = `${day.date}-${row.kind}-${index}`;
                  const selectionId = entryKey(day.date, row.entry);
                  const { start, end } = row.entry;
                  if (row.kind === "assessment") {
                    const selected = selectionId === selectedKey;
                    return (
                      <button
                        key={reactKey}
                        type="button"
                        onClick={() => onSelectAssessment(day.date, row.entry)}
                        className={cn(
                          "w-full rounded-md border px-2 py-1.5 text-left transition-all",
                          selected
                            ? "border-primary bg-eval-bg shadow-sm ring-1 ring-primary"
                            : "border-eval-border bg-eval-bg hover:brightness-[1.02]",
                        )}
                      >
                        <div className="truncate text-[11px] font-semibold text-eval-fg">
                          {row.entry.course ?? row.entry.raw_label}
                        </div>
                        <div className="truncate text-[10px] font-medium text-eval-fg/75">
                          {row.entry.raw_label}
                        </div>
                        {start != null && end != null && (
                          <div className="text-[10px] font-medium text-eval-fg/65">
                            {formatWindow(start, end)}
                          </div>
                        )}
                      </button>
                    );
                  }
                  return (
                    <div
                      key={reactKey}
                      className="rounded-md border border-class-border bg-class-bg px-2 py-1.5"
                    >
                      <div className="truncate text-[11px] font-semibold text-class-fg">
                        {row.entry.course ?? row.entry.raw_label}
                      </div>
                      {start != null && end != null && (
                        <div className="truncate text-[10px] font-medium text-class-fg/70">
                          {formatWindow(start, end)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
