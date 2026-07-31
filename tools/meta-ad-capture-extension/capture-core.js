(function attachNegroniMetaCapture(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.NegroniMetaCapture = api;
})(typeof globalThis === "object" ? globalThis : this, function createCaptureCore() {
  "use strict";

  const CONTRACT = "negroni-meta-visible-capture";
  const CONTRACT_VERSION = "1.0";
  const MAX_ADS = 1_000;
  const LIBRARY_ID_RE = /\b(?:Ad\s+Library\s+ID|Library\s+ID|Ad\s+ID)\s*[:#]?\s*(\d{5,40})\b/i;
  const ID_RE = /^\d{5,40}$/;
  const META_HOSTS = new Set(["facebook.com", "www.facebook.com", "web.facebook.com"]);
  const SOURCE_PARAMETERS = new Set([
    "active_status",
    "ad_type",
    "content_languages",
    "country",
    "delivery_date_max",
    "delivery_date_min",
    "end_date[max]",
    "end_date[min]",
    "media_type",
    "publisher_platforms",
    "q",
    "search_type",
    "sort_data",
    "start_date[max]",
    "start_date[min]",
    "view_all_page_id",
  ]);
  const SENSITIVE_PARAMETER_RE = /^(?:access_?token|auth(?:orization)?|api_?key|key|session(?:id)?|sid|sig(?:nature)?|token|expires?)$/i;

  function cleanText(value, limit = 100_000) {
    if (typeof value !== "string") return "";
    return value.replace(/\0/g, "").replace(/\r\n?/g, "\n").trim().slice(0, limit);
  }

  function normalizedLines(value) {
    return cleanText(value)
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function isMetaHost(hostname) {
    const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
    return META_HOSTS.has(host);
  }

  function parseHttpUrl(value) {
    const text = cleanText(value, 8_000);
    if (!text) return null;
    let parsed;
    try {
      parsed = new URL(text);
    } catch {
      return null;
    }
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return parsed;
  }

  function stripSensitiveParameters(parsed) {
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_PARAMETER_RE.test(key) || key.toLowerCase() === "fbclid") {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = "";
    return parsed;
  }

  function sanitizeHttpUrl(value) {
    const parsed = parseHttpUrl(value);
    if (!parsed) return "";

    if (parsed.hostname.toLowerCase() === "l.facebook.com" && parsed.pathname === "/l.php") {
      const destination = parsed.searchParams.get("u");
      return destination ? sanitizeHttpUrl(destination) : "";
    }

    return stripSensitiveParameters(parsed).toString();
  }

  function sanitizeSourceUrl(value) {
    const parsed = parseHttpUrl(value);
    if (!parsed || !isMetaHost(parsed.hostname) || !parsed.pathname.startsWith("/ads/library")) {
      throw new Error("Capture requires a public Meta Ad Library URL.");
    }
    parsed.protocol = "https:";
    parsed.hostname = "www.facebook.com";
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (!SOURCE_PARAMETERS.has(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  }

  function libraryIdFromText(value) {
    return cleanText(value).match(LIBRARY_ID_RE)?.[1] || "";
  }

  function pageIdFromUrl(value) {
    const parsed = parseHttpUrl(value);
    if (!parsed || !isMetaHost(parsed.hostname)) return "";
    if (parsed.pathname === "/profile.php") {
      const id = parsed.searchParams.get("id") || "";
      return ID_RE.test(id) ? id : "";
    }
    const peopleMatch = parsed.pathname.match(/^\/people\/[^/]+\/(\d{5,40})(?:\/|$)/i);
    if (peopleMatch) return peopleMatch[1];
    const numericMatch = parsed.pathname.match(/^\/(\d{5,40})(?:\/|$)/);
    return numericMatch ? numericMatch[1] : "";
  }

  function linkRecords(snapshot) {
    if (!Array.isArray(snapshot?.links)) return [];
    return snapshot.links.slice(0, 250).map((link) => ({
      href: sanitizeHttpUrl(link?.href),
      text: cleanText(link?.text, 500).replace(/\s+/g, " "),
      aria_label: cleanText(link?.aria_label, 500).replace(/\s+/g, " "),
    })).filter((link) => link.href);
  }

  function isPageCandidate(link) {
    const parsed = parseHttpUrl(link.href);
    if (!parsed || !isMetaHost(parsed.hostname)) return false;
    const path = parsed.pathname.toLowerCase();
    return !(
      path.startsWith("/ads/library") ||
      path.startsWith("/business") ||
      path.startsWith("/help") ||
      path.startsWith("/l.php") ||
      path.startsWith("/login") ||
      path.startsWith("/plugins") ||
      path.startsWith("/share")
    );
  }

  function selectPageLink(links) {
    const candidates = links.filter(isPageCandidate);
    return (
      candidates.find((link) => pageIdFromUrl(link.href)) ||
      candidates.find((link) => link.text && !/^(?:learn more|apply now|call now|contact us)$/i.test(link.text)) ||
      candidates[0] ||
      null
    );
  }

  function isExternalLandingLink(link) {
    const parsed = parseHttpUrl(link.href);
    if (!parsed) return false;
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return !(
      isMetaHost(host) ||
      host === "meta.com" ||
      host.endsWith(".meta.com") ||
      host === "instagram.com" ||
      host.endsWith(".instagram.com") ||
      host.endsWith(".fbcdn.net")
    );
  }

  function statusFromLines(lines) {
    if (lines.some((line) => /^(?:inactive|not active)$/i.test(line))) return "inactive";
    if (lines.some((line) => /^active$/i.test(line))) return "active";
    return "unknown";
  }

  function startedAtFromLines(lines) {
    for (const line of lines) {
      const match = line.match(/\bStarted running on\s+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})\b/i);
      if (match) return match[1];
    }
    return "";
  }

  function adTextFromLines(lines, pageName) {
    const seen = new Set();
    return lines.filter((line) => {
      if (/^(?:active|inactive|not active|sponsored)$/i.test(line)) return false;
      if (/^(?:Ad\s+Library\s+ID|Library\s+ID|Ad\s+ID)\b/i.test(line)) return false;
      if (/^Started running on\b/i.test(line)) return false;
      if (/^(?:Platforms?|See ad details|See summary details|Multiple versions)$/i.test(line)) return false;
      if (pageName && line.toLowerCase() === pageName.toLowerCase()) return false;
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).join("\n").slice(0, 100_000);
  }

  function normalizeSnapshot(snapshot) {
    const lines = normalizedLines(snapshot?.visible_text);
    const libraryId = libraryIdFromText(lines.join("\n"));
    if (!libraryId) return null;

    const links = linkRecords(snapshot);
    const pageLink = selectPageLink(links);
    const pageName = cleanText(pageLink?.text || pageLink?.aria_label, 500);
    const pageUrl = pageLink?.href || "";
    const landingLink = links.find(isExternalLandingLink);

    return {
      library_id: libraryId,
      status: statusFromLines(lines),
      started_at: startedAtFromLines(lines),
      page_id: pageIdFromUrl(pageUrl),
      page_name: pageName,
      page_url: pageUrl,
      ad_text: adTextFromLines(lines, pageName),
      landing_url: landingLink?.href || "",
      ad_library_url: `https://www.facebook.com/ads/library/?id=${libraryId}`,
      media: [],
    };
  }

  function countryFromSource(sourceUrl, requestedCountry) {
    const explicit = cleanText(requestedCountry, 8).toUpperCase();
    if (/^(?:[A-Z]{2}|ALL)$/.test(explicit)) return explicit;
    const parsed = new URL(sourceUrl);
    const fromUrl = cleanText(parsed.searchParams.get("country"), 8).toUpperCase();
    return /^(?:[A-Z]{2}|ALL)$/.test(fromUrl) ? fromUrl : "UNKNOWN";
  }

  function advertiserIdentity(ad) {
    if (ad.page_id) return `id:${ad.page_id}`;
    if (ad.page_url) return `url:${ad.page_url.toLowerCase()}`;
    return "";
  }

  function summarizeAds(ads) {
    const active = ads.filter((ad) => ad.status === "active");
    const identities = new Set(active.map(advertiserIdentity).filter(Boolean));
    return {
      ad_count: ads.length,
      active_ad_count: active.length,
      distinct_active_advertiser_count: identities.size,
    };
  }

  function buildVisibleCapture(cardSnapshots, options = {}) {
    if (!Array.isArray(cardSnapshots)) throw new Error("Rendered card snapshots must be an array.");
    const sourceUrl = sanitizeSourceUrl(options.sourceUrl);
    const collectedAt = cleanText(options.collectedAt, 128);
    if (!collectedAt || Number.isNaN(Date.parse(collectedAt))) {
      throw new Error("Capture requires a valid collectedAt timestamp.");
    }

    const ads = [];
    const seen = new Set();
    for (const snapshot of cardSnapshots.slice(0, MAX_ADS * 4)) {
      const ad = normalizeSnapshot(snapshot);
      if (!ad || seen.has(ad.library_id)) continue;
      seen.add(ad.library_id);
      ads.push(ad);
      if (ads.length >= MAX_ADS) break;
    }
    const summary = summarizeAds(ads);

    return {
      contract: CONTRACT,
      contract_version: CONTRACT_VERSION,
      schema_version: 2,
      collected_at: new Date(collectedAt).toISOString(),
      source_url: sourceUrl,
      requested_country: countryFromSource(sourceUrl, options.requestedCountry),
      collection_status: "partial",
      pagination_complete: false,
      coverage_complete: false,
      extraction: {
        candidate_card_count: cardSnapshots.length,
        returned_ad_count: ads.length,
        observed_library_id_count: ads.length,
      },
      capture_summary: summary,
      limitations: [
        "User-triggered snapshot of ads rendered in the current public Meta Ad Library page only.",
        "No claim of complete pagination, historical coverage, targeting, spend, or performance.",
        "Media URLs are intentionally excluded because Meta CDN URLs may be signed or session-bound.",
      ],
      ads,
    };
  }

  function assertSafeOptionalUrl(value, label) {
    if (value === "") return;
    const sanitized = sanitizeHttpUrl(value);
    if (!sanitized || sanitized !== value) throw new Error(`${label} is invalid or contains sensitive parameters.`);
  }

  function validateVisibleCapture(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Capture payload must be an object.");
    }
    if (payload.contract !== CONTRACT || payload.contract_version !== CONTRACT_VERSION) {
      throw new Error("Unsupported visible-capture contract.");
    }
    if (payload.schema_version !== 2) throw new Error("Capture schema_version must be 2.");
    if (!payload.collected_at || Number.isNaN(Date.parse(payload.collected_at))) {
      throw new Error("Capture timestamp is invalid.");
    }
    if (sanitizeSourceUrl(payload.source_url) !== payload.source_url) {
      throw new Error("Capture source URL is not canonical or safe.");
    }
    if (payload.collection_status !== "partial") {
      throw new Error("Visible capture must retain partial collection status.");
    }
    if (payload.pagination_complete !== false) {
      throw new Error("Visible capture must not claim complete pagination.");
    }
    if (payload.coverage_complete !== false) {
      throw new Error("Visible capture must not claim complete coverage.");
    }
    if (!/^(?:[A-Z]{2}|ALL|UNKNOWN)$/.test(payload.requested_country || "")) {
      throw new Error("Capture requested_country is invalid.");
    }
    if (!Array.isArray(payload.ads) || payload.ads.length > MAX_ADS) {
      throw new Error(`Capture ads must be an array of at most ${MAX_ADS} items.`);
    }

    const seen = new Set();
    for (const ad of payload.ads) {
      if (!ad || typeof ad !== "object" || !ID_RE.test(ad.library_id || "")) {
        throw new Error("Capture contains an invalid Meta Library ID.");
      }
      if (seen.has(ad.library_id)) throw new Error("Capture contains duplicate Meta Library IDs.");
      seen.add(ad.library_id);
      if (!Array.isArray(ad.media) || ad.media.length !== 0) {
        throw new Error("Visible capture must not export media URLs.");
      }
      if (ad.page_id && !ID_RE.test(ad.page_id)) throw new Error("Capture contains an invalid Page ID.");
      assertSafeOptionalUrl(ad.page_url, "Page URL");
      assertSafeOptionalUrl(ad.landing_url, "Landing URL");
      const expectedLibraryUrl = `https://www.facebook.com/ads/library/?id=${ad.library_id}`;
      if (ad.ad_library_url !== expectedLibraryUrl) {
        throw new Error("Capture contains a mismatched Ad Library evidence URL.");
      }
      for (const field of ["status", "started_at", "page_id", "page_name", "page_url", "ad_text", "landing_url"]) {
        if (typeof ad[field] !== "string") throw new Error(`Capture ad field ${field} must be a string.`);
      }
    }

    return {
      ...summarizeAds(payload.ads),
      requested_country: payload.requested_country,
    };
  }

  return {
    buildVisibleCapture,
    libraryIdFromText,
    sanitizeHttpUrl,
    sanitizeSourceUrl,
    validateVisibleCapture,
  };
});
