(function runPopup() {
  "use strict";

  const core = globalThis.NegroniMetaCapture;
  const button = document.querySelector("#capture");
  const status = document.querySelector("#status");

  function show(message, error = false) {
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function filenameFor(payload) {
    const timestamp = payload.collected_at.replace(/[:.]/g, "-");
    return `negroni-meta-visible-${payload.requested_country}-${timestamp}.json`;
  }

  async function capture() {
    button.disabled = true;
    show("Reading rendered Ad Library cards…");
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !/^https:\/\/(?:[^/]+\.)?facebook\.com\/ads\/library(?:\/|\?|$)/i.test(tab.url || "")) {
        throw new Error("Open a public Meta Ad Library results page first.");
      }

      let response;
      try {
        response = await chrome.tabs.sendMessage(tab.id, { type: "negroni.capture.visible-meta-ads" });
      } catch {
        throw new Error("Reload the Ad Library tab once, then try again.");
      }
      if (!response?.ok) throw new Error(response?.error || "The page could not be captured.");

      const summary = core.validateVisibleCapture(response.payload);
      const blobUrl = URL.createObjectURL(
        new Blob([`${JSON.stringify(response.payload, null, 2)}\n`], { type: "application/json" }),
      );
      try {
        await chrome.downloads.download({
          url: blobUrl,
          filename: filenameFor(response.payload),
          saveAs: true,
        });
      } finally {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      }

      show(
        `Saved ${summary.ad_count} rendered ads: ${summary.active_ad_count} visibly active across ${summary.distinct_active_advertiser_count} identified advertisers. Coverage remains partial.`,
      );
    } catch (error) {
      show(error instanceof Error ? error.message : "Capture failed.", true);
    } finally {
      button.disabled = false;
    }
  }

  button.addEventListener("click", capture);
})();
