import assert from "node:assert/strict";
import test from "node:test";
import { safeServiceEndpoint, safeServiceUrl } from "@/lib/safe-service-url";

test("private service URLs require HTTPS or explicit loopback HTTP", () => {
  assert.equal(safeServiceUrl("https://runner.example.test/v1/research-runs")?.protocol, "https:");
  assert.equal(safeServiceUrl("http://127.0.0.1:47832/v1/research-runs")?.hostname, "127.0.0.1");
  assert.equal(safeServiceUrl("http://localhost:47832/v1/research-runs")?.hostname, "localhost");
  assert.equal(safeServiceUrl("http://runner.example.test/v1/research-runs"), null);
  assert.equal(safeServiceUrl("https://user:password@runner.example.test"), null);
  assert.equal(safeServiceUrl("not-a-url"), null);
  assert.equal(safeServiceEndpoint("https://broker.example.test/base", "/v1/providers/status")?.href,
    "https://broker.example.test/v1/providers/status");
});
