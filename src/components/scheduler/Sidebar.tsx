import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarRange, Download, Loader2, Settings2, Upload } from "lucide-react";
import { downloadBlob, exportState, importState, type ApiError } from "@/lib/api";
import { DeveloperOptionsSheet } from "./DeveloperOptionsSheet";

export function AppSidebar() {
  const queryClient = useQueryClient();
  const importRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [devOptionsOpen, setDevOptionsOpen] = useState(false);

  const exportMutation = useMutation({
    mutationFn: exportState,
    onSuccess: ({ blob, filename }) => downloadBlob(blob, filename),
    onError: (err) => setError((err as ApiError).message ?? "Export failed"),
  });

  const importMutation = useMutation({
    mutationFn: importState,
    onSuccess: ({ state }) => {
      setError(null);
      queryClient.setQueryData(["state"], state);
      queryClient.invalidateQueries({ queryKey: ["grid"] });
    },
    onError: (err) => setError((err as ApiError).message ?? "Import failed"),
  });

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
      <div className="border-b border-sidebar-border px-6 py-6">
        <div className="text-xl font-semibold tracking-tight text-white">SPJIMR</div>
        <div className="mt-0.5 text-xs font-medium tracking-wide text-sidebar-foreground/60">
          Academic Operations
        </div>
      </div>
      <nav className="flex flex-col gap-1 p-4">
        <Link
          to="/"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-primary data-[status=active]:text-sidebar-primary-foreground data-[status=active]:shadow-sm"
        >
          <CalendarRange className="size-4" strokeWidth={2} />
          Evaluation Scheduler
        </Link>
        <button
          type="button"
          onClick={() => setDevOptionsOpen(true)}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Settings2 className="size-4" strokeWidth={2} />
          Developer Options
        </button>
      </nav>
      <DeveloperOptionsSheet open={devOptionsOpen} onOpenChange={setDevOptionsOpen} />

      <div className="mt-auto space-y-2 border-t border-sidebar-border px-4 py-4">
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importMutation.mutate(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-50"
        >
          {exportMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <Download className="size-3.5" strokeWidth={2} />
          )}
          Export Session
        </button>
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          disabled={importMutation.isPending}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-50"
        >
          {importMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <Upload className="size-3.5" strokeWidth={2} />
          )}
          Import Session
        </button>
        {error && <p className="px-3 text-[11px] text-destructive">{error}</p>}
        <div className="px-3 pt-2 text-[11px] font-medium tracking-wide text-sidebar-foreground/40">
          Connected to backend
        </div>
      </div>
    </aside>
  );
}
