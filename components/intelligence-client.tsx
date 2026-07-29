"use client";

import { useEffect, useState } from "react";
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

const PROMPT_LABELS: Record<(typeof RESEARCH_PROMPTS)[number], string> = {
  market_awareness: "Market awareness",
  competitor_research: "Competitor research",
  customer_avatar_psychographics: "Customer psychology",
  master_marketing_intelligence: "Master research",
  brand_tone_of_voice: "Tone of voice",
};

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
  const [activeTab, setActiveTab] = useState<"research" | "settings">("research");
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
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);

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
      if (new URLSearchParams(window.location.search).get("view") === "settings") setActiveTab("settings");
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
        body: JSON.stringify(provider === "gemini" ? { provider, api_key: geminiKey } : { provider }),
      });
      const payload = await response.json() as { authorization_url?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The provider could not be connected.");
      if (provider !== "gemini" && payload.authorization_url) {
        const authorizationUrl = new URL(payload.authorization_url);
        if (authorizationUrl.protocol !== "https:") throw new Error("The OAuth authorization URL is invalid.");
        window.location.assign(authorizationUrl.toString());
        return;
      }
      setSettingsMessage(provider === "gemini" ? "Gemini connected." : "OAuth connection started.");
      await refreshSettings();
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "The provider could not be connected.");
    } finally {
      setGeminiKey("");
      setSettingsBusy(false);
    }
  }

  const codexStatus = providerStatus("codex_oauth");
  const geminiStatus = providerStatus("gemini");
  const googleStatus = providerStatus("google_drive");

  return (
    <main className="page-shell">
      <header className="masthead">
        <a className="brand" href="#top" aria-label="PHASE 1: RESEARCH home">
          <span className="brand-mark">L</span>
          <span>PHASE 1: RESEARCH</span>
        </a>
        <nav className="tab-list" aria-label="Research navigation">
          <button className={activeTab === "research" ? "tab-active" : ""} type="button" onClick={() => setActiveTab("research")}>Research</button>
          <button className={activeTab === "settings" ? "tab-active" : ""} type="button" onClick={() => setActiveTab("settings")}>Settings</button>
        </nav>
      </header>

      {activeTab === "research" ? (
        <div className="content-column" id="top">
          <section className="intro" aria-labelledby="page-title">
            <p className="kicker">AI deep research</p>
            <h1 id="page-title">Four inputs. Five research passes.</h1>
            <p>Define the offer and audience once. Negroni runs awareness, competitor, customer, master-research, and tone-of-voice analysis—then creates the three files.</p>
          </section>

          <section className="section-card" id="intake" aria-labelledby="intake-title">
            <div className="section-heading">
              <span>1</span>
              <div><h2 id="intake-title">Research setup</h2><p>Save and reuse each client, customer, and competitor research combination.</p></div>
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
            <div className="competitor-intelligence" aria-labelledby="competitor-intelligence-title">
              <div className="competitor-intelligence-heading">
                <div>
                  <strong id="competitor-intelligence-title">Competitor Ads Intelligence</strong>
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
              <a className={result ? "output-card" : "output-card output-disabled"} href={result?.outputs.google_sheet.url ?? undefined} target="_blank" rel="noreferrer" aria-disabled={!result} onClick={(event) => { if (!result) event.preventDefault(); }}><span className="output-icon sheet-icon">S</span><div><strong>Open Google Sheet</strong><small>{result?.outputs.google_sheet.title ?? "Competitor-ad archive · refreshed nightly"}</small></div><span aria-hidden="true">↗</span></a>
              <button className={result ? "output-card" : "output-card output-disabled"} type="button" disabled={!result} onClick={() => result && downloadMarkdown(result)}><span className="output-icon markdown-icon">M</span><div><strong>Download Markdown</strong><small>{result?.outputs.markdown.filename ?? "Portable master research report"}</small></div><span aria-hidden="true">↓</span></button>
            </div>
          </section>
        </div>
      ) : (
        <div className="content-column settings-column" id="top">
          <section className="intro" aria-labelledby="settings-title">
            <p className="kicker">Connections &amp; storage</p>
            <h1 id="settings-title">Give every run a home.</h1>
            <p>Connect Google Drive once and Negroni files each research package automatically. OAuth and API keys stay server-side—never in browser storage, project records, source, or logs.</p>
          </section>

          <section className="section-card">
            <div className="settings-grid">
              <article className="provider-card drive-card">
                <div className="provider-title">
                  <span className={`provider-dot provider-${googleStatus.status}`} />
                  <strong>Google Drive</strong>
                  <span className="provider-badge">Auto-file</span>
                </div>
                <p>Negroni creates a private <b>Negroni Research</b> folder, then stores every run as one Google Doc, one Google Sheet, and one Markdown copy.</p>
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
                <button type="button" onClick={() => void connectProvider("google_drive")} disabled={!settingsAvailable || settingsBusy}>
                  {googleStatus.status === "connected" ? "Reconnect Google Drive" : "Connect Google Drive"}
                </button>
              </article>

              <article className="provider-card">
                <div><span className={`provider-dot provider-${codexStatus.status}`} /><strong>Codex</strong></div>
                <p>Connect Codex through its OAuth flow. No Codex password or token is entered into Negroni.</p>
                <small>{codexStatus.status === "connected" ? "Connected" : codexStatus.blocker ?? "Not connected"}</small>
                <button type="button" onClick={() => void connectProvider("codex_oauth")} disabled={!settingsAvailable || settingsBusy}>{codexStatus.status === "connected" ? "Reconnect Codex" : "Connect Codex OAuth"}</button>
              </article>

              <article className="provider-card">
                <div><span className={`provider-dot provider-${geminiStatus.status}`} /><strong>Gemini</strong></div>
                <p>Use Gemini for approved research steps. The key is submitted once to the secure credential broker and immediately cleared here.</p>
                <small>{geminiStatus.status === "connected" ? "Connected" : geminiStatus.blocker ?? "Not connected"}</small>
                <label htmlFor="gemini-key">Gemini API key</label>
                <input id="gemini-key" type="password" value={geminiKey} onChange={(event) => setGeminiKey(event.target.value)} placeholder="Enter key" autoComplete="off" disabled={!settingsAvailable} />
                <button type="button" onClick={() => void connectProvider("gemini")} disabled={!settingsAvailable || settingsBusy || geminiKey.trim().length < 20}>Save Gemini key</button>
              </article>

            </div>
            {settingsBlocker ? <div className="settings-blocker"><strong>Settings blocked</strong><p>{settingsBlocker}</p></div> : null}
            {settingsMessage ? <p className="inline-message" role="status">{settingsMessage}</p> : null}
          </section>
        </div>
      )}

      <footer><span>PHASE 1: RESEARCH</span><p>Four inputs. Five prompt receipts. Three verified deliverables.</p></footer>
    </main>
  );
}
