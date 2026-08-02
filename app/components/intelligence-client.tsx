"use client";

import { Fragment, useEffect, useState } from "react";
import { createEmptyIntake } from "@/lib/intelligence/defaults";
import {
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
import { CAMPAIGN_PHASES } from "@/lib/campaign-workflow";
import { CreatePhasePage } from "@/components/create-phase-page";
import { ResearchReview } from "@/components/research-review";
import { WorkflowPhasePage } from "@/components/workflow-phase-page";

type AppView = "home" | "research" | "create" | "launch" | "iterate" | "loop" | "library" | "brands" | "integrations" | "settings";
type ResearchSection = "run" | "client" | "customer" | "competitors" | "competitor-ads" | "review";
type Appearance = "light" | "dark" | "system";
type GeminiConnection = { status: "checking" | "not_connected" | "connected" | "connection_error"; last_verified_at: string | null; fingerprint: string | null; last_four: string | null; error?: string };

const RESEARCH_TOOLS: ReadonlyArray<{
  id: ResearchSection;
  eyebrow: string;
  name: string;
  description: string;
  marker: string;
}> = [
  {
    id: "run",
    eyebrow: "01",
    name: "Run Research",
    description: "Create the research package.",
    marker: "GO",
  },
  {
    id: "client",
    eyebrow: "02",
    name: "Client",
    description: "Offer and campaign constraints.",
    marker: "C1",
  },
  {
    id: "customer",
    eyebrow: "03",
    name: "Customer",
    description: "Audience needs and language.",
    marker: "C2",
  },
  {
    id: "competitors",
    eyebrow: "04",
    name: "Competitors",
    description: "Market and positioning evidence.",
    marker: "C3",
  },
  {
    id: "competitor-ads",
    eyebrow: "05",
    name: "Competitor Ads",
    description: "Public-ad evidence and coverage.",
    marker: "AD",
  },
  {
    id: "review",
    eyebrow: "06",
    name: "Review & Approve",
    description: "Approve the brief for Create.",
    marker: "OK",
  },
];

const RESEARCH_TABS: ReadonlyArray<{
  id: Extract<ResearchSection, "run" | "competitor-ads">;
  name: string;
}> = [
  { id: "run", name: "Create Brand" },
  { id: "competitor-ads", name: "Ad Spy" },
];

function brandLabel(profile: ResearchProfile): string {
  return profile.company_name.trim() || "Untitled brand";
}

function brandInitials(profile: ResearchProfile): string {
  const initials = brandLabel(profile).split(/\s+/).map((part) => part[0]).join("").slice(0, 2);
  return initials.toUpperCase() || "BR";
}

export function IntelligenceClient() {
  const [activeView, setActiveView] = useState<AppView>("home");
  const [intake, setIntake] = useState<IntelligenceIntake>(() => createEmptyIntake(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"));
  const [capability, setCapability] = useState<RunCapability>({ available: false, status: "blocked", blocker: RUNNER_BLOCKER });
  const [checking, setChecking] = useState(true);
  const [running, setRunning] = useState(false);
  const [proposedRunId, setProposedRunId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runRecoveryUrl, setRunRecoveryUrl] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfilesResponse>({ available: false, records: [], blocker: null });
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [draftBrandId, setDraftBrandId] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [settingsAvailable, setSettingsAvailable] = useState(false);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [settingsBlocker, setSettingsBlocker] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiConnection, setGeminiConnection] = useState<GeminiConnection>({ status: "checking", last_verified_at: null, fingerprint: null, last_four: null });
  const [kieKey, setKieKey] = useState("");
  const [apifyKey, setApifyKey] = useState("");
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>("dark");
  const [operatingMode, setOperatingMode] = useState<OperatingMode>("safety");
  const [activeResearchSection, setActiveResearchSection] = useState<ResearchSection>("run");
  const [brandDetailId, setBrandDetailId] = useState("");
  const [libraryAssetType, setLibraryAssetType] = useState("all");
  const [libraryPlatform, setLibraryPlatform] = useState("all");
  const [libraryStatus, setLibraryStatus] = useState("all");
  const [libraryDate, setLibraryDate] = useState("all");
  const [libraryDateCutoff, setLibraryDateCutoff] = useState<number | null>(null);

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

  async function refreshGemini() {
    try {
      const response = await fetch("/api/connections/gemini", { cache: "no-store" });
      const payload = await response.json() as GeminiConnection;
      if (!response.ok) throw new Error(payload.error ?? "Gemini connection could not be checked.");
      setGeminiConnection(payload);
    } catch (error) {
      setGeminiConnection({ status: "connection_error", last_verified_at: null, fingerprint: null, last_four: null, error: error instanceof Error ? error.message : "Gemini connection could not be checked." });
    }
  }

  useEffect(() => {
    let active = true;
    async function loadInitialState() {
      const searchParams = new URLSearchParams(window.location.search);
      const requestedView = searchParams.get("view");
      if (requestedView === "research" || requestedView === "create" || requestedView === "launch" || requestedView === "iterate" || requestedView === "loop" || requestedView === "library" || requestedView === "brands" || requestedView === "integrations" || requestedView === "settings") setActiveView(requestedView);
      const requestedTool = searchParams.get("tool");
      if (RESEARCH_TOOLS.some((tool) => tool.id === requestedTool)) {
        setActiveResearchSection(requestedTool as ResearchSection);
      }
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
    const timer = window.setTimeout(() => void refreshGemini(), 0);
    return () => window.clearTimeout(timer);
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
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme = appearance === "system"
        ? colorScheme.matches ? "dark" : "light"
        : appearance;
    };
    applyTheme();
    window.localStorage.setItem("negroni.appearance", appearance);
    if (appearance === "system") colorScheme.addEventListener("change", applyTheme);
    return () => colorScheme.removeEventListener("change", applyTheme);
  }, [appearance]);

  useEffect(() => {
    window.localStorage.setItem("negroni.operating-mode", operatingMode);
  }, [operatingMode]);

  useEffect(() => {
    let frame = 0;
    const keepActiveNavigationVisible = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(".side-nav > .nav-active")?.scrollIntoView({
          behavior: "auto",
          block: "nearest",
          inline: "nearest",
        });
      });
    };
    keepActiveNavigationVisible();
    window.addEventListener("resize", keepActiveNavigationVisible);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", keepActiveNavigationVisible);
    };
  }, [activeView]);

  function updateIntake(field:
    | "profession"
    | "job_title"
    | "company_name"
    | "website_or_public_profile_url"
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
    setDraftBrandId(profile.brand_id);
    setIntake((current) => ({
      ...current,
      profession: profile.profession,
      job_title: profile.job_title,
      company_name: profile.company_name,
      website_or_public_profile_url: profile.website_or_public_profile_url,
      competitor_used: profile.competitor_used,
      offer_or_lead_type: profile.offer_or_lead_type,
      industry: profile.industry,
      country_region: profile.country_region,
      target_age_range: profile.target_age_range,
    }));
    setResult(null);
    setRunError(null);
    setRunRecoveryUrl(null);
    setErrors([]);
  }

  function newProfile() {
    setSelectedProfileId("");
    setDraftBrandId("");
    setIntake(createEmptyIntake(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"));
    setProfileMessage(null);
    setResult(null);
    setRunError(null);
    setRunRecoveryUrl(null);
    setErrors([]);
  }

  function newOffer(profileId = selectedProfileId) {
    const profile = profiles.records.find((record) => record.id === profileId);
    if (!profile) return;
    const next = createEmptyIntake(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setSelectedProfileId("");
    setDraftBrandId(profile.brand_id);
    setIntake({
      ...next,
      company_name: profile.company_name,
      website_or_public_profile_url: profile.website_or_public_profile_url,
      industry: profile.industry,
      country_region: profile.country_region,
    });
    setProfileMessage("Add another offer to this brand.");
    setResult(null);
    setRunError(null);
    setRunRecoveryUrl(null);
    setErrors([]);
  }

  async function saveProfile(): Promise<string | null> {
    const validationErrors = validateIntake(intake);
    setErrors(validationErrors);
    if (validationErrors.length) return null;
    if (selectedProfile) {
      const sharedChanged = selectedProfile.company_name !== intake.company_name.trim()
        || selectedProfile.website_or_public_profile_url !== intake.website_or_public_profile_url.trim()
        || selectedProfile.industry !== intake.industry.trim()
        || selectedProfile.country_region !== intake.country_region.trim();
      const offerChanged = selectedProfile.profession !== intake.profession.trim()
        || selectedProfile.job_title !== intake.job_title.trim()
        || selectedProfile.competitor_used !== intake.competitor_used.trim()
        || selectedProfile.offer_or_lead_type !== intake.offer_or_lead_type.trim()
        || selectedProfile.target_age_range !== intake.target_age_range.trim();
      if ((sharedChanged || offerChanged) && !window.confirm(
        sharedChanged
          ? "Update this shared brand information for every offer? Existing research packages stay preserved and will be marked as needing refresh."
          : "Update this offer? Its existing research package stays preserved and will be marked as needing refresh.",
      )) return null;
    }
    if (!profiles.available) {
      setProfileMessage(profiles.blocker ?? "Saved research sets are unavailable.");
      return null;
    }
    const response = await fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: selectedProfileId || undefined, brand_id: draftBrandId || undefined, intake }),
    });
    const payload = await response.json() as { id?: string; brand_id?: string; error?: string };
    if (!response.ok || !payload.id) {
      setProfileMessage(payload.error ?? "The research set could not be saved.");
      return null;
    }
    setSelectedProfileId(payload.id);
    setDraftBrandId(payload.brand_id ?? draftBrandId);
    setProfileMessage(draftBrandId ? "Offer saved to the brand." : "Brand created.");
    await refreshProfiles();
    return payload.id;
  }

  async function runResearch() {
    const validationErrors = validateIntake(intake);
    setErrors(validationErrors);
    setResult(null);
    setRunError(null);
    setRunRecoveryUrl(null);
    if (validationErrors.length || !capability.available || !geminiApiReady || !googleDriveReady) {
      if (!capability.available) setRunError(capability.blocker ?? RUNNER_BLOCKER);
      else if (!geminiApiReady) setRunError("Connect Gemini before starting Standard Deep Research.");
      else if (!googleDriveReady) setRunError("Connect Google Drive before starting research.");
      document.getElementById("run-status")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (!proposedRunId) {
      const proposal = await fetch("/api/research/runs", { method: "POST" });
      const payload = await proposal.json() as { run_id?: string; error?: string };
      if (!proposal.ok || !payload.run_id) {
        setRunError(payload.error ?? "Paid-run review could not be created.");
        return;
      }
      setProposedRunId(payload.run_id);
      return;
    }
    const profileId = profiles.available ? await saveProfile() : selectedProfileId;
    if (!profileId) {
      setRunError("Save the offer before starting research.");
      return;
    }
    setRunning(true);
    try {
      const approval = await fetch(`/api/research/runs/${proposedRunId}/approve`, {
        method: "POST",
      });
      if (!approval.ok) throw new Error((await approval.json() as { error?: string }).error ?? "Run approval failed.");
      const response = await fetch(`/api/research/runs/${proposedRunId}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile_id: profileId, intake }),
      });
      const payload = (await response.json()) as RunResult | RunError;
      if (!response.ok || "error" in payload) {
        if ("error" in payload && payload.recovery_url) setRunRecoveryUrl(payload.recovery_url);
        throw new Error("error" in payload ? payload.error : "The research run failed.");
      }
      const researchName = buildResearchName(intake.offer_or_lead_type, intake.country_region);
      setResult(parseRunResult(payload, researchName));
      setProposedRunId(null);
      await refreshProfiles();
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
    const replacing = providerStatus(provider).status === "connected";
    if (replacing && (provider === "kie_ai" || provider === "apify")
      && !window.confirm(`Replace the connected ${provider === "kie_ai" ? "Kie.ai" : "Apify"} credential?`)) return;
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
              ? { provider, api_key: kieKey, confirmation: replacing ? "replace" : "save" }
              : provider === "apify"
                ? { provider, api_key: apifyKey, confirmation: replacing ? "replace" : "save" }
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
      setApifyKey("");
      setSettingsBusy(false);
    }
  }

  async function disconnectApiProvider(provider: "kie_ai" | "apify") {
    const label = provider === "kie_ai" ? "Kie.ai" : "Apify";
    if (!window.confirm(`Disconnect ${label}? This removes Negroni access to the stored credential.`)) return;
    setSettingsBusy(true);
    setSettingsMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, confirmation: `disconnect ${provider}` }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? `${label} could not be disconnected.`);
      setSettingsMessage(payload.message ?? `${label} disconnected.`);
      await refreshSettings();
    } catch (error) { setSettingsMessage(error instanceof Error ? error.message : `${label} could not be disconnected.`); }
    finally { setSettingsBusy(false); }
  }

  async function saveGemini() {
    const replacing = geminiConnection.status === "connected";
    if (replacing && !window.confirm("Replace the connected Gemini key? The previous credential will no longer be available to Negroni.")) return;
    setSettingsBusy(true);
    setSettingsMessage(null);
    try {
      const response = await fetch("/api/connections/gemini", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: geminiKey, confirmation: replacing ? "replace" : "save" }),
      });
      setGeminiKey("");
      const payload = await response.json() as GeminiConnection;
      if (!response.ok) throw new Error(payload.error ?? "Gemini could not be connected.");
      setGeminiConnection(payload);
      setSettingsMessage("Gemini connected. Saving this key did not start research.");
    } catch (error) {
      setGeminiKey("");
      setSettingsMessage(error instanceof Error ? error.message : "Gemini could not be connected.");
      await refreshGemini();
    } finally { setSettingsBusy(false); }
  }

  async function disconnectGemini() {
    if (!window.confirm('Disconnect Gemini? This removes Negroni access to the stored credential.')) return;
    setSettingsBusy(true);
    try {
      const response = await fetch("/api/connections/gemini", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation: "disconnect Gemini" }) });
      const payload = await response.json() as GeminiConnection;
      if (!response.ok) throw new Error(payload.error ?? "Gemini could not be disconnected.");
      setGeminiConnection(payload);
      setSettingsMessage("Gemini disconnected.");
    } catch (error) { setSettingsMessage(error instanceof Error ? error.message : "Gemini could not be disconnected."); }
    finally { setSettingsBusy(false); }
  }

  const codexStatus = providerStatus("codex_cli");
  const claudeStatus = providerStatus("claude_code");
  const geminiApiReady = geminiConnection.status === "connected";
  const kieStatus = providerStatus("kie_ai");
  const apifyStatus = providerStatus("apify");
  const googleStatus = providerStatus("google_drive");
  const googleDriveReady = googleStatus.status === "connected" && googleStatus.auto_store === true;
  const researchDependencyBlocker = !geminiApiReady
    ? "Connect Gemini before starting Standard Deep Research."
    : !googleDriveReady
      ? "Connect Google Drive before starting research."
      : null;
  const selectedProfile = profiles.records.find((profile) => profile.id === selectedProfileId) ?? null;
  const displayedRun = result ? {
    run_id: result.run_id,
    status: result.status,
    completed_at: result.completed_at,
    folder_url: result.brand_library.folder_url,
    is_current: true,
  } : selectedProfile?.latest_run ?? null;
  const brandGroups = Array.from(profiles.records.reduce((groups, profile) => {
    const offers = groups.get(profile.brand_id) ?? [];
    offers.push(profile);
    groups.set(profile.brand_id, offers);
    return groups;
  }, new Map<string, ResearchProfile[]>()).entries()).map(([brandId, offers]) => ({
    brandId,
    offers,
    brand: offers[0],
  }));
  const activeBrandId = selectedProfile?.brand_id || draftBrandId || brandGroups[0]?.brandId || "";
  const activeBrandGroup = brandGroups.find(({ brandId }) => brandId === activeBrandId) ?? null;
  const activeBrand = activeBrandGroup?.brand ?? null;
  const libraryProfile = activeBrandGroup?.offers.find(({ id }) => id === selectedProfileId)
    ?? activeBrandGroup?.offers[0]
    ?? null;
  const libraryRun = libraryProfile?.latest_run ?? null;
  const libraryAssets = libraryRun ? [
    {
      assetType: "research",
      platform: "google-drive",
      name: "Master research",
      marker: "DOC",
      description: "Evidence-backed research document",
      url: libraryRun.google_doc_url,
    },
    {
      assetType: "research",
      platform: "google-drive",
      name: "Research Markdown",
      marker: "MD",
      description: libraryRun.markdown_filename,
      url: libraryRun.folder_url,
    },
    ...(libraryRun.google_sheet_url ? [{
      assetType: "competitors",
      platform: "google-drive",
      name: "Customer competitor database",
      marker: "SHEET",
      description: "Evidence-backed competitor source table",
      url: libraryRun.google_sheet_url,
    }] : []),
  ].filter((asset) => {
    if (libraryAssetType !== "all" && asset.assetType !== libraryAssetType) return false;
    if (libraryPlatform !== "all" && asset.platform !== libraryPlatform) return false;
    const status = !libraryRun.is_current ? "outdated" : libraryRun.status;
    if (libraryStatus !== "all" && status !== libraryStatus) return false;
    if (libraryDateCutoff !== null) {
      const completedAt = Date.parse(libraryRun.completed_at);
      if (!Number.isFinite(completedAt) || completedAt < libraryDateCutoff) return false;
    }
    return true;
  }) : [];
  const brandDetail = brandGroups.find(({ brandId }) => brandId === brandDetailId) ?? null;
  const brandDetailRun = brandDetail?.offers.find(({ id, latest_run }) => id === selectedProfileId && latest_run)?.latest_run
    ?? brandDetail?.offers.find(({ latest_run }) => latest_run)?.latest_run
    ?? null;
  const nextAction = deriveHomeNextAction({
    checking,
    capability,
    hasProfile: selectedProfile !== null,
    resultStatus: displayedRun?.status ?? null,
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
      if (section === "run") {
        window.scrollTo({ top: 0, behavior: "auto" });
        return;
      }
      const targetId: Record<ResearchSection, string> = {
        run: "top",
        client: "intake",
        customer: "offer-type",
        competitors: "competitor-used",
        "competitor-ads": "competitor-ads",
        review: "research-review",
      };
      document.getElementById(targetId[section])?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, activeView === "research" ? 0 : 50);
  }

  function followHomeNextAction() {
    switch (nextAction.action?.destination) {
      case "integrations":
        navigate("integrations");
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
          <button className={activeView === "home" ? "nav-active" : ""} type="button" onClick={() => navigate("home")} aria-current={activeView === "home" ? "page" : undefined}><span>⌂</span>Home</button>
          <span className="nav-label">Campaign phases</span>
          {CAMPAIGN_PHASES.map((phase) => (
            <Fragment key={phase.number}>
              <button
                className={`${phase.id === activeView ? "nav-active" : ""}${phase.id === "launch" || phase.id === "iterate" || phase.id === "loop" ? " nav-requires-handoff" : ""}`}
                type="button"
                onClick={() => navigate(phase.id)}
                aria-current={phase.id === activeView ? "page" : undefined}
              >
                <span>{phase.number}</span>{phase.name}
              </button>
              {phase.number === "01" && activeView === "research" ? (
                <div className="research-subnav" aria-label="Research tools">
                  {RESEARCH_TABS.map((tool) => (
                    <button
                      className={activeResearchSection === tool.id ? "research-subnav-active" : ""}
                      key={tool.id}
                      type="button"
                      onClick={() => openResearchSection(tool.id)}
                      aria-current={activeResearchSection === tool.id ? "page" : undefined}
                      aria-label={tool.name}
                    >
                      <span aria-hidden="true">
                        {tool.id === "run" ? (
                          <svg viewBox="0 0 24 24"><path d="M12 3l1.35 4.15L17.5 8.5l-4.15 1.35L12 14l-1.35-4.15L6.5 8.5l4.15-1.35L12 3Zm6 11 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14ZM6 14l1.05 2.95L10 18l-2.95 1.05L6 22l-1.05-2.95L2 18l2.95-1.05L6 14Z" /></svg>
                        ) : (
                          <svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
                        )}
                      </span>{tool.name}
                    </button>
                  ))}
                </div>
              ) : null}
              {phase.number === "02" && activeView === "create" ? (
                <div className="research-subnav" aria-label="Create tools">
                  <button className="research-subnav-active" type="button" aria-current="page" onClick={() => navigate("create")}>
                    <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5h16M4 12h16M4 18.5h10" /><circle cx="18" cy="18.5" r="2" /></svg></span>Quiz Funnels
                  </button>
                </div>
              ) : null}
            </Fragment>
          ))}
          <span className="nav-label">Tools</span>
          <button className={activeView === "library" ? "nav-active" : ""} type="button" onClick={() => navigate("library")} aria-label="Library" aria-current={activeView === "library" ? "page" : undefined}><span>▦</span>Library</button>
          <button className={activeView === "brands" ? "nav-active" : ""} type="button" onClick={() => navigate("brands")} aria-label="Brands" aria-current={activeView === "brands" ? "page" : undefined}><span>◇</span>Brands</button>
          <button className={activeView === "integrations" ? "nav-active" : ""} type="button" onClick={() => navigate("integrations")} aria-label="Integrations" aria-current={activeView === "integrations" ? "page" : undefined}><span>↔</span>Integrations</button>
        </nav>
        <div className="sidebar-footer">
          <button className={`settings-nav ${activeView === "settings" ? "nav-active" : ""}`} type="button" onClick={() => navigate("settings")} aria-label="Settings" aria-current={activeView === "settings" ? "page" : undefined}><span>⚙</span>Settings</button>
          <div className="connection-state"><i /> Private workspace</div>
        </div>
      </aside>

      <main className="app-main">

      {activeView === "home" ? (
        <div className="dashboard" id="top">
          <section className="dashboard-heading" aria-labelledby="home-title">
            <div><p className="utility-label">Workspace</p><h1 id="home-title">Your campaign workspace</h1><p>Start with the next action.</p></div>
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
                <p>Build the campaign brief.</p>
              </div>
              <div className="research-tool-grid">
                {RESEARCH_TOOLS.map((tool, index) => (
                  <button
                    className={`research-tool-card ${index === 0 ? "research-tool-primary" : ""}`}
                    key={tool.id}
                    type="button"
                    onClick={() => openResearchSection(tool.id)}
                  >
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
        </div>
      ) : activeView === "research" ? (
        <div className="content-column" id="top">
          {activeResearchSection !== "competitor-ads" && activeResearchSection !== "review" ? (
          <>
          <section className="intro" aria-labelledby="page-title">
            <p className="kicker">Research</p>
            <h1 id="page-title">Brand setup</h1>
            <p>Create the brand and offer for this campaign.</p>
          </section>

          <section className="section-card" id="intake" aria-labelledby="intake-title">
            <div className="section-heading">
              <span>1</span>
              <div><h2 id="intake-title">Fill in the information</h2></div>
            </div>

            <div className="record-bar">
              <label htmlFor="saved-profile">Brand</label>
              <select id="saved-profile" value={selectedProfileId} onChange={(event) => chooseProfile(event.target.value)} disabled={!profiles.available}>
                <option value="">{profiles.available ? "Create new brand" : "Saved brands unavailable"}</option>
                {profiles.records.map((profile: ResearchProfile) => (
                  <option key={profile.id} value={profile.id}>{brandLabel(profile)} · {profile.offer_or_lead_type || "Untitled offer"}</option>
                ))}
              </select>
              {selectedProfileId ? <button type="button" onClick={newProfile}>New brand</button> : null}
              {selectedProfileId ? <button type="button" onClick={() => newOffer()}>New offer</button> : null}
            </div>
            {profiles.blocker ? <p className="inline-blocker">{profiles.blocker}</p> : null}
            {profileMessage ? <p className="inline-message" role="status">{profileMessage}</p> : null}

            <div className="intake-grid">
              <div className="intake-group-title input-wide"><h3>Brand</h3><p id="profile-privacy">Use business information or a public profile.</p></div>
              <div className="input-group">
                <label htmlFor="company-name">Company name <strong>Required</strong></label>
                <input id="company-name" value={intake.company_name} onChange={(event) => updateIntake("company_name", event.target.value)} placeholder="Regional Repair Co." autoComplete="organization" aria-describedby="profile-privacy" required />
              </div>
              <div className="input-group">
                <label htmlFor="public-profile-url">Website or public profile URL <strong>Required</strong></label>
                <input id="public-profile-url" type="url" value={intake.website_or_public_profile_url} onChange={(event) => updateIntake("website_or_public_profile_url", event.target.value)} placeholder="https://example.com" autoComplete="url" required />
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
                <h3>Offer</h3>
              </div>
              <div className="input-group">
                <label htmlFor="profession">Profession <strong>Required</strong></label>
                <input id="profession" value={intake.profession} onChange={(event) => updateIntake("profession", event.target.value)} placeholder="HVAC contractor" autoComplete="organization-title" required />
              </div>
              <div className="input-group">
                <label htmlFor="job-title">Job title <strong>Required</strong></label>
                <input id="job-title" value={intake.job_title} onChange={(event) => updateIntake("job_title", event.target.value)} placeholder="Operations director" autoComplete="organization-title" required />
              </div>
              <div className="input-group input-wide">
                <label htmlFor="competitor-used">Known competitors <span>Optional</span></label>
                <input id="competitor-used" value={intake.competitor_used} onChange={(event) => updateIntake("competitor_used", event.target.value)} placeholder="Names or URLs, if known" autoComplete="off" />
              </div>
              <div className="input-group input-wide">
                <label htmlFor="offer-type">Lead offer or service <strong>Required</strong></label>
                <textarea id="offer-type" rows={3} value={intake.offer_or_lead_type} onChange={(event) => updateIntake("offer_or_lead_type", event.target.value)} placeholder="Example: Business loans for small businesses—or business-loan leads for lenders" required />
                <small>Describe the service or lead product.</small>
              </div>
              <div className="input-group">
                <label htmlFor="target-age">Target age range <span>Optional</span></label>
                <input id="target-age" value={intake.target_age_range} onChange={(event) => updateIntake("target_age_range", event.target.value)} placeholder="30–60" inputMode="numeric" />
              </div>
            </div>

            <div className="input-grid research-run-options">
              <label className="research-choice">
                <input type="checkbox" checked={intake.create_competitor_database} onChange={(event) => setIntake((current) => ({ ...current, create_competitor_database: event.target.checked }))} />
                <span><strong>Create customer competitor database</strong></span>
              </label>
            </div>

            {errors.length ? <div className="validation-box" role="alert"><strong>Check the research setup</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
            <div className="run-row">
              {proposedRunId ? <div className="run-approval"><strong>Paid-action approval</strong><small>Run ID: {proposedRunId}</small><small>Model: deep-research-preview-04-2026</small><small>Scope: five Research prompts</small><small>Estimated cost: provider pricing applies; exact cost unavailable locally</small></div> : null}
              <button className="run-button" type="button" onClick={() => void saveProfile()} disabled={!profiles.available}>{selectedProfileId ? "Save changes" : draftBrandId ? "Create offer" : "Create brand"}</button>
              {selectedProfileId ? <button type="button" onClick={() => void runResearch()} disabled={checking || running || !capability.available || Boolean(researchDependencyBlocker)}>{running ? "Running research…" : checking ? "Checking access…" : proposedRunId ? "Approve and start" : "Run research"}</button> : null}
            </div>
          </section>

          <section className="section-card" id="run-status" aria-labelledby="status-title">
            <div className="section-heading"><span>2</span><div><h2 id="status-title">Run status</h2></div></div>
            <div className={`status-panel ${runError || (!checking && (!capability.available || researchDependencyBlocker) && !displayedRun) ? "status-blocked" : displayedRun && !displayedRun.is_current ? "status-partial" : displayedRun?.status === "complete" ? "status-complete" : displayedRun?.status === "partial" ? "status-partial" : ""}`} aria-live="polite">
              <div><span className="status-dot" /><strong>{running ? "Researching" : runError ? "Blocked" : displayedRun && !displayedRun.is_current ? "Needs attention" : displayedRun?.status === "complete" ? "Complete" : displayedRun?.status === "partial" ? "Complete with limitations" : !checking && (!capability.available || researchDependencyBlocker) ? "Blocked" : "Not started"}</strong></div>
              <p>{running ? "Research is running." : runError ?? (displayedRun ? !displayedRun.is_current ? "This package used earlier brand or offer information. Run Research again to make it current." : `Research completed ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(displayedRun.completed_at))}` : capability.blocker ?? researchDependencyBlocker ?? "Create the brand when you are ready.")}</p>
              {displayedRun ? <a className="drive-link" href={displayedRun.folder_url} target="_blank" rel="noreferrer">Open brand folder in Google Drive <span aria-hidden="true">↗</span></a> : null}
              {!result && runRecoveryUrl ? <a className="drive-link" href={runRecoveryUrl} target="_blank" rel="noreferrer">Open completed run in Google Drive <span aria-hidden="true">↗</span></a> : null}
              {!result && !running && (runError || (!checking && (!capability.available || researchDependencyBlocker))) ? <button className="status-action" type="button" onClick={() => navigate("integrations")}>Open Integrations</button> : null}
            </div>
          </section>
          </>
          ) : null}

          {activeResearchSection === "competitor-ads" ? (
            <section className="section-card" id="competitor-ads" aria-labelledby="competitor-ads-title">
              <div className="section-heading"><span>AD</span><div><h2 id="competitor-ads-title">Ad Spy</h2><p>Public-ad evidence for the selected offer.</p></div></div>
              {result ? (
                <div className="ad-spy-summary">
                  <dl>
                    <div><dt>Competitors watched</dt><dd>{result.competitor_ads.watched_competitors}</dd></div>
                    <div><dt>Active ads</dt><dd>{result.competitor_ads.active_ads}</dd></div>
                    <div><dt>New ads</dt><dd>{result.competitor_ads.new_ads_today}</dd></div>
                    <div><dt>Creative families</dt><dd>{result.competitor_ads.creative_families}</dd></div>
                  </dl>
                  <p>{result.competitor_ads.claims_boundary}</p>
                </div>
              ) : selectedProfile?.latest_run?.google_sheet_url ? (
                <div className="tool-empty"><h2>Saved competitor evidence is available.</h2><p>Open the evidence-backed sheet from this offer’s latest Research package.</p><a className="drive-link" href={selectedProfile.latest_run.google_sheet_url} target="_blank" rel="noreferrer">Open competitor evidence <span aria-hidden="true">↗</span></a></div>
              ) : (
                <div className="tool-empty"><h2>No competitor-ad evidence yet.</h2><p>Run Research for this offer to create the first verified competitor-ad snapshot.</p></div>
              )}
            </section>
          ) : null}

          {activeResearchSection === "review" ? <ResearchReview profile={selectedProfile} runResult={result} /> : null}

        </div>
      ) : activeView === "launch" || activeView === "iterate" || activeView === "loop" ? (
        <WorkflowPhasePage phaseId={activeView} onNavigate={navigate} />
      ) : activeView === "create" ? (
        <CreatePhasePage key={selectedProfile?.id ?? "no-offer"} profile={selectedProfile} onOpenResearchReview={() => openResearchSection("review")} />
      ) : activeView === "library" ? (
        <div className="content-column tool-page" id="top">
          <section className="intro" aria-labelledby="library-title">
            <p className="kicker">Library</p>
            <h1 id="library-title">Campaign files</h1>
            <p>Everything created for the selected brand and offer.</p>
          </section>
          <section className="tool-summary-bar" aria-label="Library filters">
            <div><span>Brand</span><strong>{activeBrand ? brandLabel(activeBrand) : "No brand selected"}</strong></div>
            <select aria-label="Filter library by brand" value={activeBrandId} onChange={(event) => {
              const firstOffer = brandGroups.find(({ brandId }) => brandId === event.target.value)?.offers[0];
              if (firstOffer) chooseProfile(firstOffer.id);
            }} disabled={!brandGroups.length}>
              {!profiles.records.length ? <option value="">Create a brand first</option> : null}
              {brandGroups.map(({ brandId, brand }) => <option key={brandId} value={brandId}>{brandLabel(brand)}</option>)}
            </select>
            <select aria-label="Filter library by offer" value={libraryProfile?.id ?? ""} onChange={(event) => chooseProfile(event.target.value)} disabled={!activeBrandGroup?.offers.length}>
              {activeBrandGroup?.offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.offer_or_lead_type}</option>)}
            </select>
            <select aria-label="Filter library by asset type" value={libraryAssetType} onChange={(event) => setLibraryAssetType(event.target.value)}>
              <option value="all">All asset types</option>
              <option value="research">Research</option>
              <option value="competitors">Competitor data</option>
              <option value="creative">Creative</option>
              <option value="campaigns">Campaigns</option>
            </select>
            <select aria-label="Filter library by platform" value={libraryPlatform} onChange={(event) => setLibraryPlatform(event.target.value)}>
              <option value="all">All platforms</option>
              <option value="google-drive">Google Drive</option>
            </select>
            <select aria-label="Filter library by status" value={libraryStatus} onChange={(event) => setLibraryStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="complete">Complete</option>
              <option value="partial">Complete with limitations</option>
              <option value="outdated">Needs refresh</option>
            </select>
            <select aria-label="Filter library by date" value={libraryDate} onChange={(event) => {
              const value = event.target.value;
              setLibraryDate(value);
              setLibraryDateCutoff(value === "all" ? null : Date.now() - Number(value) * 86_400_000);
            }}>
              <option value="all">Any date</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </section>
          {libraryAssets.length ? (
            <section className="asset-type-grid" aria-label="Brand assets">
              {libraryAssets.map((asset) => (
                <article key={`${libraryRun?.run_id}-${asset.name}`}>
                  <span>{asset.marker}</span>
                  <div>
                    <h2>{asset.name}</h2>
                    <p>{asset.description}</p>
                    <small>Offer: {libraryProfile?.offer_or_lead_type} · Research package: {libraryRun?.run_id}</small>
                  </div>
                  <a href={asset.url} target="_blank" rel="noreferrer">Open ↗</a>
                </article>
              ))}
            </section>
          ) : activeBrand ? (
            <div className="tool-empty"><h2>No matching assets.</h2><p>{libraryRun ? "Change the filters to see this offer’s Drive-backed research files." : "Run Research for this offer to create its first Drive-backed assets."}</p></div>
          ) : null}
          {libraryRun ? <a className="drive-link" href={libraryRun.folder_url} target="_blank" rel="noreferrer">Open brand folder in Google Drive <span aria-hidden="true">↗</span></a> : null}
          {!activeBrand ? <div className="tool-empty"><h2>Your library is empty.</h2><p>Create a brand to give every future offer, ad, and asset a permanent home.</p><button type="button" onClick={() => navigate("research")}>Create Brand</button></div> : null}
        </div>
      ) : activeView === "brands" ? (
        <div className="content-column tool-page" id="top">
          <section className="intro tool-page-heading" aria-labelledby="brands-title">
            <div><p className="kicker">Brands</p><h1 id="brands-title">Brand files</h1><p>One source for each brand and its offers.</p></div>
            <button type="button" onClick={() => navigate("research")}>+ Create Brand</button>
          </section>
          {brandDetail ? (
            <section className="brand-detail" aria-label={`${brandLabel(brandDetail.brand)} brand file`}>
              <div className="brand-detail-heading">
                <button type="button" onClick={() => setBrandDetailId("")}>← All brands</button>
                <div><small>Permanent brand file</small><h2>{brandLabel(brandDetail.brand)}</h2><p>{brandDetail.brand.industry || "Industry not specified"} · {brandDetail.brand.country_region || "Market not specified"}</p></div>
                <button type="button" onClick={() => { newOffer(brandDetail.offers[0].id); navigate("research"); }}>+ Create offer</button>
              </div>
              <dl className="brand-foundation">
                <div><dt>Website</dt><dd>{brandDetail.brand.website_or_public_profile_url.trim() ? <a href={brandDetail.brand.website_or_public_profile_url} target="_blank" rel="noreferrer">{brandDetail.brand.website_or_public_profile_url}</a> : "Not specified"}</dd></div>
                <div><dt>Industry</dt><dd>{brandDetail.brand.industry || "Not specified"}</dd></div>
                <div><dt>Market</dt><dd>{brandDetail.brand.country_region || "Not specified"}</dd></div>
                <div><dt>Last updated</dt><dd>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(brandDetail.brand.updated_at))}</dd></div>
              </dl>
              <div className="brand-detail-section">
                <div><small>Offers</small><h3>Research stays separate by offer.</h3></div>
                <div className="offer-list">
                  {brandDetail.offers.map((offer) => (
                    <article key={offer.id}>
                      <div><strong>{offer.offer_or_lead_type || "Untitled offer"}</strong><span>{offer.profession || "Profession not specified"} · {offer.target_age_range || "Age not specified"}</span></div>
                      <span>Research {offer.latest_run ? offer.latest_run.is_current ? offer.latest_run.status : "needs refresh" : "not run"}</span>
                      <button type="button" onClick={() => { chooseProfile(offer.id); navigate("research"); }}>Open offer</button>
                    </article>
                  ))}
                </div>
              </div>
              <div className="brand-detail-section">
                <div><small>Brand library</small><h3>Research, creative, campaigns, and learning.</h3></div>
                <div className="brand-lifecycle">
                  <button type="button" onClick={() => { chooseProfile(brandDetail.offers[0].id); navigate("library"); }}><b>{brandDetail.offers.filter(({ latest_run }) => latest_run).length}</b><span>Research packages</span></button>
                  <div><b>0</b><span>Creative assets</span></div>
                  <div><b>0</b><span>Campaigns</span></div>
                  <div><b>0</b><span>Learnings</span></div>
                </div>
                {brandDetailRun ? <a className="drive-link" href={brandDetailRun.folder_url} target="_blank" rel="noreferrer">Open brand folder in Google Drive <span aria-hidden="true">↗</span></a> : null}
              </div>
            </section>
          ) : brandGroups.length ? (
            <section className="brand-file-grid" aria-label="Brand files">
              {brandGroups.map(({ brandId, brand, offers }) => (
                <article className="brand-file-card" key={brandId}>
                  <header><span>{brandInitials(brand)}</span><div><small>Permanent brand file</small><h2>{brandLabel(brand)}</h2></div></header>
                  <dl>
                    <div><dt>Industry</dt><dd>{brand.industry || "Not specified"}</dd></div>
                    <div><dt>Market</dt><dd>{brand.country_region || "Not specified"}</dd></div>
                    <div><dt>Primary offer</dt><dd>{brand.offer_or_lead_type || "Untitled offer"}</dd></div>
                    <div><dt>Profession</dt><dd>{brand.profession || "Not specified"}</dd></div>
                  </dl>
                  <div className="brand-relationships"><span><b>{offers.length}</b> {offers.length === 1 ? "Offer" : "Offers"}</span><span><b>{offers.filter(({ latest_run }) => latest_run).length}</b> Research packages</span><span><b>0</b> Creative assets</span></div>
                  <button type="button" onClick={() => { chooseProfile(offers[0].id); setBrandDetailId(brandId); }}>Open brand file</button>
                </article>
              ))}
            </section>
          ) : (
            <div className="tool-empty"><h2>No brand files yet.</h2><p>Create the first central brand file, then attach offers, research, ads, and creative as the campaign grows.</p><button type="button" onClick={() => navigate("research")}>Create Brand</button></div>
          )}
        </div>
      ) : activeView === "settings" ? (
        <div className="content-column settings-column" id="top">
          <section className="intro" aria-labelledby="settings-title">
            <p className="kicker">Workspace preferences</p>
            <h1 id="settings-title">Settings</h1>
            <p>Appearance and approval preferences.</p>
          </section>
          <section className="section-card settings-section" id="preferences">
            <div className="settings-heading">
              <span>01</span>
              <div><h2>Appearance &amp; approvals</h2><p>Personal preferences for this workspace.</p></div>
            </div>
            <div className="preference-grid">
              <fieldset className="preference-card">
                <legend>Appearance</legend>
                <div className="segmented-control">
                  {(["light", "dark", "system"] as const).map((option) => (
                    <button className={appearance === option ? "selected" : ""} type="button" key={option} onClick={() => setAppearance(option)} aria-pressed={appearance === option}>{option[0].toUpperCase() + option.slice(1)}</button>
                  ))}
                </div>
                <p>System follows this computer’s light or dark setting.</p>
              </fieldset>
              <fieldset className={`preference-card mode-card mode-${operatingMode}`}>
                <legend>Commit approvals</legend>
                <div className="segmented-control">
                  <button className={operatingMode === "safety" ? "selected" : ""} type="button" onClick={() => setOperatingMode("safety")} aria-pressed={operatingMode === "safety"}>Safety</button>
                  <button className={operatingMode === "yolo" ? "selected" : ""} type="button" onClick={() => setOperatingMode("yolo")} aria-pressed={operatingMode === "yolo"}>YOLO</button>
                </div>
                <p>{operatingModeCopy(operatingMode)}</p>
                <strong>Spending, publishing, forms, budgets, and live traffic always stop for explicit approval.</strong>
              </fieldset>
            </div>
          </section>
        </div>
      ) : (
        <div className="content-column settings-column" id="top">
          <section className="intro" aria-labelledby="integrations-title">
            <p className="kicker">Integrations</p>
            <h1 id="integrations-title">Integrations</h1>
            <p>Connect the services this workspace needs. Saving a key never starts paid work.</p>
          </section>

          <details className="advanced-details" id="operators">
            <summary>Advanced connections <small>Optional local agents and contributor setup</small></summary>
          <section className="section-card settings-section">
            <div className="settings-heading">
              <span>01</span>
              <div><h2>Agent access</h2><p>Optional connections for local and self-hosted work.</p></div>
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
          </details>

          <section className="section-card settings-section" id="connections">
            <div className="settings-heading">
              <span>02</span>
              <div><h2>API keys &amp; storage</h2><p>Keys go straight to the server-side credential boundary and clear from this form. Hosted keys use encrypted storage; local pasted keys are session-only.</p></div>
            </div>
            <div className="settings-grid">
              <form className="provider-card media-card" onSubmit={(event) => { event.preventDefault(); void connectProvider("kie_ai"); }}>
                <div><span className={`provider-dot provider-${kieStatus.status}`} /><strong>Kie.ai</strong><span className="provider-badge">Images + video</span></div>
                <p>The creative media engine. Negroni will check credit and create asynchronous tasks only after the relevant approval gate.</p>
                <small>{kieStatus.status === "connected" ? kieStatus.detail ?? "Connected" : kieStatus.blocker ?? "Not connected"}</small>
                <label htmlFor="kie-key">Kie.ai API key</label>
                <input id="kie-key" type="password" value={kieKey} onChange={(event) => setKieKey(event.target.value)} placeholder="Paste key" autoComplete="off" disabled={!settingsAvailable} />
                <div className="provider-actions">
                  <button type="submit" disabled={!settingsAvailable || settingsBusy || kieKey.trim().length < 20}>{kieStatus.status === "connected" ? "Replace Kie.ai key" : "Save Kie.ai key"}</button>
                  {kieStatus.status === "connected" ? <button type="button" onClick={() => void disconnectApiProvider("kie_ai")} disabled={settingsBusy}>Disconnect</button> : null}
                </div>
              </form>

              <form className="provider-card" onSubmit={(event) => { event.preventDefault(); void connectProvider("apify"); }}>
                <div><span className={`provider-dot provider-${apifyStatus.status}`} /><strong>Apify</strong><span className="provider-badge">Web data</span></div>
                <p>Authorized public-web actors and datasets for research collection. Adding a token does not run an actor or spend platform credits.</p>
                <small>{apifyStatus.status === "connected" ? apifyStatus.detail ?? "Connected" : apifyStatus.blocker ?? "Not connected"}</small>
                <label htmlFor="apify-key">Apify API token</label>
                <input id="apify-key" type="password" value={apifyKey} onChange={(event) => setApifyKey(event.target.value)} placeholder="Paste token" autoComplete="off" disabled={!settingsAvailable} />
                <div className="provider-actions">
                  <button type="submit" disabled={!settingsAvailable || settingsBusy || apifyKey.trim().length < 20 || apifyKey.trim().length > 512}>{apifyStatus.status === "connected" ? "Replace Apify token" : "Save Apify token"}</button>
                  {apifyStatus.status === "connected" ? <button type="button" onClick={() => void disconnectApiProvider("apify")} disabled={settingsBusy}>Disconnect</button> : null}
                </div>
              </form>

              <form className="provider-card" id="gemini-connection" onSubmit={(event) => { event.preventDefault(); void saveGemini(); }}>
                <div><span className={`provider-dot provider-${geminiApiReady ? "connected" : geminiConnection.status === "connection_error" ? "blocked" : "not_connected"}`} /><strong>Gemini</strong><span className="provider-badge">Standard Research</span></div>
                <p>The key is sent once to an owner-scoped credential broker and never included in research artifacts. Hosted storage is encrypted; a local paste lasts only for the current process. Saving never starts paid research.</p>
                <small>{geminiApiReady ? `Connected · last verified ${geminiConnection.last_verified_at ? new Date(geminiConnection.last_verified_at).toLocaleString() : "recently"}${geminiConnection.last_four ? ` · ending ${geminiConnection.last_four}` : ""}` : geminiConnection.status === "checking" ? "Checking" : geminiConnection.error ?? "Not connected"}</small>
                <label htmlFor="gemini-key">Gemini API key</label>
                <input id="gemini-key" type="password" value={geminiKey} onChange={(event) => setGeminiKey(event.target.value)} placeholder={geminiApiReady ? "Paste replacement key" : "Paste key"} autoComplete="off" />
                <div className="provider-actions">
                  <button type="submit" disabled={settingsBusy || geminiKey.trim().length < 20}>{geminiApiReady ? "Replace key" : "Save and verify"}</button>
                  {geminiApiReady ? <button type="button" onClick={() => void disconnectGemini()} disabled={settingsBusy}>Disconnect</button> : null}
                </div>
              </form>

              <article className="provider-card drive-card">
                <div className="provider-title">
                  <span className={`provider-dot provider-${googleStatus.status}`} />
                  <strong>Google Drive</strong>
                  <span className="provider-badge">Auto-file</span>
                </div>
                <p>Negroni creates a private <b>Negroni</b> folder, then organizes every durable file under its permanent brand and current offer.</p>
                <div className="storage-route" aria-label="Google Doc, Google Sheet, and Markdown are stored under Negroni, brand, and offer folders">
                  <span className="storage-file storage-doc">Doc</span>
                  <span className="storage-file storage-sheet">Sheet</span>
                  <span className="storage-file storage-markdown">MD</span>
                  <span className="storage-arrow" aria-hidden="true">→</span>
                  <span className="storage-folder">Negroni / Brand / Offer</span>
                </div>
                <small>
                  {googleStatus.status === "connected" && googleStatus.auto_store
                    ? `Connected Google account · Auto-store on · ${googleStatus.folder_name ?? "Negroni"}`
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

          <details className="advanced-details" id="local-setup">
            <summary>Developer setup <small>Local-only contributor tools</small></summary>
          <section className="section-card settings-section">
            <div className="settings-heading">
              <span>03</span>
              <div><h2>Developer fallback</h2><p>Local-only setup for contributors.</p></div>
            </div>
            <div className={`local-setup-card ${settingsAvailable ? "local-setup-ready" : ""}`}>
              <div className="local-setup-state">
                <span className={`provider-dot provider-${settingsAvailable ? "connected" : "blocked"}`} />
                <div><strong>{settingsAvailable ? "Local bridge ready" : "Hosted tools not connected"}</strong><small>{settingsAvailable ? "Local provider controls and key fields are available." : "Live provider actions stay blocked until the hosted broker exists; use the launcher only for local development."}</small></div>
              </div>
              <ol className="setup-steps">
                <li><span>1</span><div><strong>Use only for local development</strong><p>Run <code>negroni start</code> from a trusted checkout.</p></div></li>
                <li><span>2</span><div><strong>Return to Integrations</strong><p>Local agent status and development-only key fields become available.</p></div></li>
                <li><span>3</span><div><strong>Keep credentials private</strong><p>Keys pasted here last only for this local process. Use a 1Password Developer Environment for persistent injection; Negroni does not write them to the browser, project, or plaintext files.</p></div></li>
              </ol>
              {settingsBlocker ? <div className="settings-blocker"><strong>Connection setup needed</strong><p>{settingsBlocker}</p></div> : null}
            </div>
          </section>
          </details>

          <section className="settings-feedback" aria-live="polite">
            {settingsMessage ? <p className="inline-message" role="status">{settingsMessage}</p> : null}
          </section>
        </div>
      )}

      </main>
    </div>
  );
}
