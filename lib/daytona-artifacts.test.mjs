import assert from "node:assert/strict";
import test from "node:test";

import { chartPngs } from "./daytona-artifacts.ts";

test("chartPngs returns no charts when the artifact field is absent or not an array", () => {
  assert.deepEqual(chartPngs({}), []);
  assert.deepEqual(chartPngs({ charts: { png: "unexpected" } }), []);
});

test("chartPngs retains only string PNG payloads", () => {
  assert.deepEqual(chartPngs({ charts: [{ png: "first" }, { png: 42 }, null] }), ["first"]);
});
