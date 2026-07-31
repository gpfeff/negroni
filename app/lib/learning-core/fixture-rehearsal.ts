import { readFile } from "node:fs/promises";

import { type LearningCoreFixture } from "./contracts.ts";
import { DraperService } from "./draper.ts";
import { LearningCoreStore } from "./store.ts";
import { ObsidianVaultProjector } from "./vault.ts";
import { SqliteVectorIndex } from "./vector-index.ts";
import { FixtureWarehouseAdapter } from "./warehouse.ts";

const FIXTURE_URL = new URL("../../fixtures/learning-core/desert-ember.json", import.meta.url);

export async function runFixtureDraperRehearsal(options: {
  runtimeRoot: string;
  now: string;
}) {
  const fixture = JSON.parse(await readFile(FIXTURE_URL, "utf8")) as LearningCoreFixture;
  const warehouse = new FixtureWarehouseAdapter(fixture.outcomes);
  const outcomes = await warehouse.load(fixture.scope);
  const store = LearningCoreStore.open({
    runtimeRoot: options.runtimeRoot,
    now: () => options.now,
  });
  try {
    const ingestion = await store.ingestFixture({ ...fixture, outcomes });
    const learning = store.getLearning(fixture.scope, fixture.learning.learning_id);
    if (!learning) throw new Error("Fixture learning was not created.");
    const vectorIndex = new SqliteVectorIndex(store);
    vectorIndex.rebuild(fixture.scope, store.listLearningDocuments(fixture.scope), store.now());
    const projection = await new ObsidianVaultProjector(store).project(fixture.scope, learning.learning_id);
    const retrieval = store.searchLearnings(fixture.scope, "loop creative experiment qualified CPL", 800);
    const response = new DraperService(store).query({
      scope: fixture.scope,
      intent: "explain_loop_state",
      question: "How is this brand's loop doing?",
      token_budget: 800,
    });
    return {
      contract: "negroni-draper-rehearsal" as const,
      contract_version: "1.0" as const,
      fixture_only: true as const,
      warehouse_adapter: warehouse.name,
      ingestion,
      projection,
      retrieval,
      response,
      external_actions: [] as never[],
    };
  } finally {
    store.close();
  }
}
