import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  getAdminSettings,
  testAdminConnection,
  updateAdminSettings,
  type AdminSettings,
  type AdminTestStatus,
} from "@/lib/api";

export function DeveloperOptionsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Developer Options</SheetTitle>
          <SheetDescription>LLM provider, model, and chatbot instruction settings</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <SettingsForm />
        </div>
      </SheetContent>
    </Sheet>
  );
}

type ProviderForm = {
  llm_base_url: string;
  model_parse: string;
  model_narrate: string;
  model_fallback: string;
  new_api_key: string;
};

function SettingsForm() {
  const query = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => getAdminSettings(),
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }
  if (!query.data) {
    return <p className="text-sm text-destructive">Could not load Developer Options settings.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <ProviderSection settings={query.data} />
      <InstructionsSection settings={query.data} />
      <p className="text-[11px] text-muted-foreground">
        Changes apply immediately but are lost on the next deploy — for a permanent change, also
        update the corresponding Railway environment variable.
      </p>
    </div>
  );
}

function ProviderSection({ settings }: { settings: AdminSettings }) {
  const [form, setForm] = useState<ProviderForm>({
    llm_base_url: settings.llm_base_url,
    model_parse: settings.model_parse,
    model_narrate: settings.model_narrate,
    model_fallback: settings.model_fallback,
    new_api_key: "",
  });
  const [testStatus, setTestStatus] = useState<AdminTestStatus | null>(null);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAdminSettings({
        llm_base_url: form.llm_base_url,
        model_parse: form.model_parse,
        model_narrate: form.model_narrate,
        model_fallback: form.model_fallback,
        ...(form.new_api_key ? { llm_api_key: form.new_api_key } : {}),
      }),
    onSuccess: () => setForm((f) => ({ ...f, new_api_key: "" })),
  });

  const testMutation = useMutation({
    mutationFn: () => testAdminConnection(),
    onSuccess: (result) => setTestStatus(result.status),
  });

  const testLabel: Record<AdminTestStatus, string> = {
    ok: "Connection works",
    auth_error: "Provider rejected the key — check it's correct",
    rate_limited: "Provider is rate-limiting this key right now",
    other_error: "Could not reach the provider — check the base URL/model",
  };

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">LLM Provider</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Any OpenAI-compatible chat/completions provider with JSON-mode support (e.g. Mistral,
          Groq, OpenAI, OpenRouter) — not native support for a differently-shaped API.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="llm_base_url">Base URL</Label>
          <Input
            id="llm_base_url"
            value={form.llm_base_url}
            onChange={(e) => setForm((f) => ({ ...f, llm_base_url: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="api_key">API key</Label>
          <Input
            id="api_key"
            type="password"
            value={form.new_api_key}
            onChange={(e) => setForm((f) => ({ ...f, new_api_key: e.target.value }))}
            placeholder={settings.llm_api_key_masked ?? "not set"}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="model_parse">Parse model</Label>
          <Input
            id="model_parse"
            value={form.model_parse}
            onChange={(e) => setForm((f) => ({ ...f, model_parse: e.target.value }))}
          />
          <p className="text-[11px] text-muted-foreground">
            Classifies chat intent and extracts data from uploaded course-outline PDFs.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="model_narrate">Narrate model</Label>
          <Input
            id="model_narrate"
            value={form.model_narrate}
            onChange={(e) => setForm((f) => ({ ...f, model_narrate: e.target.value }))}
          />
          <p className="text-[11px] text-muted-foreground">
            Writes the assistant's reply text from the engine's already-computed result — never
            picks dates itself.
          </p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="model_fallback">Fallback model</Label>
          <Input
            id="model_fallback"
            value={form.model_fallback}
            onChange={(e) => setForm((f) => ({ ...f, model_fallback: e.target.value }))}
          />
          <p className="text-[11px] text-muted-foreground">
            Only used automatically if the parse/narrate model fails or hits a rate limit — keep it
            different from Parse model, or the retry safety net never triggers.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setTestStatus(null);
            testMutation.mutate();
          }}
          disabled={testMutation.isPending}
        >
          {testMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            "Test connection"
          )}
        </Button>
        {saveMutation.isSuccess && !saveMutation.isPending && (
          <span className="text-xs text-success">Saved.</span>
        )}
        {saveMutation.isError && <span className="text-xs text-destructive">Save failed.</span>}
      </div>
      {testStatus && (
        <p
          className={`flex items-center gap-1.5 text-xs ${
            testStatus === "ok" ? "text-success" : "text-destructive"
          }`}
        >
          {testStatus === "ok" ? (
            <CheckCircle2 className="size-3.5" strokeWidth={2} />
          ) : (
            <XCircle className="size-3.5" strokeWidth={2} />
          )}
          {testLabel[testStatus]}
        </p>
      )}
    </section>
  );
}

type InstructionKey =
  "extra_intent_instructions" | "extra_narrate_instructions" | "extra_outline_instructions";

const INSTRUCTION_FIELDS: { key: InstructionKey; title: string; description: string }[] = [
  {
    key: "extra_intent_instructions",
    title: "Intent classification",
    description: "Appended after the base prompt that decides what a chat message is asking for.",
  },
  {
    key: "extra_narrate_instructions",
    title: "Result narration",
    description: "Appended after the base prompt that turns a computed result into a reply.",
  },
  {
    key: "extra_outline_instructions",
    title: "Course-outline extraction",
    description: "Appended after the base prompt that reads an uploaded course-outline PDF.",
  },
];

function InstructionsSection({ settings }: { settings: AdminSettings }) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Chatbot Instructions
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Free text appended after each base prompt — not a replacement, so the assistant's
          underlying behavior stays intact even if this text is imperfect. Pre-filled with
          reasonable defaults; edit or clear any of them.
        </p>
      </div>
      {INSTRUCTION_FIELDS.map((field) => (
        <InstructionField
          key={field.key}
          fieldKey={field.key}
          title={field.title}
          description={field.description}
          initialValue={settings[field.key]}
        />
      ))}
    </section>
  );
}

function InstructionField({
  fieldKey,
  title,
  description,
  initialValue,
}: {
  fieldKey: InstructionKey;
  title: string;
  description: string;
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);

  const saveMutation = useMutation({
    mutationFn: () => updateAdminSettings({ [fieldKey]: value }),
  });

  return (
    <div className="space-y-1.5 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <Label htmlFor={fieldKey}>{title}</Label>
      <p className="text-[11px] text-muted-foreground">{description}</p>
      <Textarea
        id={fieldKey}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        className="text-xs"
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
        </Button>
        {saveMutation.isSuccess && !saveMutation.isPending && (
          <span className="text-xs text-success">Saved.</span>
        )}
        {saveMutation.isError && <span className="text-xs text-destructive">Save failed.</span>}
      </div>
    </div>
  );
}
