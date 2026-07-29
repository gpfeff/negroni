import assert from "node:assert/strict";
import test from "node:test";
import { authenticatedOwner } from "@/lib/authenticated-user";
import {
  GOOGLE_DRIVE_FOLDER_NAME,
  GOOGLE_DRIVE_SCOPE,
  parseSettingsResponse,
  safeAuthorizationUrl,
} from "@/lib/provider-settings";

function connectedSettings(): {
  available: boolean;
  blocker: string | null;
  providers: Array<Record<string, unknown>>;
} {
  return {
    available: true,
    blocker: null,
    providers: [
      { provider: "codex_oauth", status: "connected", blocker: null },
      { provider: "gemini", status: "not_connected", blocker: null },
      {
        provider: "google_drive",
        status: "connected",
        blocker: null,
        account_email: "owner@example.com",
        folder_id: "folder-123",
        folder_name: GOOGLE_DRIVE_FOLDER_NAME,
        auto_store: true,
      },
    ],
  };
}

test("provider settings require the complete supported-provider set", () => {
  assert.equal(parseSettingsResponse(connectedSettings()).providers.length, 3);
  const incomplete = connectedSettings();
  incomplete.providers.pop();
  assert.throws(() => parseSettingsResponse(incomplete), /complete provider state/);
});

test("connected Google Workspace requires safe automatic filing metadata", () => {
  const missingFolder = connectedSettings();
  missingFolder.providers[2].folder_id = "";
  assert.throws(() => parseSettingsResponse(missingFolder), /incomplete Google Workspace/);

  assert.equal(GOOGLE_DRIVE_SCOPE, "https://www.googleapis.com/auth/drive.file");
  assert.equal(GOOGLE_DRIVE_FOLDER_NAME, "Negroni Research");
});

test("blocked settings and providers require explicit blockers", () => {
  const settings = connectedSettings();
  settings.available = false;
  assert.throws(() => parseSettingsResponse(settings), /settings blocker/);

  settings.blocker = "Credential broker is unavailable.";
  settings.providers[0] = { provider: "codex_oauth", status: "blocked", blocker: null };
  assert.throws(() => parseSettingsResponse(settings), /provider blocker/);
});

test("OAuth redirects must use HTTPS", () => {
  assert.equal(safeAuthorizationUrl("https://accounts.example.com/oauth"), "https://accounts.example.com/oauth");
  assert.throws(() => safeAuthorizationUrl("http://accounts.example.com/oauth"), /unsafe OAuth/);
  assert.throws(() => safeAuthorizationUrl("javascript:alert(1)"), /unsafe OAuth/);
});

test("workspace identity is normalized and local preview stays isolated", () => {
  const request = new Request("https://research.example.test/api/settings", {
    headers: { "oai-authenticated-user-email": " Owner@Example.com " },
  });
  assert.equal(authenticatedOwner(request), "owner@example.com");
  assert.equal(authenticatedOwner(new Request("http://localhost:3000/api/settings")), "local-preview");
  assert.equal(authenticatedOwner(new Request("https://research.example.test/api/settings")), null);
});

test("sanitized provider status never forwards broker credential fields", () => {
  const settings = connectedSettings();
  settings.providers[2].refresh_token = "must-not-cross-the-boundary";
  const parsed = parseSettingsResponse(settings);
  assert.equal("refresh_token" in parsed.providers[2], false);
});
