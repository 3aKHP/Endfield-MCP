/**
 * int64-safe JSON parsing tests.
 *
 * Verifies the parseInt64Safe logic that wraps large integer literals in
 * quotes so they survive JSON.parse as strings. This is the single most
 * load-bearing piece of the Endfield data layer — a regression here
 * silently breaks every localization lookup.
 *
 * The tests reach into the module-private helper via a tiny public surface:
 * we exercise it through DirectoryStore.readJsonInt64Safe against staged
 * temp files, which is the real consumer path.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DirectoryStore } from "../src/data/stores.js";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "ef-int64-"));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("DirectoryStore.readJsonInt64Safe", () => {
  it("preserves int64 values as strings when beyond MAX_SAFE_INTEGER", () => {
    // -7078064683023630592 is chr_0002_endminm's actual name id.
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"name": {"id": -7078064683023630592, "text": ""}}',
    );
    const store = new DirectoryStore(tmpRoot);
    const data = store.readJsonInt64Safe<{
      name: { id: string; text: string };
    }>("test.json");
    expect(data.name.id).toBe("-7078064683023630592");
    expect(typeof data.name.id).toBe("string");
  });

  it("preserves positive int64 values beyond MAX_SAFE_INTEGER", () => {
    // 9200000000000000001 is comfortably beyond 2^53.
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"id": 9200000000000000001}',
    );
    const store = new DirectoryStore(tmpRoot);
    const data = store.readJsonInt64Safe<{ id: string }>("test.json");
    expect(data.id).toBe("9200000000000000001");
  });

  it("leaves safe integers as numbers", () => {
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"rarity": 6, "profession": 0, "weaponType": 1}',
    );
    const store = new DirectoryStore(tmpRoot);
    const data = store.readJsonInt64Safe<{
      rarity: number;
      profession: number;
      weaponType: number;
    }>("test.json");
    expect(data.rarity).toBe(6);
    expect(typeof data.rarity).toBe("number");
    expect(data.profession).toBe(0);
  });

  it("leaves MAX_SAFE_INTEGER boundary values as numbers", () => {
    // 9007199254740991 === Number.MAX_SAFE_INTEGER. Should stay a number.
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"safe": 9007199254740991}',
    );
    const store = new DirectoryStore(tmpRoot);
    const data = store.readJsonInt64Safe<{ safe: number }>("test.json");
    expect(data.safe).toBe(Number.MAX_SAFE_INTEGER);
    expect(typeof data.safe).toBe("number");
  });

  it("wraps MAX_SAFE_INTEGER + 1 as string", () => {
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"over": 9007199254740992}',
    );
    const store = new DirectoryStore(tmpRoot);
    const data = store.readJsonInt64Safe<{ over: string }>("test.json");
    expect(data.over).toBe("9007199254740992");
    expect(typeof data.over).toBe("string");
  });

  it("handles arrays of mixed int64 and small ints", () => {
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"ids": [-7078064683023630592, 42, 9007199254740999, 0]}',
    );
    const store = new DirectoryStore(tmpRoot);
    const data = store.readJsonInt64Safe<{
      ids: (string | number)[];
    }>("test.json");
    expect(data.ids[0]).toBe("-7078064683023630592");
    expect(data.ids[1]).toBe(42);
    expect(data.ids[2]).toBe("9007199254740999");
    expect(data.ids[3]).toBe(0);
  });

  it("does not touch integers already inside quoted strings", () => {
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"key": "-7078064683023630592", "value": "管理员"}',
    );
    const store = new DirectoryStore(tmpRoot);
    const data = store.readJsonInt64Safe<{
      key: string;
      value: string;
    }>("test.json");
    expect(data.key).toBe("-7078064683023630592");
    expect(data.value).toBe("管理员");
  });

  it("handles nested objects with int64 at multiple depths", () => {
    // Written as raw text — JSON.stringify of a JS object would truncate
    // the int64 ids before they ever reach the parser.
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"outer":{"id":-7078064683023630592,"nested":[{"id":9007199254740999,"small":1}]}}',
    );
    const store = new DirectoryStore(tmpRoot);
    const data = store.readJsonInt64Safe<{
      outer: {
        id: string;
        nested: Array<{ id: string; small: number }>;
      };
    }>("test.json");
    expect(data.outer.id).toBe("-7078064683023630592");
    expect(data.outer.nested[0]!.id).toBe("9007199254740999");
    expect(data.outer.nested[0]!.small).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases from CR #1 — these were genuine bugs in the regex-based
// implementation. The rewritten string-aware parser must handle them.
// ---------------------------------------------------------------------------

describe("readJsonInt64Safe — CR #1 edge cases", () => {
  it("handles 20+ digit integers without producing invalid JSON (B1)", () => {
    // Old regex capped at 19 digits, leaving the 20th dangling → invalid JSON.
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"big":12345678901234567890}',
    );
    const store = new DirectoryStore(tmpRoot);
    const data = store.readJsonInt64Safe<{ big: string }>("test.json");
    expect(data.big).toBe("12345678901234567890");
  });

  it("does not corrupt large floats (B1)", () => {
    // Old regex quoted the integer part, leaving ".5" dangling → invalid JSON.
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"f":9200000000000000000.5}',
    );
    const store = new DirectoryStore(tmpRoot);
    // Float survives as a number (JS can't represent it exactly, but it
    // must not throw and must remain a number type).
    const data = store.readJsonInt64Safe<{ f: number }>("test.json");
    expect(typeof data.f).toBe("number");
  });

  it("does not corrupt large scientific-notation numbers (B1)", () => {
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"sci":9.2e18}',
    );
    const store = new DirectoryStore(tmpRoot);
    const data = store.readJsonInt64Safe<{ sci: number }>("test.json");
    expect(typeof data.sci).toBe("number");
  });

  it("does not touch large numbers inside string values (B2)", () => {
    // Old regex matched `,` inside strings → corruption.
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"desc":"a, 9007199254740999 b"}',
    );
    const store = new DirectoryStore(tmpRoot);
    const data = store.readJsonInt64Safe<{ desc: string }>("test.json");
    expect(data.desc).toBe("a, 9007199254740999 b");
  });

  it("does not touch numbers inside strings with escaped quotes (B2)", () => {
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"s":"He said \\"9007199254740999\\" loudly"}',
    );
    const store = new DirectoryStore(tmpRoot);
    const data = store.readJsonInt64Safe<{ s: string }>("test.json");
    expect(data.s).toBe('He said "9007199254740999" loudly');
  });

  it("handles a realistic Endfield table with free-text + int64 ids (B2 integration)", () => {
    // Mirrors the real CharacterTable shape: {id,text} objects (int64 id
    // as bare number) alongside descriptive strings that may contain
    // commas and numbers. The old regex would corrupt the description.
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"chr_0001_x":{"name":{"id":-7078064683023630592,"text":""},' +
        '"desc":"某角色，编号001，出生于2000年"},"count":42}',
    );
    const store = new DirectoryStore(tmpRoot);
    const data = store.readJsonInt64Safe<{
      chr_0001_x: {
        name: { id: string; text: string };
        desc: string;
      };
      count: number;
    }>("test.json");
    expect(data.chr_0001_x.name.id).toBe("-7078064683023630592");
    expect(data.chr_0001_x.desc).toBe("某角色，编号001，出生于2000年");
    expect(data.count).toBe(42);
  });

  it("preserves valid JSON structure across mixed content", () => {
    // Kitchen-sink test: int64 ids, safe ints, floats, strings with
    // commas, nested objects, arrays. Parser must not throw.
    writeFileSync(
      join(tmpRoot, "test.json"),
      '{"id":-7078064683023630592,"safe":42,"float":3.14,' +
        '"arr":[-5913937456330954032,1,2],"text":"a, b, c",' +
        '"nested":{"deep":9007199254740999,"ok":true}}',
    );
    const store = new DirectoryStore(tmpRoot);
    // Should not throw — that's the main assertion.
    const data = store.readJsonInt64Safe<Record<string, unknown>>("test.json");
    expect(data["id"]).toBe("-7078064683023630592");
    expect(data["safe"]).toBe(42);
    expect(data["float"]).toBe(3.14);
    expect((data["arr"] as unknown[])[0]).toBe("-5913937456330954032");
    expect((data["arr"] as unknown[])[1]).toBe(1);
    expect(data["text"]).toBe("a, b, c");
    expect((data["nested"] as Record<string, unknown>)["deep"]).toBe(
      "9007199254740999",
    );
  });
});
