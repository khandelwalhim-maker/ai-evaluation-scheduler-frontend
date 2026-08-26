import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Shuffle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  clearStoredAdminToken,
  generateRandomAdminToken,
  getAdminSettings,
  getStoredAdminToken,
  rotateAdminToken,
  setStoredAdminToken,
  testAdminConnection,
  updateAdminSettings,
  type AdminSettings,
  type AdminTestStatus,
  type ApiError,
} from "@/lib/api";

export const Route = createFileRoute("/developer")({
  head: () => ({
    meta: [{ title: "Developer Options — AI Evaluation Scheduler" }],
  }),
  component: DeveloperOptionsPage,
});

function DeveloperOptionsPage() {
  const [token, setToken] = useState<string | null>(() => getStoredAdminToken());

  return (
    <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-background">
      <header className="border-b border-border bg-card px-6 py-4 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Developer Options</h1>
        <p className="text-xs font-medium text-muted-foreground">
          LLM provider, model, and chatbot instruction settings
        </p>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        {token ? (
          <SettingsForm
            token={token}
            onLocked={() => {
              clearStoredAdminToken();
              setToken(null);
            }}
            onTokenChanged={(newToken) => {
              setStoredAdminToken(newToken);
              setToken(newToken);
            }}
          />
        ) : (
          <TokenGate onUnlocked={setToken} />
        )}
      </div>
    </div>
  );
}

function TokenGate({ onUnlocked }: { onUnlocked: (token: string) => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await getAdminSettings(input);
      setStoredAdminToken(input);
      onUnlocked(input);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 503) {
        // Server config, not a wrong credential -- deliberately does not
        // clear a previously-stored token here.
        setError(
          "Not configured on the server yet — set ADMIN_TOKEN as a Railway environment variable.",
        );
      } else {
        setError("Incorrect developer access token.");
        clearStoredAdminToken();
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto mt-12 max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          Enter developer access token
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Configured on the backend as the <code>ADMIN_TOKEN</code> environment variable.
        </p>
      </div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !pending) void submit();
        }}
      >
        <Input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Developer access token"
          disabled={pending}
          autoFocus
        />
        <Button type="submit" className="w-full" disabled={pending || !input.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={2} /> : "Unlock"}
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

type ProviderForm = {
  llm_base_url: string;
  model_parse: string;
  model_narrate: string;
  model_fallback: string;
  new_api_key: string;
};

function SettingsForm({
  token,
  onLocked,
  onTokenChanged,
}: {
  token: string;
  onLocked: () => void;
  onTokenChanged: (newToken: string) => void;
}) {
  const query = useQuery({
    queryKey: ["admin-settings", token],
    queryFn: () => getAdminSettings(token),
    retry: false,
  });

  useEffect(() => {
    if (query.isError && (query.error as ApiError).status === 401) {
      onLocked();
    }
  }, [query.isError, query.error, onLocked]);

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }
  if (!query.data) {
    return <p className="text-sm text-destructive">Could not load Developer Options settings.</p>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <ProviderSection token={token} settings={query.data} onLocked={onLocked} />
      <InstructionsSection token={token} settings={query.data} onLocked={onLocked} />
      <AccessTokenSection token={token} onLocked={onLocked} onTokenChanged={onTokenChanged} />
      <p className="text-[11px] text-muted-foreground">
        Changes apply immediately but are lost on the next deploy — for a permanent change, also
        update the corresponding Railway environment variable.
      </p>
    </div>
  );
}

function AccessTokenSection({
  token,
  onLocked,
  onTokenChanged,
}: {
  token: string;
  onLocked: () => void;
  onTokenChanged: (newToken: string) => void;
}) {
  const [newToken, setNewToken] = useState("");

  const rotateMutation = useMutation({
    mutationFn: (value: string) => rotateAdminToken(token, value),
    onSuccess: (_result, value) => {
      onTokenChanged(value);
      setNewToken("");
    },
    onError: (err) => {
      if ((err as ApiError).status === 401) onLocked();
    },
  });

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Access Token</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Changes what unlocks this page from now on — this browser updates automatically, but it's
          the only one that will. For the change to survive the next deploy, also set{" "}
          <code>ADMIN_TOKEN</code> to the same value in Railway.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="password"
          value={newToken}
          onChange={(e) => setNewToken(e.target.value)}
          placeholder="New access token"
          className="max-w-xs"
        />
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() => setNewToken(generateRandomAdminToken())}
        >
          <Shuffle className="size-3.5" strokeWidth={2} />
          Generate
        </Button>
        <Button
          size="sm"
          onClick={() => rotateMutation.mutate(newToken)}
          disabled={rotateMutation.isPending || newToken.trim().length < 8}
        >
          {rotateMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            "Change token"
          )}
        </Button>
        {rotateMutation.isSuccess && (
          <span className="text-xs text-success">
            Changed — copy it somewhere safe, it won't be shown again.
          </span>
        )}
        {rotateMutation.isError && (
          <span className="text-xs text-destructive">
            {(rotateMutation.error as ApiError).message || "Could not change the token."}
          </span>
        )}
      </div>
    </section>
  );
}

function ProviderSection({
  token,
  settings,
  onLocked,
}: {
  token: string;
  settings: AdminSettings;
  onLocked: () => void;
}) {
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
      updateAdminSettings(token, {
        llm_base_url: form.llm_base_url,
        model_parse: form.model_parse,
        model_narrate: form.model_narrate,
        model_fallback: form.model_fallback,
        ...(form.new_api_key ? { llm_api_key: form.new_api_key } : {}),
      }),
    onSuccess: () => setForm((f) => ({ ...f, new_api_key: "" })),
    onError: (err) => {
      if ((err as ApiError).status === 401) onLocked();
    },
  });

  const testMutation = useMutation({
    mutationFn: () => testAdminConnection(token),
    onSuccess: (result) => setTestStatus(result.status),
    onError: (err) => {
      if ((err as ApiError).status === 401) onLocked();
    },
  });

  const testLabel: Record<AdminTestStatus, string> = {
    ok: "Connection works",
    auth_error: "Provider rejected the key — check it's correct",
    rate_limited: "Provider is rate-limiting this key right now",
    other_error: "Could not reach the provider — check the base URL/model",
  };

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">LLM Provider</h2>
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
        </div>
        <div className="space-y-1">
          <Label htmlFor="model_narrate">Narrate model</Label>
          <Input
            id="model_narrate"
            value={form.model_narrate}
            onChange={(e) => setForm((f) => ({ ...f, model_narrate: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="model_fallback">Fallback model</Label>
          <Input
            id="model_fallback"
            value={form.model_fallback}
            onChange={(e) => setForm((f) => ({ ...f, model_fallback: e.target.value }))}
          />
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

function InstructionsSection({
  token,
  settings,
  onLocked,
}: {
  token: string;
  settings: AdminSettings;
  onLocked: () => void;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          Chatbot Instructions
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Free text appended after each base prompt — not a replacement, so the assistant's
          underlying behavior stays intact even if this text is imperfect. Leave blank to use just
          the base prompt.
        </p>
      </div>
      {INSTRUCTION_FIELDS.map((field) => (
        <InstructionField
          key={field.key}
          token={token}
          fieldKey={field.key}
          title={field.title}
          description={field.description}
          initialValue={settings[field.key]}
          onLocked={onLocked}
        />
      ))}
    </section>
  );
}

function InstructionField({
  token,
  fieldKey,
  title,
  description,
  initialValue,
  onLocked,
}: {
  token: string;
  fieldKey: InstructionKey;
  title: string;
  description: string;
  initialValue: string;
  onLocked: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  const saveMutation = useMutation({
    mutationFn: () => updateAdminSettings(token, { [fieldKey]: value }),
    onError: (err) => {
      if ((err as ApiError).status === 401) onLocked();
    },
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
