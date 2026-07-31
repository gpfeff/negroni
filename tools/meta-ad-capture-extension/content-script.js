(function installVisibleCapture() {
  "use strict";

  const core = globalThis.NegroniMetaCapture;
  if (!core) return;

  const LABEL_RE = /\b(?:Ad\s+Library\s+ID|Library\s+ID|Ad\s+ID)\b/i;

  function isRendered(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }

  function libraryIds(value) {
    const ids = new Set();
    const pattern = /\b(?:Ad\s+Library\s+ID|Library\s+ID|Ad\s+ID)\s*[:#]?\s*(\d{5,40})\b/gi;
    for (const match of String(value || "").matchAll(pattern)) ids.add(match[1]);
    return ids;
  }

  function nearestIdElement(node) {
    let current = node.parentElement;
    for (let depth = 0; current && current !== document.body && depth < 5; depth += 1) {
      if (core.libraryIdFromText(current.innerText)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function findLibraryIdElements() {
    const elements = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!LABEL_RE.test(node.nodeValue || "")) continue;
      const element = nearestIdElement(node);
      if (element && isRendered(element)) elements.push(element);
    }

    for (const anchor of document.querySelectorAll('a[href*="/ads/library/"][href*="id="]')) {
      if (isRendered(anchor)) elements.push(anchor);
    }
    return elements;
  }

  function findCardRoot(seed, libraryId) {
    let current = seed;
    let best = seed;
    let foundId = false;
    for (let depth = 0; current && current !== document.body && depth < 14; depth += 1) {
      if (!isRendered(current)) break;
      const text = current.innerText || "";
      const ids = libraryIds(text);
      if (ids.size > 1 || text.length > 100_000) break;
      if (ids.has(libraryId)) {
        foundId = true;
        best = current;
        if (current.matches('article, [role="article"]')) return current;
      } else if (foundId) {
        break;
      }
      current = current.parentElement;
    }
    return best;
  }

  function libraryIdForSeed(seed) {
    const fromText = core.libraryIdFromText(seed.innerText || seed.textContent || "");
    if (fromText) return fromText;
    if (seed instanceof HTMLAnchorElement) {
      try {
        const id = new URL(seed.href).searchParams.get("id") || "";
        return /^\d{5,40}$/.test(id) ? id : "";
      } catch {
        return "";
      }
    }
    return "";
  }

  function snapshotCard(element) {
    return {
      visible_text: (element.innerText || "").slice(0, 100_000),
      links: [...element.querySelectorAll("a[href]")].slice(0, 250).map((anchor) => ({
        href: anchor.href || "",
        text: (anchor.innerText || "").slice(0, 500),
        aria_label: (anchor.getAttribute("aria-label") || "").slice(0, 500),
      })),
    };
  }

  function renderedCardSnapshots() {
    const roots = new Map();
    for (const seed of findLibraryIdElements()) {
      const libraryId = libraryIdForSeed(seed);
      if (!libraryId || roots.has(libraryId)) continue;
      roots.set(libraryId, findCardRoot(seed, libraryId));
    }
    return [...roots.values()].map(snapshotCard);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "negroni.capture.visible-meta-ads") return false;
    try {
      const payload = core.buildVisibleCapture(renderedCardSnapshots(), {
        sourceUrl: window.location.href,
        collectedAt: new Date().toISOString(),
      });
      sendResponse({ ok: true, payload });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Capture failed." });
    }
    return false;
  });
})();
