import { assertScope, canonicalJson, type LearningScope, type WarehouseAdapter, type WarehouseMeasurement } from "./contracts.ts";

export class FixtureWarehouseAdapter implements WarehouseAdapter {
  readonly name = "fixture-warehouse-v1";
  readonly #measurements: WarehouseMeasurement[];

  constructor(measurements: WarehouseMeasurement[]) {
    this.#measurements = structuredClone(measurements);
  }

  async load(scope: LearningScope): Promise<WarehouseMeasurement[]> {
    const checked = assertScope(scope);
    return structuredClone(this.#measurements.filter((measurement) => (
      canonicalJson(assertScope({
        owner_id: measurement.owner_id,
        workspace_id: measurement.workspace_id,
        brand_id: measurement.brand_id,
      })) === canonicalJson(checked)
    )));
  }
}
