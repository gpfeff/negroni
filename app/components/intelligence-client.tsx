"use client";

import { useEffect, useState } from "react";
import { createEmptyIntake } from "@/lib/intelligence/defaults";
import { ResearchReview } from "@/components/research-review";
import {
  RESEARCH_PROMPTS,
  type IntelligenceIntake,
  type ProfilesResponse,
  type ProviderStatus,
  type ResearchProfile,
  type RunCapability,
  type RunError,
  type RunResult,
  type SettingsResponse,
} from "@/lib/intelligence/contracts";
import { buildResearchName, parseRunResult, RUNNER_BLOCKER, validateIntake } from "@/lib/intelligence/validation";
import { operatingModeCopy, type OperatingMode } from "@/lib/operating-policy";

type AppView = "home" | "research" | "settings";
type ResearchSection = "run" | "client" | "customer" | "competitors" | "competitor-ads" | "review";
type Appearance = "light" | "dark" | "system";

const PHASES = [
  {
    number: "01",
    name: "Research",
    verb: "Find the signal",
    artifact: "research-brief.md",
    state: "Ready",
    color: "#70283c",
  },
  {
    number: "02",
    name: "Create",
    verb: "Make the argument",
    artifact: "creative-manifest.json",
    state: "Planned",
    color: "#a83e25",
  },
  {
    number: "03",
    name: "Launch",
    verb: "Prepare the delivery",
    artifact: "launch-diff.md",
    state: "Planned",
    color: "#315f7b",
  },
  {
    number: "04",
    name: "Iterate",
    verb: "Isolate the lesson",
    artifact: "experiment-result.json",
    state: "Planned",
    color: "#4e5d36",
  },
  {
    number: "05",
    name: "Loop",
    verb: "Compound the learning",
    artifact: "learning-ledger.jsonl",
    state: "Planned",
    color: "#5f5b55",
  },
] as const;

const PROMPT_LABELS: Record<(typeof RESEARCH_PROMPTS)[number], string> = {
  market_awareness: "Market awareness",
  competitor_research: "Competitor research",
  customer_avatar_psychographics: "Customer psychology",
  master_marketing_intelligence: "Master research",
  brand_tone_of_voice: "Tone of voice",
};

const RESEARCH_TOOLS: ReadonlyArray<{
  id: ResearchSection;
  eyebrow: string;
  name: string;
  description: string;
  marker: string;
}> = [
  {
    id: "run",
    eyebrow: "Start here",
    name: "Run Research",
    description: "Give Negroni four facts. The research skill builds the first evidence-backed draft.",
    marker: "GO",
  },
  {
    id: "client",
    eyebrow: "The three Cs",
    name: "Client",
    description: "The offer, economics, geography, goals, and boundaries the campaign must respect.",
    marker: "C1",
  },
  {
    id: "customer",
    eyebrow: "The three Cs",
    name: "Customer",
    description: "Pains, desires, objections, awareness, and the language people actually use.",
    marker: "C2",
  },
  {
    id: "competitors",
    eyebrow: "The three Cs",
    name: "Competitors",
    description: "Offers, positioning, proof, landing pages, and open space in the market.",
    marker: "C3",
  },
  {
    id: "competitor-ads",
    eyebrow: "Evidence source",
    name: "Competitor Ads",
    description: "Track public Meta ads, daily changes, creative families, and coverage limits.",
    marker: "AD",
  },
  {
    id: "review",
    eyebrow: "Approval gate",
    name: "Review & Approve",
    description: "Edit the research, preserve revisions, and approve one exact brief for Create.",
    marker: "OK",
  },
];

function downloadMarkdown(result: RunResult) {
  const blob = new Blob([result.outputs.markdown.content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.outputs.markdown.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function IntelligenceClient() {
  const [activeView, setActiveView] = useState<AppView>("home");
  const [intake, setIntake] = useState<IntelligenceIntake>(() => createEmptyIntake(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"));
  const [capability, setCapability] = useState<RunCapability>({ available: false, status: "blocked", blocker: RUNNER_BLOCKER });
  const [checking, setChecking] = useState(true);
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfilesResponse>({ available: false, records: [], blocker: null });
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [settingsAvailable, setSettingsAvailable] = useState(false);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [settingsBlocker, setSettingsBlocker] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useState("");
  const [kieKey, setKieKey] = useState("");
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>("dark");
  const [operatingMode, setOperatingMode] = useState<OperatingMode>("safety");
  const [activeResearchSection, setActiveResearchSection] = useState<ResearchSection>("run");

  async function refreshProfiles() {
    try {
      const response = await fetch("/api/profiles", { cache: "no-store" });
      const payload = await response.json() as ProfilesResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Saved research sets could not be loaded.");
      setProfiles(payload);
    } catch (error) {
      setProfiles({ available: false, records: [], blocker: error instanceof Error ? error.message : "Saved research sets are unavailable." });
    }
  }

  async function refreshSettings() {
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const payload = await response.json() as Partial<SettingsResponse> & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Provider settings could not be loaded.");
      setSettingsAvailable(payload.available === true);
      setProviderStatuses(payload.providers ?? []);
      setSettingsBlocker(payload.blocker ?? null);
    } catch (error) {
      setSettingsAvailable(false);
      setSettingsBlocker(error instanceof Error ? error.message : "Provider settings are unavailable.");
    }
  }

  useEffect(() => {
    let active = true;
    async function loadInitialState() {
      const [runResponse, profilesResponse, settingsResponse] = await Promise.allSettled([
        fetch("/api/run", { cache: "no-store" }).then(async (response) => (await response.json()) as RunCapability),
        fetch("/api/profiles", { cache: "no-store" }).then(async (response) => {
          const payload = await response.json() as ProfilesResponse & { error?: string };
          if (!response.ok) throw new Error(payload.error ?? "Saved research sets could not be loaded.");
          return payload;
        }),
        fetch("/api/settings", { cache: "no-store" }).then(async (response) => {
          const payload = await response.json() as Partial<SettingsResponse> & { error?: string };
          if (!response.ok) throw new Error(payload.error ?? "Provider settings could not be loaded.");
          return payload;
        }),
      ]);
      if (!active) return;
      const searchParams = new URLSearchParams(window.location.search);
      const requestedView = searchParams.get("view");
      if (requestedView === "research" || requestedView === "settings") setActiveView(requestedView);
      const requestedTool = searchParams.get("tool");
      if (RESEARCH_TOOLS.some((tool) => tool.id === requestedTool)) {
        setActiveResearchSection(requestedTool as ResearchSection);
      }
      setCapability(runResponse.status === "fulfilled"
        ? runResponse.value
        : { available: false, status: "blocked", blocker: RUNNER_BLOCKER });
      setChecking(false);
      setProfiles(profilesResponse.status === "fulfilled"
        ? profilesResponse.value
        : { available: false, records: [], blocker: profilesResponse.reason instanceof Error ? profilesResponse.reason.message : "Saved research sets are unavailable." });
      if (settingsResponse.status === "fulfilled") {
        setSettingsAvailable(settingsResponse.value.available === true);
        setProviderStatuses(settingsResponse.value.providers ?? []);
        setSettingsBlocker(settingsResponse.value.blocker ?? null);
      } else {
        setSettingsAvailable(false);
        setSettingsBlocker(settingsResponse.reason instanceof Error ? settingsResponse.reason.message : "Provider settings are unavailable.");
      }
    }
    void loadInitialState();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedAppearance = window.localStorage.getItem("negroni.appearance");
      const savedOperatingMode = window.localStorage.getItem("negroni.operating-mode");
      if (savedAppearance === "light" || savedAppearance === "dark" || savedAppearance === "system") {
        setAppearance(savedAppearance);
      }
      if (savedOperatingMode === "safety" || savedOperatingMode === "yolo") {
        setOperatingMode(savedOperatingMode);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    window.localStorage.setItem("negroni.appearance", appearance);
  }, [appearance]);

  useEffect(() => {
    window.localStorage.setItem("negroni.operating-mode", operatingMode);
  }, [operatingMode]);

  function updateIntake(field: "offer_or_lead_type" | "industry" | "country_region" | "target_age_range", value: string) {
    setIntake((current) => ({ ...current, [field]: value }));
  }

  function chooseProfile(id: string) {
    setSelectedProfileId(id);
    setProfileMessage(null);
    const profile = profiles.records.find((record) => record.id === id);
    if (!profile) return;
    setIntake((current) => ({
      ...current,
      offer_or_lead_type: profile.offer_or_lead_type,
      industry: profile.industry,
      country_region: profile.country_region,
      target_age_range: profile.target_age_range,
    }));
    setResult(null);
    setRunError(null);
    setErrors([]);
  }

  function newProfile() {
    setSelectedProfileId("");
    setIntake(createEmptyIntake(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"));
    setProfileMessage(null);
    setResult(null);
    setRunError(null);
    setErrors([]);
  }

  async function saveProfile(): Promise<string | null> {
    const validationErrors = validateIntake(intake);
    setErrors(validationErrors);
    if (validationErrors.length) return null;
    if (!profiles.available) {
      setProfileMessage(profiles.blocker ?? "Saved research sets are unavailable.");
      return null;
    }
    const response = await fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: selectedProfileId || undefined, intake }),
    });
    const payload = await response.json() as { id?: string; error?: string };
    if (!response.ok || !payload.id) {
      setProfileMessage(payload.error ?? "The research set could not be saved.");
      return null;
    }
    setSelectedProfileId(payload.id);
    setProfileMessage("Research set saved.");
    await refreshProfiles();
    return payload.id;
  }

  async function deleteProfile() {
    if (!selectedProfileId) return;
    if (!window.confirm("Delete this research set, its seed revisions, feedback, and Phase 2 approval? This cannot be undone.")) return;
    const response = await fetch("/api/profiles", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: selectedProfileId }),
    });
    if (!response.ok) {
      const payload = await response.json() as { error?: string };
      setProfileMessage(payload.error ?? "The research set could not be deleted.");
      return;
    }
    newProfile();
    await refreshProfiles();
    setProfileMessage("Research set deleted. It cannot be recovered.");
  }

  async function runResearch() {
    const validationErrors = validateIntake(intake);
    setErrors(validationErrors);
    setResult(null);
    setRunError(null);
    if (validationErrors.length || !capability.available) {
      if (!capability.available) setRunError(capability.blocker ?? RUNNER_BLOCKER);
      document.getElementById("run-status")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (profiles.available) await saveProfile();
    setRunning(true);
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(intake),
      });
      const payload = (await response.json()) as RunResult | RunError;
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "The research run failed.");
      const researchName = buildResearchName(intake.offer_or_lead_type, intake.country_region);
      setResult(parseRunResult(payload, researchName));
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "The research run failed.");
    } finally {
      setRunning(false);
      document.getElementById("run-status")?.scrollIntoView({ behavior: "smooth" });
    }
  }

  function providerStatus(provider: ProviderStatus["provider"]): ProviderStatus {
    return providerStatuses.find((item) => item.provider === provider)
      ?? { provider, status: settingsAvailable ? "not_connected" : "blocked", blocker: settingsBlocker };
  }

  async function connectProvider(provider: ProviderStatus["provider"]) {
    setSettingsBusy(true);
    setSettingsMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          provider === "gemini_api"
            ? { provider, api_key: geminiKey }
            : provider === "kie_ai"
              ? { provider, api_key: kieKey }
              : { provider },
        ),
      });
      const payload = await response.json() as { authorization_url?: string; connected?: boolean; message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The provider could not be connected.");
      if (payload.authorization_url) {
        const authorizationUrl = new URL(payload.authorization_url);
        if (authorizationUrl.protocol !== "https:") throw new Error("The OAuth authorization URL is invalid.");
        window.location.assign(authorizationUrl.toString());
        return;
      }
      setSettingsMessage(payload.message ?? (payload.connected ? "Connection verified." : "Connection needs one more step."));
      await refreshSettings();
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "The provider could not be connected.");
    } finally {
      setGeminiKey("");
      setKieKey("");
      setSettingsBusy(false);
    }
  }

  const codexStatus = providerStatus("codex_cli");
  const claudeStatus = providerStatus("claude_code");
  const geminiStatus = providerStatus("gemini_api");
  const geminiOAuthStatus = providerStatus("gemini_oauth");
  const kieStatus = providerStatus("kie_ai");
  const googleStatus = providerStatus("google_drive");
  const selectedProfile = profiles.records.find((profile) => profile.id === selectedProfileId) ?? null;

  function navigate(view: AppView) {
    setActiveView(view);
    const nextUrl = view === "home"
      ? window.location.pathname
      : `${window.location.pathname}?view=${view}`;
    window.history.replaceState(null, "", nextUrl);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openResearchSection(section: ResearchSection) {
    setActiveView("research");
    setActiveResearchSection(section);
    window.history.replaceState(null, "", `${window.location.pathname}?view=research&tool=${section}`);
    window.setTimeout(() => {
      const targetId = section === "run"
        ? "intake"
        : section === "competitor-ads"
          ? "competitor-ads"
          : section === "review"
            ? "research-review"
            : `research-${section}`;
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, activeView === "research" ? 0 : 50);
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <button className="brand" type="button" onClick={() => navigate("home")} aria-label="Negroni home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-copy"><strong>Negroni</strong><small>Paid lead generation</small></span>
        </button>
        <nav className="side-nav" aria-label="Application navigation">
          <span className="nav-label">Workspace</span>
          <button className={activeView === "home" ? "nav-active" : ""} type="button" onClick={() => navigate("home")}><span>⌂</span>Home</button>
          <span className="nav-label">Campaign phases</span>
          {PHASES.map((phase) => (
            <button
              className={phase.number === "01" && activeView === "research" ? "nav-active" : ""}
              key={phase.number}
              type="button"
              disabled={phase.number !== "01"}
              onClick={() => phase.number === "01" && navigate("research")}
            >
              <span>{phase.number}</span>{phase.name}{phase.number !== "01" ? <small>Planned</small> : null}
            </button>
          ))}
          {activeView === "research" ? (
            <div className="research-subnav" aria-label="Research tools">
              {RESEARCH_TOOLS.map((tool) => (
                <button
                  className={activeResearchSection === tool.id ? "research-subnav-active" : ""}
                  key={tool.id}
                  type="button"
                  onClick={() => openResearchSection(tool.id)}
                  aria-current={activeResearchSection === tool.id ? "page" : undefined}
                  aria-label={tool.id === "run" ? "Open research intake" : `Open ${tool.name}`}
                >
                  <span>{tool.marker}</span>{tool.name}
                </button>
              ))}
            </div>
          ) : null}
        </nav>
        <div className="sidebar-footer">
          <button className={`settings-nav ${activeView === "settings" ? "nav-active" : ""}`} type="button" onClick={() => navigate("settings")}><span>⚙</span>Settings</button>
          <div className="connection-state"><i /> Workspace ready · Negroni v0.9 beta</div>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <button className="campaign-switcher" type="button" onClick={() => navigate("research")}>
            <span>Campaign</span><strong>New lead-generation campaign</strong><b>⌄</b>
          </button>
          <div className="topbar-state"><span><i /> No live spend</span><b aria-label="User account">GP</b></div>
        </header>

      {activeView === "home" ? (
        <div className="dashboard" id="top">
          <section className="dashboard-heading" aria-labelledby="home-title">
            <div><p className="utility-label">Negroni campaign studio</p><h1 id="home-title">What are we making?</h1><p>Pick a tool to get started. Working on <strong>{selectedProfile?.offer_or_lead_type ?? "your next lead campaign"}</strong>.</p></div>
          </section>

          <section className="research-home-layout" aria-label="Research workspace">
            <div className="research-tool-board">
              <div className="research-board-heading">
                <div><span>01</span><i /><h2>Research</h2></div>
                <p>Know your customer, client, and market. Run once per campaign.</p>
              </div>
              <div className="research-tool-grid">
                {RESEARCH_TOOLS.map((tool, index) => (
                  <button
                    className={`research-tool-card ${index === 0 ? "research-tool-primary" : ""}`}
                    key={tool.id}
                    type="button"
                    onClick={() => openResearchSection(tool.id)}
                  >
                    <span className={`tool-visual tool-visual-${tool.id}`} aria-hidden="true" />
                    <span className="tool-marker" aria-hidden="true">{tool.marker}</span>
                    <span className="tool-copy">
                      <small>{tool.eyebrow}</small>
                      <strong>{tool.name}</strong>
                      <span>{tool.description}</span>
                    </span>
                    <b aria-hidden="true">↗</b>
                  </button>
                ))}
              </div>
            </div>

          </section>

          <section className="dashboard-lower">
            <article className="activity-card">
              <div className="section-title-row"><div><p className="utility-label">Agent activity</p><h2>Recent work</h2></div><small>Local workspace</small></div>
              <div className="empty-state"><span>●</span><div><strong>No runs yet</strong><p>Start Research to create the first prompt receipts and campaign artifact.</p></div></div>
            </article>
            <article className="artifacts-card">
              <div className="section-title-row"><div><p className="utility-label">Artifacts</p><h2>Campaign handoffs</h2></div><small>0 created</small></div>
              <ul>{PHASES.slice(0, 3).map((phase) => <li key={phase.number}><code>{phase.artifact}</code><span>Waiting</span></li>)}</ul>
            </article>
          </section>
        </div>
      ) : activeView === "research" ? (
        <div className="content-column" id="top">
          <section className="intro" aria-labelledby="page-title">
            <p className="kicker">Phase 01 · Find the signal</p>
            <h1 id="page-title">Tell us the business. We’ll find the signal.</h1>
            <p>Four inputs start one governed research skill. You get editable client, customer, and competitor intelligence—not a black-box answer.</p>
          </section>

          <section className="section-card" id="intake" aria-labelledby="intake-title">
            <div className="section-heading">
              <span>1</span>
              <div><h2 id="intake-title">Run Research</h2><p>Save and reuse each client, customer, and competitor research combination.</p></div>
            </div>

            <div className="record-bar">
              <label htmlFor="saved-profile">Saved research sets</label>
              <select id="saved-profile" value={selectedProfileId} onChange={(event) => chooseProfile(event.target.value)} disabled={!profiles.available}>
                <option value="">{profiles.available ? "New research set" : "Saved records unavailable"}</option>
                {profiles.records.map((profile: ResearchProfile) => (
                  <option key={profile.id} value={profile.id}>{profile.offer_or_lead_type} · {profile.country_region}</option>
                ))}
              </select>
              <button type="button" onClick={newProfile}>New</button>
              <button type="button" onClick={() => void saveProfile()} disabled={!profiles.available}>Save</button>
              <button className="record-review" type="button" onClick={() => openResearchSection("review")} disabled={!selectedProfileId}>Review seed</button>
              <button className="record-delete" type="button" onClick={() => void deleteProfile()} disabled={!selectedProfileId}>Delete</button>
            </div>
            {profiles.blocker ? <p className="inline-blocker">{profiles.blocker}</p> : null}
            {profileMessage ? <p className="inline-message" role="status">{profileMessage}</p> : null}

            <div className="intake-grid">
              <div className="input-group input-wide">
                <label htmlFor="offer-type">Lead offer or service <strong>Required</strong></label>
                <textarea id="offer-type" rows={3} value={intake.offer_or_lead_type} onChange={(event) => updateIntake("offer_or_lead_type", event.target.value)} placeholder="Example: Business loans for small businesses—or business-loan leads for lenders" />
                <small>Describe what the customer receives, or the lead product a buyer receives.</small>
              </div>
              <div className="input-group">
                <label htmlFor="industry">Industry <strong>Required</strong></label>
                <input id="industry" value={intake.industry} onChange={(event) => updateIntake("industry", event.target.value)} placeholder="Finance" autoComplete="organization-title" />
              </div>
              <div className="input-group">
                <label htmlFor="country-region">Country or region <strong>Required</strong></label>
                <input id="country-region" value={intake.country_region} onChange={(event) => updateIntake("country_region", event.target.value)} placeholder="United States" autoComplete="country-name" />
              </div>
              <div className="input-group">
                <label htmlFor="target-age">Target age range <strong>Required</strong></label>
                <input id="target-age" value={intake.target_age_range} onChange={(event) => updateIntake("target_age_range", event.target.value)} placeholder="30–60" inputMode="numeric" />
              </div>
            </div>

            <div className="prompt-sequence" aria-label="Five research prompts">
              {RESEARCH_PROMPTS.map((prompt, index) => <span key={prompt}><b>{index + 1}</b>{PROMPT_LABELS[prompt]}</span>)}
            </div>

            <div className="three-c-grid" aria-label="The three research streams">
              <article id="research-client">
                <span>C1</span><div><strong>Client</strong><p>Offer, goals, geography, economics, proof, and operating constraints.</p></div>
              </article>
              <article id="research-customer">
                <span>C2</span><div><strong>Customer</strong><p>Pains, desires, objections, awareness, triggers, and natural language.</p></div>
              </article>
              <article id="research-competitors">
                <span>C3</span><div><strong>Competitors</strong><p>Positioning, offers, claims, landing pages, ads, and market openings.</p></div>
              </article>
            </div>

            {errors.length ? <div className="validation-box" role="alert"><strong>Check the research setup</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
            <div className="run-row">
              <button className="run-button" type="button" onClick={() => void runResearch()} disabled={checking || running || !capability.available}>{running ? "Running five research prompts…" : checking ? "Checking research access…" : "Run research"}</button>
              <p>Public research, three requested files, and one nightly competitor monitor. No outreach, forms, purchases, campaigns, or account changes.</p>
            </div>
          </section>

          <section className="section-card" id="run-status" aria-labelledby="status-title">
            <div className="section-heading"><span>2</span><div><h2 id="status-title">Run status</h2><p>All five prompt receipts, limitations, and monitoring state remain visible.</p></div></div>
            <div className={`status-panel ${result?.status === "complete" ? "status-complete" : result?.status === "partial" ? "status-partial" : runError || (!checking && !capability.available) ? "status-blocked" : ""}`} aria-live="polite">
              <div><span className="status-dot" /><strong>{running ? "Researching" : result?.status === "complete" ? "Complete" : result?.status === "partial" ? "Complete with limitations" : runError || (!checking && !capability.available) ? "Blocked" : "Not started"}</strong></div>
              <p>{running ? "Running the five-prompt research sequence and creating the three deliverables." : result ? `Research completed ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.completed_at))}` : runError ?? capability.blocker ?? "Complete the four research inputs when you are ready."}</p>
            </div>
            <div className="monitoring-receipt">
              <strong>Nightly competitor ads</strong>
              {result?.competitor_monitoring.status === "active" ? (
                <p><span className="receipt-state receipt-active">Active</span> {result.competitor_monitoring.watch_count} verified competitor {result.competitor_monitoring.watch_count === 1 ? "watch" : "watches"} · 2:17 AM {result.competitor_monitoring.timezone} · next run {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: result.competitor_monitoring.timezone }).format(new Date(result.competitor_monitoring.next_run_at!))}</p>
              ) : result?.competitor_monitoring.status === "blocked" ? (
                <p><span className="receipt-state receipt-blocked">Blocked</span> {result.competitor_monitoring.blocker}</p>
              ) : (
                <p>Configured after competitor research verifies the watchlist. No schedule is claimed until the runner returns an active receipt.</p>
              )}
            </div>
            <div className="competitor-intelligence" id="competitor-ads" aria-labelledby="competitor-intelligence-title">
              <div className="competitor-intelligence-heading">
                <div>
                  <strong id="competitor-intelligence-title">Competitor Ads</strong>
                  <p>Meta Ads Intelligence is one evidence source inside competitor research.</p>
                </div>
                <span>{result ? result.competitor_ads.refresh_status.replaceAll("_", " ") : "Not available"}</span>
              </div>
              {result ? (
                <>
                  <dl className="competitor-metrics">
                    <div><dt>Last refresh</dt><dd>{result.competitor_ads.last_successful_refresh_at ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.competitor_ads.last_successful_refresh_at)) : "No successful refresh"}</dd></div>
                    <div><dt>Watched competitors</dt><dd>{result.competitor_ads.watched_competitors}</dd></div>
                    <div><dt>Active ads</dt><dd>{result.competitor_ads.active_ads}</dd></div>
                    <div><dt>New today</dt><dd>{result.competitor_ads.new_ads_today}</dd></div>
                    <div><dt>Changed ads</dt><dd>{result.competitor_ads.changed_ads}</dd></div>
                    <div><dt>Creative families</dt><dd>{result.competitor_ads.creative_families}</dd></div>
                  </dl>
                  <div className="competitor-links" aria-label="Competitor ads intelligence artifacts">
                    {result.competitor_ads.links.database ? <a href={result.competitor_ads.links.database} target="_blank" rel="noreferrer">Database receipt ↗</a> : <span>Database link unavailable</span>}
                    {result.competitor_ads.links.report_markdown ? <a href={result.competitor_ads.links.report_markdown} target="_blank" rel="noreferrer">Markdown report ↗</a> : <span>Markdown report unavailable</span>}
                    {result.competitor_ads.links.report_csv ? <a href={result.competitor_ads.links.report_csv} target="_blank" rel="noreferrer">CSV report ↗</a> : <span>CSV report unavailable</span>}
                    {result.competitor_ads.links.google_sheet ? <a href={result.competitor_ads.links.google_sheet} target="_blank" rel="noreferrer">Restricted Google Sheet ↗</a> : <span>Google publishing not configured.</span>}
                  </div>
                  <p className="competitor-coverage"><strong>Coverage limitations:</strong> {result.competitor_ads.coverage_limitations.length ? result.competitor_ads.coverage_limitations.join(" ") : "None recorded."}</p>
                  <p className="claims-boundary">{result.competitor_ads.claims_boundary}</p>
                </>
              ) : (
                <p className="competitor-empty">A validated run will show refresh health, observed ads, daily changes, creative families, coverage limitations, and access-controlled report links here.</p>
              )}
            </div>
            {result?.limitations.length ? <div className="limitations"><strong>Limitations</strong><p>{result.limitations.join(" ")}</p></div> : <div className="limitations"><strong>Limitations</strong><p>{!capability.available && !checking ? "Live research and native Google-file creation are unavailable until the five-prompt runner and Google Workspace connector are configured." : "Research limitations will appear here after the run."}</p></div>}
          </section>

          <section className="section-card" id="outputs" aria-labelledby="outputs-title">
            <div className="section-heading"><span>3</span><div><h2 id="outputs-title">Outputs</h2><p>The master Google Doc, matching Markdown, and competitor-ad Google Sheet.</p></div></div>
            <div className="output-grid">
              <a className={result ? "output-card" : "output-card output-disabled"} href={result?.outputs.google_doc.url ?? undefined} target="_blank" rel="noreferrer" aria-disabled={!result} onClick={(event) => { if (!result) event.preventDefault(); }}><span className="output-icon">D</span><div><strong>Open Google Doc</strong><small>{result?.outputs.google_doc.title ?? "Master research report"}</small></div><span aria-hidden="true">↗</span></a>
              <a
                className={result && (result.outputs.google_sheet.status === "published" || result.competitor_ads.links.report_markdown) ? "output-card" : "output-card output-disabled"}
                href={result?.outputs.google_sheet.status === "published" ? result.outputs.google_sheet.url : result?.competitor_ads.links.report_markdown ?? undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!result || (result.outputs.google_sheet.status !== "published" && !result.competitor_ads.links.report_markdown)}
                onClick={(event) => { if (!result || (result.outputs.google_sheet.status !== "published" && !result.competitor_ads.links.report_markdown)) event.preventDefault(); }}
              ><span className="output-icon sheet-icon">S</span><div><strong>{result?.outputs.google_sheet.status === "not_configured" ? "Open local competitor report" : "Open Google Sheet"}</strong><small>{result?.outputs.google_sheet.status === "not_configured" ? result.outputs.google_sheet.message : result?.outputs.google_sheet.title ?? "Competitor-ad archive · refreshed nightly"}</small></div><span aria-hidden="true">↗</span></a>
              <button className={result ? "output-card" : "output-card output-disabled"} type="button" disabled={!result} onClick={() => result && downloadMarkdown(result)}><span className="output-icon markdown-icon">M</span><div><strong>Download Markdown</strong><small>{result?.outputs.markdown.filename ?? "Portable master research report"}</small></div><span aria-hidden="true">↓</span></button>
            </div>
          </section>

          <ResearchReview key={selectedProfileId || "no-profile"} profile={selectedProfile} runResult={result} />
        </div>
      ) : (
        <div className="content-column settings-column" id="top">
          <section className="intro" aria-labelledby="settings-title">
            <p className="kicker">Your Negroni, your engines</p>
            <h1 id="settings-title">Choose how the work gets made.</h1>
            <p>Use Codex or Claude Code as the local operator, connect the media engines you trust, and decide how often Negroni pauses for approval. Secrets stay behind the browser.</p>
          </section>

          <section className="section-card settings-section" id="preferences">
            <div className="settings-heading">
              <span>01</span>
              <div><h2>Appearance &amp; approvals</h2><p>Personal preferences stay on this device. Campaign safety remains visible and explicit.</p></div>
            </div>
            <div className="preference-grid">
              <fieldset className="preference-card">
                <legend>Appearance</legend>
                <div className="segmented-control">
                  {(["light", "dark", "system"] as const).map((option) => (
                    <button className={appearance === option ? "selected" : ""} type="button" key={option} onClick={() => setAppearance(option)}>
                      {option[0].toUpperCase() + option.slice(1)}
                    </button>
                  ))}
                </div>
                <p>System follows this computer’s light or dark setting.</p>
              </fieldset>

              <fieldset className={`preference-card mode-card mode-${operatingMode}`}>
                <legend>Commit approvals</legend>
                <div className="segmented-control">
                  <button className={operatingMode === "safety" ? "selected" : ""} type="button" onClick={() => setOperatingMode("safety")}>Safety</button>
                  <button className={operatingMode === "yolo" ? "selected" : ""} type="button" onClick={() => setOperatingMode("yolo")}>YOLO</button>
                </div>
                <p>{operatingModeCopy(operatingMode)}</p>
                <strong>Spending, publishing, forms, budgets, and live traffic always stop for explicit approval.</strong>
              </fieldset>
            </div>
          </section>

          <section className="section-card settings-section" id="operators">
            <div className="settings-heading">
              <span>02</span>
              <div><h2>Agent operator</h2><p>Pick either one. Negroni checks the login already owned by the installed command-line tool.</p></div>
            </div>
            <div className="settings-grid">
              <article className="provider-card agent-card">
                <div><span className={`provider-dot provider-${codexStatus.status}`} /><strong>Codex</strong><span className="provider-badge">Local CLI</span></div>
                <p>Use your existing ChatGPT or API login. Negroni never reads or copies the OAuth token.</p>
                <small>{codexStatus.status === "connected" ? codexStatus.detail ?? "Signed in" : codexStatus.blocker ?? codexStatus.detail ?? "Login not detected"}</small>
                <button type="button" onClick={() => void connectProvider("codex_cli")} disabled={!settingsAvailable || settingsBusy}>{codexStatus.status === "connected" ? "Check Codex connection" : "Connect Codex"}</button>
              </article>

              <article className="provider-card agent-card">
                <div><span className={`provider-dot provider-${claudeStatus.status}`} /><strong>Claude Code</strong><span className="provider-badge">Local CLI</span></div>
                <p>Use Claude Code’s own Anthropic, Claude subscription, or enterprise login.</p>
                <small>{claudeStatus.status === "connected" ? claudeStatus.detail ?? "Signed in" : claudeStatus.blocker ?? claudeStatus.detail ?? "Login not detected"}</small>
                <button type="button" onClick={() => void connectProvider("claude_code")} disabled={!settingsAvailable || settingsBusy}>{claudeStatus.status === "connected" ? "Check Claude connection" : "Connect Claude Code"}</button>
              </article>
            </div>
          </section>

          <section className="section-card settings-section" id="connections">
            <div className="settings-heading">
              <span>03</span>
              <div><h2>API keys &amp; storage</h2><p>Paste keys here. They go straight to the server-side vault and are cleared from this form.</p></div>
            </div>
            <div className="settings-grid">
              <form className="provider-card media-card" onSubmit={(event) => { event.preventDefault(); void connectProvider("kie_ai"); }}>
                <div><span className={`provider-dot provider-${kieStatus.status}`} /><strong>Kie.ai</strong><span className="provider-badge">Images + video</span></div>
                <p>The creative media engine. Negroni will check credit and create asynchronous tasks only after the relevant approval gate.</p>
                <small>{kieStatus.status === "connected" ? kieStatus.detail ?? "Connected" : kieStatus.blocker ?? "Not connected"}</small>
                <label htmlFor="kie-key">Kie.ai API key</label>
                <input id="kie-key" type="password" value={kieKey} onChange={(event) => setKieKey(event.target.value)} placeholder="Paste key" autoComplete="off" disabled={!settingsAvailable} />
                <button type="submit" disabled={!settingsAvailable || settingsBusy || kieKey.trim().length < 20}>Save Kie.ai key</button>
              </form>

              <form className="provider-card" onSubmit={(event) => { event.preventDefault(); void connectProvider("gemini_api"); }}>
                <div><span className={`provider-dot provider-${geminiStatus.status === "connected" || geminiOAuthStatus.status === "connected" ? "connected" : geminiStatus.status}`} /><strong>Gemini</strong><span className="provider-badge">Two ways</span></div>
                <p>Use a Gemini API key now, or connect Google OAuth through Application Default Credentials in the installed edition.</p>
                <small>
                  {geminiStatus.status === "connected"
                    ? "API key connected"
                    : geminiOAuthStatus.status === "connected"
                      ? "Google OAuth connected"
                      : geminiStatus.blocker ?? geminiOAuthStatus.blocker ?? "Not connected"}
                </small>
                <label htmlFor="gemini-key">Gemini API key</label>
                <input id="gemini-key" type="password" value={geminiKey} onChange={(event) => setGeminiKey(event.target.value)} placeholder="Paste key" autoComplete="off" disabled={!settingsAvailable} />
                <div className="provider-actions">
                  <button type="submit" disabled={!settingsAvailable || settingsBusy || geminiKey.trim().length < 20}>Save API key</button>
                  <button type="button" onClick={() => void connectProvider("gemini_oauth")} disabled={!settingsAvailable || settingsBusy || geminiOAuthStatus.status === "blocked"}>Check Google OAuth</button>
                </div>
              </form>

              <article className="provider-card drive-card">
                <div className="provider-title">
                  <span className={`provider-dot provider-${googleStatus.status}`} />
                  <strong>Google Drive</strong>
                  <span className="provider-badge">Auto-file</span>
                </div>
                <p>Negroni creates a private <b>Negroni Research</b> folder, then stores the Google Doc, Markdown copy, and optional competitor Sheet projection there.</p>
                <div className="storage-route" aria-label="Google Doc, Google Sheet, and Markdown are stored in the Negroni Research folder">
                  <span className="storage-file storage-doc">Doc</span>
                  <span className="storage-file storage-sheet">Sheet</span>
                  <span className="storage-file storage-markdown">MD</span>
                  <span className="storage-arrow" aria-hidden="true">→</span>
                  <span className="storage-folder">Negroni Research</span>
                </div>
                <small>
                  {googleStatus.status === "connected" && googleStatus.auto_store
                    ? `${googleStatus.account_email ? `${googleStatus.account_email} · ` : ""}Auto-store on · ${googleStatus.folder_name ?? "Negroni Research"}`
                    : googleStatus.status === "connected"
                      ? "Connected, but automatic storage has not been verified."
                      : googleStatus.blocker ?? "Not connected"}
                </small>
                <button type="button" onClick={() => void connectProvider("google_drive")} disabled={!settingsAvailable || settingsBusy || googleStatus.status === "blocked"}>
                  {googleStatus.status === "connected" ? "Reconnect Google Drive" : "Connect Google Drive"}
                </button>
              </article>
            </div>
          </section>

          <section className="section-card settings-section" id="local-setup">
            <div className="settings-heading">
              <span>04</span>
              <div><h2>Local app setup</h2><p>The installed app is the secure bridge between this screen and your command-line logins or API-key vault.</p></div>
            </div>
            <div className={`local-setup-card ${settingsAvailable ? "local-setup-ready" : ""}`}>
              <div className="local-setup-state">
                <span className={`provider-dot provider-${settingsAvailable ? "connected" : "blocked"}`} />
                <div><strong>{settingsAvailable ? "Secure bridge ready" : "Secure bridge not connected"}</strong><small>{settingsAvailable ? "Provider controls and key fields are available." : "Start the installed Negroni app to unlock provider controls."}</small></div>
              </div>
              <ol className="setup-steps">
                <li><span>1</span><div><strong>Start Negroni</strong><p>Open Terminal and run <code>negroni start</code>.</p></div></li>
                <li><span>2</span><div><strong>Return to Settings</strong><p>Your Codex or Claude login status and API-key fields will become available.</p></div></li>
                <li><span>3</span><div><strong>Add connections here</strong><p>Keys are stored under <code>~/.negroni</code> with owner-only permissions—not in the browser or project.</p></div></li>
              </ol>
              {settingsBlocker ? <div className="settings-blocker"><strong>Connection setup needed</strong><p>{settingsBlocker}</p></div> : null}
            </div>
          </section>

          <section className="settings-feedback" aria-live="polite">
            {settingsMessage ? <p className="inline-message" role="status">{settingsMessage}</p> : null}
          </section>
        </div>
      )}

      </main>
      <aside className="app-right-rail" aria-label="Up next">
        <section className="weekly-goal">
          <div><span>This week</span><button type="button" disabled title="Goal editing is planned">Edit goal</button></div>
          <strong><b>0</b> / 20 ads</strong>
          <progress max={20} value={0}>0 of 20 ads</progress>
          <p>Build the research foundation, then ship the first campaign assets.</p>
          <small>Resets in 5 days</small>
        </section>
        <section className="up-next">
          <h2>Up next</h2>
          <div className="next-rail-list">
            <article className="next-rail-primary">
              <span>Do this next</span>
              <strong>{selectedProfile ? "Continue customer research" : "Run customer research"}</strong>
              <p>Mine what your customers actually say—it fuels every ad you make.</p>
              <button type="button" onClick={() => openResearchSection("run")}>Start →</button>
            </article>
            <article>
              <strong>Complete the client brief</strong>
              <p>Capture the offer, economics, proof, and campaign boundaries.</p>
              <button type="button" onClick={() => openResearchSection("client")}>Start →</button>
            </article>
            <article>
              <strong>Spy on competitor ads</strong>
              <p>See what is already winning in your niche.</p>
              <button type="button" onClick={() => openResearchSection("competitor-ads")}>Start →</button>
            </article>
          </div>
        </section>
      </aside>
    </div>
  );
}
