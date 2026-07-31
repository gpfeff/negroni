# Negroni Meta Visible Capture

This optional Chrome/Edge helper exports public ad cards that Meta has already
rendered in the current Ad Library page. The JSON is compatible with Negroni's
normalized manual-import schema and is always marked `partial`.

It does **not** automate scrolling, call hidden Meta endpoints, copy cookies,
export signed media URLs, prove complete country coverage, retain history in the
browser, or replace an unattended collector. It requests download access and
access only to Meta Ad Library pages.

## Install locally

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable **Developer mode**, choose **Load unpacked**, and select this folder.
3. Pin **Negroni Meta Visible Capture**. Reload any Ad Library tab that was open
   before installation.

The extension is self-contained. It has no server, login, API key, paid
provider, Google Sheet, Airtable, or machine-specific dependency.

## Capture evidence

1. Open Meta Ad Library and select the requested country plus **Active ads**.
2. Search a keyword or advertiser. Scroll until every result you want to retain
   has rendered. Meta may unload cards or challenge the session; the export can
   contain only what remains rendered in the page.
3. Click the extension and choose **Capture rendered ads**.
4. Save the JSON. The popup reports ads, visibly active ads, and distinct active
   advertisers whose Page ID or Page URL was visible.

Validate a saved file without importing it:

```bash
node tools/meta-ad-capture-extension/validate-capture.mjs /path/to/negroni-meta-visible.json
```

Then use the existing Negroni Meta Ads Intelligence `import` command with an
initialized keyword/discovery watch. Manual imports cannot confer complete
pagination, lifecycle, survivor, or winner status, even if the JSON is edited.

## Evidence boundary

- A record is `active` only when the rendered card exposes an Active label.
- Advertiser identity uses a visible numeric Page ID when available, otherwise
  the visible Facebook Page URL. A name alone is not counted as an identified
  advertiser.
- Direct `facebook.com/ads/library/?id=…` links are retained as evidence.
- Destination URLs are retained after Facebook redirect decoding and removal of
  common credential/session parameters.
- Media is deliberately `[]`; Meta CDN URLs can be signed or session-bound.
- `pagination_complete` and `coverage_complete` are always `false`, and
  `collection_status` is always `partial`.
