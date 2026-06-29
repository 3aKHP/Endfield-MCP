/**
 * Release-sync matching tests.
 *
 * Covers `checkLatestRelease` — the function at the heart of PR #18's hotfix.
 * Before that fix, sync used `/releases/latest` (which returns the single
 * newest Release for the whole repo) and assumed it carried every asset. That
 * broke once the mirror shipped multiple independent assets across Releases
 * (tables v0.2.0, story v0.3.0, worldview v0.4.0). The fix lists releases and
 * matches by `assetName`.
 *
 * These tests stub `globalThis.fetch` (CI must be network-free — STYLE.md),
 * mirroring the pattern in `endfieldWiki.test.ts`. They lock in the contract:
 *   - returns the Release actually carrying the asset (not the newest one)
 *   - returns null only when no scanned Release has the asset (API reachable)
 *   - throws on network failure (so syncRelease can distinguish the two)
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import { checkLatestRelease } from "../src/data/sync.js";

// The multi-asset mirror layout that broke the old /releases/latest approach:
// three Releases, each carrying exactly one asset, newest-first (as GitHub's
// /releases endpoint returns them).
const MULTI_ASSET_RELEASES = [
  {
    tag_name: "v0.4.0",
    assets: [
      {
        name: "endfield-worldview.zip",
        browser_download_url: "https://example/v0.4.0/worldview",
      },
    ],
  },
  {
    tag_name: "v0.3.0",
    assets: [
      {
        name: "endfield-story-CN.zip",
        browser_download_url: "https://example/v0.3.0/story",
      },
    ],
  },
  {
    tag_name: "v0.2.0",
    assets: [
      {
        name: "endfield-tables.zip",
        browser_download_url: "https://example/v0.2.0/tables",
      },
    ],
  },
];

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Stub fetch to return a fixed JSON body for any request. */
function mockFetchJson(responseJson: unknown): typeof globalThis.fetch {
  return mock(async (): Promise<Response> => {
    return new Response(JSON.stringify(responseJson), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
}

/** Stub fetch to throw (simulates network failure). */
function mockFetchThrow(err: unknown): typeof globalThis.fetch {
  return mock(async (): Promise<Response> => {
    throw err;
  }) as unknown as typeof globalThis.fetch;
}

const SPEC = {
  owner: "3aKHP",
  repo: "EndFieldGameData",
  assetName: "endfield-tables.zip",
  localZip: "/tmp/unused.zip",
};

describe("checkLatestRelease multi-asset matching", () => {
  it("returns the Release carrying the asset, NOT the newest one", async () => {
    // This is the exact regression: /releases/latest would have returned
    // v0.4.0 (worldview), but tables.zip lives in v0.2.0.
    globalThis.fetch = mockFetchJson(MULTI_ASSET_RELEASES);
    const result = await checkLatestRelease(SPEC);
    expect(result).toEqual({
      tag: "v0.2.0",
      url: "https://example/v0.2.0/tables",
    });
  });

  it("finds each dataset's own Release", async () => {
    globalThis.fetch = mockFetchJson(MULTI_ASSET_RELEASES);

    const story = await checkLatestRelease({ ...SPEC, assetName: "endfield-story-CN.zip" });
    expect(story?.tag).toBe("v0.3.0");

    const worldview = await checkLatestRelease({ ...SPEC, assetName: "endfield-worldview.zip" });
    expect(worldview?.tag).toBe("v0.4.0");
  });

  it("returns null when no Release carries the asset (API reachable)", async () => {
    globalThis.fetch = mockFetchJson(MULTI_ASSET_RELEASES);
    const result = await checkLatestRelease({
      ...SPEC,
      assetName: "endfield-nonexistent.zip",
    });
    // null — NOT a throw — so syncRelease knows the API confirmed absence
    // (it must NOT fall back to a blind /releases/latest/download URL).
    expect(result).toBeNull();
  });

  it("throws on network failure (distinct from asset-not-found)", async () => {
    globalThis.fetch = mockFetchThrow(new Error("ENOTFOUND"));
    await expect(checkLatestRelease(SPEC)).rejects.toThrow("ENOTFOUND");
  });

  it("throws on HTTP error response", async () => {
    globalThis.fetch = mock(async (): Promise<Response> => {
      return new Response("rate limited", { status: 403 });
    }) as unknown as typeof globalThis.fetch;
    // fetchCascading treats direct 4xx as terminal → throws HTTP 403.
    await expect(checkLatestRelease(SPEC)).rejects.toThrow();
  });
});
