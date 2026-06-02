import { describe, expect, it } from "vitest";
import { PAPER_FEATURES, PAPER_FEATURE_IDS } from "@/data/paperFeatures";
import {
  buildEntityCatalog,
  ENTITY_DEFINITIONS,
  NONE_LABEL,
  RESOLVER_LABELS,
} from "@/data/entityCatalog";

describe("entity catalog stays in sync with PAPER_FEATURES", () => {
  it("defines exactly one definition per paper entity, no more, no less", () => {
    const missing = PAPER_FEATURES.filter((e) => !ENTITY_DEFINITIONS[e.id]?.trim());
    expect(missing.map((e) => e.id)).toEqual([]);

    const stray = Object.keys(ENTITY_DEFINITIONS).filter((id) => !PAPER_FEATURE_IDS.has(id));
    expect(stray).toEqual([]);
  });

  it("exposes the full label space (every id plus none)", () => {
    expect(RESOLVER_LABELS).toContain(NONE_LABEL);
    expect(new Set(RESOLVER_LABELS).size).toBe(PAPER_FEATURE_IDS.size + 1);
    for (const id of PAPER_FEATURE_IDS) expect(RESOLVER_LABELS).toContain(id);
  });
});

describe("buildEntityCatalog renders from PAPER_FEATURES", () => {
  it("emits one line per entity with id, definition, and category", () => {
    const lines = buildEntityCatalog().split("\n");
    expect(lines.length).toBe(PAPER_FEATURES.length);
    for (const line of lines) expect(line).toMatch(/^.+ — .+ \[.+\]$/);
  });

  it("carries the intramural-vs-myocardial-bridge distinction the contract relies on", () => {
    const catalog = buildEntityCatalog();
    expect(catalog).toContain("intramural_course — ");
    expect(catalog).toMatch(/intramural_course —[^\n]*aortic wall/);
    expect(catalog).toMatch(/myocardial_bridge —[^\n]*tunneling under myocardium/);
  });
});
