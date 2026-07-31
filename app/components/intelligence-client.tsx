"use client";

import { Fragment, useEffect, useState } from "react";
import { createEmptyIntake } from "@/lib/intelligence/defaults";
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
import { deriveHomeNextAction } from "@/lib/intelligence/next-action";
import { operatingModeCopy, type OperatingMode } from "@/lib/operating-policy";

type AppView = "home" | "research" | "draper" | "settings";
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
  master_marketing_intelligence: "4A · Master research",
  brand_tone_of_voice: "4B · Brand tone",
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
    description: "Start with the customer profile, then define the research scope for an evidence-backed draft.",
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
      if (requestedView === "research" || requestedView === "draper" || requestedView === "settings") setActiveView(requestedView);
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

  function updateIntake(field:
    | "client_customer_name"
    | "profession_job_title"
    | "company_name"
    | "website_or_public_profile_url"
    | "service_or_offer_purchased"
    | "competitor_used"
    | "offer_or_lead_type"
    | "industry"
    | "country_region"
    | "target_age_range"
    | "approved_prompt", value: string) {
    setIntake((current) => ({ ...current, [field]: value }));
  }

  function chooseProfile(id: string) {
    setSelectedProfileId(id);
    setProfileMessage(null);
    const profile = profiles.records.find((record) => record.id === id);
    if (!profile) return;
    setIntake((current) => ({
      ...current,
      client_customer_name: profile.client_customer_name,
      profession_job_title: profile.profession_job_title,
      company_name: profile.company_name,
      website_or_public_profile_url: profile.website_or_public_profile_url,
      service_or_offer_purchased: profile.service_or_offer_purchased,
      competitor_used: profile.competitor_used,
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
  const nextAction = deriveHomeNextAction({
    checking,
    capability,
    hasProfile: selectedProfile !== null,
    resultStatus: result?.status ?? null,
  });

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

  function followHomeNextAction() {
    switch (nextAction.action?.destination) {
      case "settings":
        navigate("settings");
        break;
      case "research":
        openResearchSection("run");
        break;
      case "run":
        openResearchSection("run");
        void runResearch();
        break;
      case "status":
        openResearchSection("run");
        window.setTimeout(() => document.getElementById("run-status")?.scrollIntoView({ behavior: "smooth", block: "start" }), 75);
        break;
      case "review":
        openResearchSection("review");
        break;
      default:
        break;
    }
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
            <Fragment key={phase.number}>
              <button
                className={phase.number === "01" && activeView === "research" ? "nav-active" : ""}
                type="button"
                disabled={phase.number !== "01"}
                onClick={() => phase.number === "01" && navigate("research")}
              >
                <span>{phase.number}</span>{phase.name}{phase.number !== "01" ? <small>Planned</small> : null}
              </button>
              {phase.number === "01" && activeView === "research" ? (
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
            </Fragment>
          ))}
          <span className="nav-label">Tools</span>
          <button className={activeView === "draper" ? "nav-active" : ""} type="button" onClick={() => navigate("draper")} aria-label="Draper"><span>DR</span>Draper</button>
        </nav>
        <div className="sidebar-footer">
          <button className={`settings-nav ${activeView === "settings" ? "nav-active" : ""}`} type="button" onClick={() => navigate("settings")}><span>⚙</span>Settings</button>
          <div className="connection-state"><i /> Plugin workspace · Negroni v0.9 beta</div>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <button className="campaign-switcher" type="button" onClick={() => navigate("research")}>
            <span>Campaign</span><strong>New lead-generation campaign</strong><b>⌄</b>
          </button>
          <div className="topbar-state"><span><i /> Private Site · No live spend</span><b aria-label="User account">GP</b></div>
        </header>

      {activeView === "home" ? (
        <div className="dashboard" id="top">
          <section className="dashboard-heading" aria-labelledby="home-title">
            <div><p className="utility-label">Negroni agent workspace</p><h1 id="home-title">What should Negroni do next?</h1><p>Work with your agent or choose a phase here. Current campaign: <strong>{selectedProfile?.offer_or_lead_type ?? "your next lead campaign"}</strong>.</p></div>
          </section>

          <section className="research-home-layout" aria-label="Research workspace">
            <article className={`home-next-action home-next-${nextAction.tone}`} data-testid="next-action-panel" aria-live="polite">
              <span className="next-action-status">{nextAction.eyebrow}</span>
              <h2>{nextAction.title}</h2>
              <p>{nextAction.description}</p>
              {nextAction.action ? <button type="button" onClick={followHomeNextAction}>{nextAction.action.label}<span aria-hidden="true">→</span></button> : null}
            </article>
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
              <div className="section-title-row"><div><p className="utility-label">Agent activity</p><h2>Recent work</h2></div><small>Live Site</small></div>
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
            <p>Start with a required customer profile, then set the research scope. You get editable client, customer, and competitor intelligence—not a black-box answer.</p>
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
                  <option key={profile.id} value={profile.id}>{profile.company_name} · {profile.country_region}</option>
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
              <div className="intake-group-title input-wide">
                <h3>Required customer profile</h3>
                <p id="profile-privacy">Use business context or a public profile only. Do not enter contact details, credentials, or other sensitive personal information.</p>
              </div>
              <div className="input-group">
                <label htmlFor="client-customer-name">Client or customer name <strong>Required</strong></label>
                <input id="client-customer-name" value={intake.client_customer_name} onChange={(event) => updateIntake("client_customer_name", event.target.value)} placeholder="Jordan Lee" autoComplete="off" aria-describedby="profile-privacy" required />
              </div>
              <div className="input-group">
                <label htmlFor="profession-job-title">Profession or job title <strong>Required</strong></label>
                <input id="profession-job-title" value={intake.profession_job_title} onChange={(event) => updateIntake("profession_job_title", event.target.value)} placeholder="Operations director" autoComplete="organization-title" required />
              </div>
              <div className="input-group">
                <label htmlFor="company-name">Company name <strong>Required</strong></label>
                <input id="company-name" value={intake.company_name} onChange={(event) => updateIntake("company_name", event.target.value)} placeholder="Regional Repair Co." autoComplete="organization" required />
              </div>
              <div className="input-group">
                <label htmlFor="public-profile-url">Website or public profile URL <strong>Required</strong></label>
                <input id="public-profile-url" type="url" value={intake.website_or_public_profile_url} onChange={(event) => updateIntake("website_or_public_profile_url", event.target.value)} placeholder="https://example.com" autoComplete="url" required />
              </div>
              <div className="input-group">
                <label htmlFor="service-purchased">Service or offer purchased <strong>Required</strong></label>
                <input id="service-purchased" value={intake.service_or_offer_purchased} onChange={(event) => updateIntake("service_or_offer_purchased", event.target.value)} placeholder="Emergency repair membership" autoComplete="off" required />
              </div>
              <div className="input-group">
                <label htmlFor="competitor-used">Known competitors <span>Optional</span></label>
                <input id="competitor-used" value={intake.competitor_used} onChange={(event) => updateIntake("competitor_used", event.target.value)} placeholder="Names or URLs, if known" autoComplete="off" />
              </div>
              <div className="input-group">
                <label htmlFor="industry">Industry / niche <strong>Required</strong></label>
                <input id="industry" value={intake.industry} onChange={(event) => updateIntake("industry", event.target.value)} placeholder="Finance" autoComplete="organization-title" required />
              </div>
              <div className="input-group">
                <label htmlFor="country-region">Location or market served <strong>Required</strong></label>
                <input id="country-region" value={intake.country_region} onChange={(event) => updateIntake("country_region", event.target.value)} placeholder="United States" autoComplete="country-name" required />
              </div>
              <div className="intake-group-title input-wide">
                <h3>Research scope</h3>
                <p>These questions keep the customer profile grounded in the campaign and market you want to study.</p>
              </div>
              <div className="input-group input-wide">
                <label htmlFor="offer-type">Lead offer or service <strong>Required</strong></label>
                <textarea id="offer-type" rows={3} value={intake.offer_or_lead_type} onChange={(event) => updateIntake("offer_or_lead_type", event.target.value)} placeholder="Example: Business loans for small businesses—or business-loan leads for lenders" required />
                <small>Describe what the customer receives, or the lead product a buyer receives.</small>
              </div>
              <div className="input-group">
                <label htmlFor="target-age">Target age range <strong>Required</strong></label>
                <input id="target-age" value={intake.target_age_range} onChange={(event) => updateIntake("target_age_range", event.target.value)} placeholder="30–60" inputMode="numeric" required />
              </div>
            </div>

            <div className="prompt-sequence" aria-label="Five research prompts">
              {RESEARCH_PROMPTS.map((prompt, index) => <span key={prompt}><b>{index < 3 ? index + 1 : index === 3 ? "4A" : "4B"}</b>{PROMPT_LABELS[prompt]}</span>)}
            </div>

            <div className="input-grid research-run-options">
              <div className="input-group input-wide">
                <label htmlFor="approved-prompt">Final Gemini Deep Research prompt <strong>Review before running</strong></label>
                <textarea id="approved-prompt" rows={12} value={intake.approved_prompt} onChange={(event) => updateIntake("approved_prompt", event.target.value)} required />
                <small>Use the prefilled prompt as-is or edit it. The exact submitted version is persisted and bound to the run receipt.</small>
              </div>
              <label className="research-choice">
                <input type="checkbox" checked={intake.create_competitor_database} onChange={(event) => setIntake((current) => ({ ...current, create_competitor_database: event.target.checked }))} />
                <span><strong>Create competitor database</strong><small>Save structured competitor evidence for later review.</small></span>
              </label>
              <label className="research-choice">
                <input type="checkbox" checked={intake.competitor_monitoring.enabled} onChange={(event) => setIntake((current) => ({ ...current, competitor_monitoring: { ...current.competitor_monitoring, enabled: event.target.checked } }))} />
                <span><strong>Enable ongoing monitoring</strong><small>Separate opt-in; no schedule is claimed until verified.</small></span>
              </label>
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
              <p>Gemini Deep Research creates a polished Google Doc and matching brand Markdown. Competitor storage and monitoring run only when selected.</p>
            </div>
          </section>

          <section className="section-card" id="run-status" aria-labelledby="status-title">
            <div className="section-heading"><span>2</span><div><h2 id="status-title">Run status</h2><p>All five prompt receipts, limitations, and monitoring state remain visible.</p></div></div>
            <div className={`status-panel ${result?.status === "complete" ? "status-complete" : result?.status === "partial" ? "status-partial" : runError || (!checking && !capability.available) ? "status-blocked" : ""}`} aria-live="polite">
              <div><span className="status-dot" /><strong>{running ? "Researching" : result?.status === "complete" ? "Complete" : result?.status === "partial" ? "Complete with limitations" : runError || (!checking && !capability.available) ? "Blocked" : "Not started"}</strong></div>
              <p>{running ? "Running 1 → 2 → 3 → 4A → 4B and creating the two final representations." : result ? `Research completed ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.completed_at))}` : runError ?? capability.blocker ?? "Complete the questions and review the final prompt when you are ready."}</p>
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

        </div>
      ) : activeView === "draper" ? (
        <div className="content-column draper-column" id="top">
          <section className="intro draper-intro" aria-labelledby="draper-title">
            <p className="kicker">Tools · Conversational control plane</p>
            <h1 id="draper-title">Ask Draper what the evidence says.</h1>
            <p>Draper turns natural-language questions into validated, brand-scoped Negroni tools. Every answer keeps evidence, freshness, assumptions, limitations, and proposed changes visible.</p>
          </section>

          <section className="draper-workspace" aria-label="Draper workspace">
            <article className="draper-conversation">
              <div className="draper-agent-heading"><span>DR</span><div><strong>Draper</strong><small>Negroni conversational agent</small></div><b>Local plugin</b></div>
              <div className="draper-message">
                <p>Ask me to inspect a brand, find ads, compare creative, analyze normalized performance, explain the current Loop, retrieve learnings, find stale data, or prepare a reviewable experiment.</p>
                <small>I use validated intents—not arbitrary SQL—and I cannot publish, spend, launch traffic, change budgets, or mutate an ad account.</small>
              </div>
              <div className="draper-examples" aria-label="Example Draper questions">
                <span>Try asking your Negroni agent</span>
                <code>How is this brand&apos;s loop doing?</code>
                <code>What evidence supports our next creative test?</code>
                <code>What is stale, blocked, or missing?</code>
              </div>
              <div className="draper-browser-boundary">
                <strong>Continue in the installed Negroni plugin</strong>
                <p>This Site does not expose your machine-local database or private vault to the browser. Draper runs through the installed plugin&apos;s local tools.</p>
              </div>
            </article>

            <aside className="draper-evidence-panel" aria-label="Learning Core boundaries">
              <p className="utility-label">Learning Core</p>
              <h2>One truth, two ways to read it.</h2>
              <dl>
                <div><dt>Authority</dt><dd>Local relational database</dd></div>
                <div><dt>Readable layer</dt><dd>Generated Markdown vault</dd></div>
                <div><dt>Retrieval</dt><dd>FTS5 + rebuildable vectors</dd></div>
                <div><dt>Warehouse</dt><dd>Fixture adapter in this milestone</dd></div>
              </dl>
              <div className="draper-state-chain" aria-label="Learning lifecycle">
                <span>Observation</span><i>→</i><span>Candidate</span><i>→</i><span>Supported</span><i>→</i><span>Trusted</span>
              </div>
              <p className="draper-terminal-states">Contradicted and superseded records remain visible. Model output never promotes itself.</p>
            </aside>
          </section>

          <section className="draper-contract-grid" aria-label="Draper operating contracts">
            <article><span>01</span><div><strong>Data plane</strong><p>Brands, offers, audiences, campaigns, ads, assets, experiments, and normalized outcomes.</p></div></article>
            <article><span>02</span><div><strong>Knowledge plane</strong><p>Versioned learnings, evidence, counterevidence, retrieval receipts, and readable projections.</p></div></article>
            <article><span>03</span><div><strong>Control plane</strong><p>Plain-language answers and proposed diffs, with decisions separate from external execution.</p></div></article>
          </section>
        </div>
      ) : (
        <div className="content-column settings-column" id="top">
          <section className="intro" aria-labelledby="settings-title">
            <p className="kicker">Your Negroni, your agents</p>
            <h1 id="settings-title">Connect the tools behind your workspace.</h1>
            <p>Use the Negroni plugin from ChatGPT or Codex, connect the data and media providers you authorize, and keep every live action behind an explicit approval. Secrets stay behind the workspace.</p>
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
              <div><h2>Agent access</h2><p>The plugin is the primary experience. Local agent checks remain available for contributor and self-hosted fallback use.</p></div>
            </div>
            <div className="settings-grid">
              <article className="provider-card agent-card">
                <div><span className={`provider-dot provider-${codexStatus.status}`} /><strong>ChatGPT / Codex</strong><span className="provider-badge">Primary plugin</span></div>
                <p>Install Negroni once and use the same five phase skills from your agent. This status checks the optional local CLI until hosted tools are connected.</p>
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
              <div><h2>Developer fallback</h2><p>The local launcher is optional infrastructure for contributors and self-hosted testing, not the normal Negroni experience.</p></div>
            </div>
            <div className={`local-setup-card ${settingsAvailable ? "local-setup-ready" : ""}`}>
              <div className="local-setup-state">
                <span className={`provider-dot provider-${settingsAvailable ? "connected" : "blocked"}`} />
                <div><strong>{settingsAvailable ? "Local bridge ready" : "Hosted tools not connected"}</strong><small>{settingsAvailable ? "Local provider controls and key fields are available." : "Live provider actions stay blocked until the hosted broker exists; use the launcher only for local development."}</small></div>
              </div>
              <ol className="setup-steps">
                <li><span>1</span><div><strong>Use only for local development</strong><p>Run <code>negroni start</code> from a trusted checkout.</p></div></li>
                <li><span>2</span><div><strong>Return to Settings</strong><p>Local agent status and development-only key fields become available.</p></div></li>
                <li><span>3</span><div><strong>Keep credentials private</strong><p>Local keys stay under <code>~/.negroni</code> with owner-only permissions—not in the browser or project.</p></div></li>
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
    </div>
  );
}
