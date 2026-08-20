import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileJson,
  FileSpreadsheet,
  KeyRound,
  LockKeyhole,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type ChoiceBreakdown = { yes: number; maybe: number; no: number; total: number };
type FunnelRow = { event: string; label: string; count: number; rate: number };
type ActivityPoint = { date: string; count: number };
type RecentSession = {
  session_id: string;
  participant_code: string;
  submitted_at_utc: string;
  completion_state: string;
  zero_touch_success: boolean | null;
  recording_status: string;
  caregiver_disposition: string | null;
  overall_value_rating: number | null;
  pilot_interest: string | null;
  privacy_rating: number | null;
};
type ErrorRow = {
  received_at_utc: string;
  error_code: string;
  payload_type: string;
  session_id: string | null;
};

type KpiSummary = {
  generated_at_utc: string;
  definitions: {
    submitted_tests: string;
    completion_rate: string;
    hands_free_success: string;
    recording_success: string;
    value_rating: string;
    pilot_interest: string;
  };
  counts: {
    submitted_sessions: number;
    analytics_sessions: number;
    leads: number;
    ingestion_errors_7d: number;
    feedback_responses: number;
  };
  rates: {
    completion_rate: number | null;
    hands_free_success: number | null;
    recording_success: number | null;
    reminder_delivery: number | null;
    camera_permission: number | null;
    microphone_permission: number | null;
    privacy_stop: number | null;
    technical_error: number | null;
  };
  averages: {
    overall_value_rating: number | null;
    privacy_rating: number | null;
    review_duration_seconds: number | null;
    recording_duration_seconds: number | null;
    prompt_repeat_count: number | null;
  };
  choices: {
    would_consider_use: ChoiceBreakdown;
    pilot_interest: ChoiceBreakdown;
  };
  review: {
    dispositions: Array<{ key: string; label: string; count: number; rate: number }>;
    burden: Array<{ key: string; label: string; count: number; rate: number }>;
    clip_usefulness: Array<{ key: string; label: string; count: number; rate: number }>;
    prompt_comprehension: Array<{ key: string; label: string; count: number; rate: number }>;
    false_reassurance: Array<{ key: string; label: string; count: number; rate: number }>;
  };
  funnel: FunnelRow[];
  activity: ActivityPoint[];
  recent_sessions: RecentSession[];
  recent_errors: ErrorRow[];
};

type AuthState = "checking" | "locked" | "authenticated" | "unavailable";

const API = "/api/kpi";

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function rating(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} / 5`;
}

function seconds(value: number | null): string {
  if (value === null) return "—";
  if (value < 60) return `${Math.round(value)} sec`;
  return `${(value / 60).toFixed(1)} min`;
}

function prettyKey(value: string | null): string {
  if (!value) return "Not recorded";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function initials(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9]/g, "");
  return cleaned.slice(-4).toUpperCase() || "TEST";
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error_code?: string;
    message?: string;
  };
  if (!response.ok) {
    throw Object.assign(new Error(data.message || data.error_code || "Request failed."), {
      status: response.status,
      data,
    });
  }
  return data;
}

function MetricCard({
  label,
  value,
  detail,
  tone = "teal",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "teal" | "coral" | "ink";
}) {
  return (
    <article className={`kpi-metric-card kpi-tone-${tone}`}>
      <div className="kpi-metric-topline">
        <span>{label}</span>
        <span className="kpi-metric-dot" aria-hidden="true" />
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function ProgressList({
  items,
}: {
  items: Array<{ label: string; value: string; rate: number | null }>;
}) {
  return (
    <div className="kpi-progress-list">
      {items.map((item) => (
        <div className="kpi-progress-row" key={item.label}>
          <div className="kpi-progress-label">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
          <div className="kpi-progress-track" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(100, item.rate ?? 0))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChoiceBars({ title, data }: { title: string; data: ChoiceBreakdown }) {
  const options = [
    { key: "yes", label: "Yes", value: data.yes },
    { key: "maybe", label: "Maybe", value: data.maybe },
    { key: "no", label: "No", value: data.no },
  ] as const;
  return (
    <article className="kpi-choice-card">
      <div className="kpi-section-kicker">Customer signal</div>
      <h3>{title}</h3>
      <div className="kpi-choice-stack">
        {options.map((option) => {
          const rate = data.total ? (option.value / data.total) * 100 : 0;
          return (
            <div className="kpi-choice-row" key={option.key}>
              <span>{option.label}</span>
              <div className="kpi-choice-track" aria-hidden="true">
                <span className={`choice-${option.key}`} style={{ width: `${rate}%` }} />
              </div>
              <strong>{data.total ? `${Math.round(rate)}%` : "—"}</strong>
            </div>
          );
        })}
      </div>
      <p className="kpi-card-footnote">{data.total} submitted response{data.total === 1 ? "" : "s"}</p>
    </article>
  );
}

function ActivityChart({ points }: { points: ActivityPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.count));
  return (
    <div className="kpi-activity-chart" role="img" aria-label="Submitted tests by day">
      {points.map((point) => {
        const height = point.count === 0 ? 4 : Math.max(10, (point.count / max) * 100);
        const day = new Date(`${point.date}T12:00:00`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
        return (
          <div className="kpi-activity-column" key={point.date}>
            <span className="kpi-activity-value">{point.count}</span>
            <div className="kpi-activity-bar-wrap">
              <span className="kpi-activity-bar" style={{ height: `${height}%` }} />
            </div>
            <span className="kpi-activity-day">{day}</span>
          </div>
        );
      })}
    </div>
  );
}

function LoginPanel({
  onAuthenticated,
  unavailable,
}: {
  onAuthenticated: () => void;
  unavailable?: string;
}) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState(unavailable ?? "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || status === "working") return;
    setStatus("working");
    setMessage("");
    try {
      await apiJson<{ ok: true }>(`${API}?action=login`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      onAuthenticated();
    } catch (error) {
      const statusCode =
        typeof error === "object" && error && "status" in error
          ? Number((error as { status: number }).status)
          : 0;
      setStatus("error");
      setMessage(
        statusCode === 429
          ? "Too many attempts. Please wait and try again."
          : statusCode === 503
            ? "The private dashboard is not configured on this deployment."
            : "That password was not accepted.",
      );
    }
  }

  return (
    <main className="kpi-login-page">
      <section className="kpi-login-card">
        <div className="kpi-login-mark">
          <LockKeyhole size={26} />
        </div>
        <p className="eyebrow">Private founder workspace</p>
        <h1>Memolens Learning Dashboard</h1>
        <p className="kpi-login-copy">
          Research KPIs, testing quality, customer signals, and controlled data exports.
        </p>
        <form onSubmit={submit} className="kpi-login-form">
          <label htmlFor="kpi-password">Dashboard password</label>
          <div className="kpi-password-wrap">
            <KeyRound size={18} />
            <input
              id="kpi-password"
              autoComplete="current-password"
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter private password"
            />
          </div>
          {message ? (
            <div className="kpi-login-error" role="alert">
              <AlertTriangle size={16} />
              <span>{message}</span>
            </div>
          ) : null}
          <button className="button button-primary button-full" type="submit" disabled={!password || status === "working"}>
            {status === "working" ? "Checking…" : "Access dashboard"}
          </button>
        </form>
        <div className="kpi-security-note">
          <ShieldCheck size={17} />
          <span>Password verification and research reads happen server-side. The browser never receives the database secret key.</span>
        </div>
      </section>
    </main>
  );
}

export function KpiPage() {
  const [auth, setAuth] = useState<AuthState>("checking");
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [unavailableMessage, setUnavailableMessage] = useState("");

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<KpiSummary>(`${API}?action=summary`);
      setSummary(data);
      setAuth("authenticated");
    } catch (caught) {
      const statusCode =
        typeof caught === "object" && caught && "status" in caught
          ? Number((caught as { status: number }).status)
          : 0;
      if (statusCode === 401) {
        setAuth("locked");
        setSummary(null);
      } else if (statusCode === 503) {
        setAuth("unavailable");
        setUnavailableMessage("The private KPI environment variables are not configured yet.");
      } else {
        const data =
          typeof caught === "object" && caught && "data" in caught
            ? (caught as { data?: { message?: string; failed_dataset?: string } }).data
            : undefined;

        // The login/session is valid; only the research data read failed.
        // Move out of the initial auth-checking state so the recoverable
        // "Dashboard data unavailable" screen can render.
        setAuth("authenticated");
        setError(
          data?.message ||
            "The dashboard data could not be refreshed. Check the Supabase server key and applied database migrations.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const result = await apiJson<{ authenticated: boolean; configured: boolean }>(`${API}?action=status`);
        if (!result.configured) {
          setAuth("unavailable");
          setUnavailableMessage("The private KPI environment variables are not configured yet.");
        } else if (result.authenticated) {
          await loadSummary();
        } else {
          setAuth("locked");
        }
      } catch {
        setAuth("unavailable");
        setUnavailableMessage("The KPI API is unavailable on this environment. Use the deployed Vercel app or run it with Vercel dev.");
      }
    })();
  }, [loadSummary]);

  const logout = async () => {
    try {
      await apiJson<{ ok: true }>(`${API}?action=logout`, { method: "POST", body: "{}" });
    } finally {
      setSummary(null);
      setAuth("locked");
    }
  };

  const maxFunnel = useMemo(
    () => Math.max(1, ...(summary?.funnel.map((row) => row.count) ?? [1])),
    [summary],
  );

  if (auth === "checking") {
    return (
      <main className="kpi-login-page">
        <section className="kpi-login-card kpi-checking">
          <RefreshCw className="spin" size={28} />
          <h1>Opening learning dashboard</h1>
          <p>Checking your private dashboard session.</p>
        </section>
      </main>
    );
  }

  if (auth === "locked" || auth === "unavailable") {
    return (
      <LoginPanel
        unavailable={auth === "unavailable" ? unavailableMessage : undefined}
        onAuthenticated={() => {
          setAuth("authenticated");
          void loadSummary();
        }}
      />
    );
  }

  if (!summary) {
    if (loading) {
      return (
        <main className="kpi-login-page">
          <section className="kpi-login-card kpi-checking">
            <RefreshCw className="spin" size={28} />
            <h1>Loading research signals</h1>
            <p>Preparing the current KPI view.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="kpi-login-page">
        <section className="kpi-login-card">
          <div className="kpi-login-mark">
            <AlertTriangle size={26} />
          </div>
          <p className="eyebrow">Private founder workspace</p>
          <h1>Dashboard data unavailable</h1>
          <p className="kpi-login-copy">
            {error || "The research database could not be read. Your login session is still valid."}
          </p>
          <div className="kpi-login-error" role="alert">
            <AlertTriangle size={16} />
            <span>
              This is a data-read/configuration problem, not a password problem. Verify the Supabase server key and that migrations 202608200002 and 202608200003 were applied.
            </span>
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            <button className="button button-primary button-full" type="button" onClick={() => void loadSummary()}>
              <RefreshCw size={16} />
              Retry dashboard
            </button>
            <button className="button button-secondary button-full" type="button" onClick={() => void logout()}>
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="kpi-page">
      <header className="kpi-header">
        <div className="kpi-container kpi-header-inner">
          <div>
            <div className="kpi-brand-line">
              <span className="kpi-brand-badge"><Sparkles size={16} /></span>
              <span>Memolens</span>
              <span className="kpi-private-chip">Private</span>
            </div>
            <h1>Learning & KPI Dashboard</h1>
            <p>What the MVP is teaching us about reliability, caregiver value, and readiness for the next validation step.</p>
          </div>
          <div className="kpi-header-actions">
            <button className="button button-secondary button-small" type="button" onClick={() => void loadSummary()} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              Refresh
            </button>
            <div className="kpi-export-control">
              <button className="button button-primary button-small" type="button" onClick={() => setExportOpen((value) => !value)}>
                <Download size={16} />
                Export data
                <ChevronDown size={15} />
              </button>
              {exportOpen ? (
                <div className="kpi-export-menu">
                  <a href={`${API}?action=export&dataset=sessions`}>
                    <FileSpreadsheet size={16} />
                    <span><strong>Test sessions CSV</strong><small>Anonymous research outcomes</small></span>
                  </a>
                  <a href={`${API}?action=export&dataset=analytics`}>
                    <FileSpreadsheet size={16} />
                    <span><strong>Analytics events CSV</strong><small>Workflow and interaction events</small></span>
                  </a>
                  <a href={`${API}?action=export&dataset=errors`}>
                    <FileSpreadsheet size={16} />
                    <span><strong>Ingestion errors CSV</strong><small>Technical diagnostics only</small></span>
                  </a>
                  <a className="kpi-export-sensitive" href={`${API}?action=export&dataset=leads`}>
                    <Users size={16} />
                    <span><strong>Contact leads CSV</strong><small>Contains identifiable contact data</small></span>
                  </a>
                  <a href={`${API}?action=export&dataset=all`}>
                    <FileJson size={16} />
                    <span><strong>Research backup JSON</strong><small>All four tables at download time</small></span>
                  </a>
                </div>
              ) : null}
            </div>
            <button className="kpi-icon-button" type="button" onClick={() => void logout()} aria-label="Sign out of KPI dashboard">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="kpi-container kpi-main">
        <div className="kpi-meta-row">
          <div className="kpi-live-label"><span /> Live from Supabase</div>
          <p>
            Updated {new Date(summary.generated_at_utc).toLocaleString()} · {summary.counts.submitted_sessions} submitted test session{summary.counts.submitted_sessions === 1 ? "" : "s"}
          </p>
        </div>

        {error ? <div className="kpi-page-alert"><AlertTriangle size={17} />{error}</div> : null}

        <section className="kpi-metric-grid" aria-label="Headline KPIs">
          <MetricCard
            label="Submitted tests"
            value={String(summary.counts.submitted_sessions)}
            detail={`${summary.counts.feedback_responses} with post-test feedback`}
          />
          <MetricCard
            label="Completion rate"
            value={percent(summary.rates.completion_rate)}
            detail="Closed workflow among analytics test sessions"
          />
          <MetricCard
            label="Hands-free success"
            value={percent(summary.rates.hands_free_success)}
            detail="Care-recipient flow completed without interaction"
          />
          <MetricCard
            label="Recording success"
            value={percent(summary.rates.recording_success)}
            detail="Memo evidence available after capture"
          />
          <MetricCard
            label="Overall value"
            value={rating(summary.averages.overall_value_rating)}
            detail="Average voluntary post-test rating"
            tone="coral"
          />
          <MetricCard
            label="Pilot interest"
            value={
              summary.choices.pilot_interest.total
                ? `${Math.round(((summary.choices.pilot_interest.yes + summary.choices.pilot_interest.maybe) / summary.choices.pilot_interest.total) * 100)}%`
                : "—"
            }
            detail="Yes + Maybe among submitted responses"
            tone="ink"
          />
        </section>

        <section className="kpi-grid-two kpi-section-space">
          <article className="kpi-panel">
            <div className="kpi-panel-heading">
              <div>
                <p className="kpi-section-kicker">MVP funnel</p>
                <h2>From intent to caregiver review</h2>
              </div>
              <BarChart3 size={21} />
            </div>
            <div className="kpi-funnel">
              {summary.funnel.map((row, index) => (
                <div className="kpi-funnel-row" key={row.event}>
                  <div className="kpi-funnel-copy">
                    <span>{index + 1}</span>
                    <strong>{row.label}</strong>
                    <em>{row.count}</em>
                  </div>
                  <div className="kpi-funnel-track" aria-hidden="true">
                    <span style={{ width: `${(row.count / maxFunnel) * 100}%` }} />
                  </div>
                  <small>{index === 0 ? "baseline" : `${Math.round(row.rate)}% of starts`}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="kpi-panel">
            <div className="kpi-panel-heading">
              <div>
                <p className="kpi-section-kicker">Product reliability</p>
                <h2>Can the core loop work consistently?</h2>
              </div>
              <CheckCircle2 size={21} />
            </div>
            <ProgressList
              items={[
                { label: "Reminder delivered", value: percent(summary.rates.reminder_delivery), rate: summary.rates.reminder_delivery },
                { label: "Recording success", value: percent(summary.rates.recording_success), rate: summary.rates.recording_success },
                { label: "Hands-free success", value: percent(summary.rates.hands_free_success), rate: summary.rates.hands_free_success },
                { label: "Camera permission", value: percent(summary.rates.camera_permission), rate: summary.rates.camera_permission },
                { label: "Microphone permission", value: percent(summary.rates.microphone_permission), rate: summary.rates.microphone_permission },
                { label: "No technical error", value: summary.rates.technical_error === null ? "—" : percent(100 - summary.rates.technical_error), rate: summary.rates.technical_error === null ? null : 100 - summary.rates.technical_error },
              ]}
            />
            <div className="kpi-mini-stats">
              <div><span>Avg recording</span><strong>{seconds(summary.averages.recording_duration_seconds)}</strong></div>
              <div><span>Avg review</span><strong>{seconds(summary.averages.review_duration_seconds)}</strong></div>
              <div><span>Avg repeats</span><strong>{summary.averages.prompt_repeat_count?.toFixed(1) ?? "—"}</strong></div>
              <div><span>Privacy stop</span><strong>{percent(summary.rates.privacy_stop)}</strong></div>
            </div>
          </article>
        </section>

        <section className="kpi-grid-two kpi-section-space">
          <ChoiceBars title="Would consider using Memolens" data={summary.choices.would_consider_use} />
          <ChoiceBars title="Interested in a future pilot" data={summary.choices.pilot_interest} />
        </section>

        <section className="kpi-grid-two kpi-section-space">
          <article className="kpi-panel">
            <div className="kpi-panel-heading">
              <div>
                <p className="kpi-section-kicker">Caregiver review</p>
                <h2>What happened after the Memo?</h2>
              </div>
              <Users size={21} />
            </div>
            <ProgressList
              items={summary.review.dispositions.slice(0, 6).map((item) => ({
                label: item.label,
                value: `${item.count} · ${Math.round(item.rate)}%`,
                rate: item.rate,
              }))}
            />
            <p className="kpi-card-footnote">
              These are caregiver review outcomes, not automated medication decisions.
            </p>
          </article>

          <article className="kpi-panel">
            <div className="kpi-panel-heading">
              <div>
                <p className="kpi-section-kicker">Experience quality</p>
                <h2>Caregiver usefulness & burden</h2>
              </div>
              <ShieldCheck size={21} />
            </div>
            <div className="kpi-quality-grid">
              <div>
                <span>Privacy rating</span>
                <strong>{rating(summary.averages.privacy_rating)}</strong>
              </div>
              <div>
                <span>Review burden</span>
                <strong>{summary.review.burden[0]?.label ?? "—"}</strong>
              </div>
              <div>
                <span>Memo usefulness</span>
                <strong>{summary.review.clip_usefulness[0]?.label ?? "—"}</strong>
              </div>
              <div>
                <span>Reminder comprehension</span>
                <strong>{summary.review.prompt_comprehension[0]?.label ?? "—"}</strong>
              </div>
            </div>
            <div className="kpi-safety-callout">
              <ShieldCheck size={18} />
              <div>
                <strong>Safety signal</strong>
                <p>
                  False reassurance marked “Yes”: {summary.review.false_reassurance.find((item) => item.key === "yes")?.count ?? 0}
                </p>
              </div>
            </div>
          </article>
        </section>

        <section className="kpi-panel kpi-section-space">
          <div className="kpi-panel-heading">
            <div>
              <p className="kpi-section-kicker">Testing activity</p>
              <h2>Submitted sessions over the last 14 days</h2>
            </div>
            <Clock3 size={21} />
          </div>
          <ActivityChart points={summary.activity} />
        </section>

        <section className="kpi-panel kpi-section-space">
          <div className="kpi-panel-heading kpi-table-heading">
            <div>
              <p className="kpi-section-kicker">Recent tests</p>
              <h2>Latest submitted research sessions</h2>
            </div>
            <span className="kpi-table-chip">{summary.recent_sessions.length} shown</span>
          </div>
          <div className="kpi-table-wrap">
            <table className="kpi-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Submitted</th>
                  <th>Hands-free</th>
                  <th>Recording</th>
                  <th>Review outcome</th>
                  <th>Value</th>
                  <th>Pilot</th>
                </tr>
              </thead>
              <tbody>
                {summary.recent_sessions.length ? summary.recent_sessions.map((session) => (
                  <tr key={session.session_id}>
                    <td>
                      <span className="kpi-participant-avatar">{initials(session.participant_code)}</span>
                      <strong>{session.participant_code || "Anonymous"}</strong>
                    </td>
                    <td>{new Date(session.submitted_at_utc).toLocaleString()}</td>
                    <td><span className={`kpi-status ${session.zero_touch_success === true ? "ok" : session.zero_touch_success === false ? "warn" : ""}`}>{session.zero_touch_success === null ? "—" : session.zero_touch_success ? "Yes" : "No"}</span></td>
                    <td>{prettyKey(session.recording_status)}</td>
                    <td>{prettyKey(session.caregiver_disposition)}</td>
                    <td>{session.overall_value_rating ? `${session.overall_value_rating}/5` : "—"}</td>
                    <td>{prettyKey(session.pilot_interest)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} className="kpi-empty-cell">No submitted test sessions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="kpi-grid-two kpi-section-space kpi-bottom-grid">
          <article className="kpi-panel">
            <div className="kpi-panel-heading">
              <div>
                <p className="kpi-section-kicker">Research operations</p>
                <h2>Data health</h2>
              </div>
              <ShieldCheck size={21} />
            </div>
            <div className="kpi-data-health">
              <div><span>Analytics sessions</span><strong>{summary.counts.analytics_sessions}</strong></div>
              <div><span>Contact leads</span><strong>{summary.counts.leads}</strong></div>
              <div><span>Ingestion errors · 7 days</span><strong>{summary.counts.ingestion_errors_7d}</strong></div>
              <div><span>Feedback responses</span><strong>{summary.counts.feedback_responses}</strong></div>
            </div>
          </article>
          <article className="kpi-panel">
            <div className="kpi-panel-heading">
              <div>
                <p className="kpi-section-kicker">Interpretation guardrail</p>
                <h2>How to read these KPIs</h2>
              </div>
              <AlertTriangle size={21} />
            </div>
            <ul className="kpi-definition-list">
              <li><strong>Early MVP evidence, not clinical efficacy.</strong> These results describe prototype testing.</li>
              <li><strong>Denominators vary.</strong> Voluntary feedback measures use only submitted responses.</li>
              <li><strong>No video/audio is in this dashboard.</strong> Memo media remains local to the test device.</li>
              <li><strong>Leads are separate.</strong> Contact exports contain identifiable information and should be handled accordingly.</li>
            </ul>
          </article>
        </section>

        <footer className="kpi-footer">
          <p>Memolens supervised research prototype · Private founder/research dashboard</p>
          <p>Generated from current Supabase records. Refresh or export to retrieve the latest available data.</p>
        </footer>
      </main>
    </div>
  );
}
