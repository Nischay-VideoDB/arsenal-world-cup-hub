import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the hero stat row becomes a compact two-column grid before desktop", async () => {
  const hero = await readSource("../components/Hero.tsx");

  assert.match(hero, /grid grid-cols-2 gap-x-6 gap-y-6 sm:flex sm:items-stretch sm:gap-7/);
  assert.equal((hero.match(/hidden sm:block/g) ?? []).length, 3);
  assert.match(hero, /flex min-w-0 flex-col/);
  assert.doesNotMatch(hero, /mt-9 flex items-stretch gap-7/);
});

test("the Oracle intro leads with prepared public behavior", async () => {
  const oracle = await readSource("../app/oracle/page.tsx");

  assert.match(oracle, /prepared deterministic projection/);
  assert.match(oracle, /operator-configured live mode, Kimi K2\.7-code/);
  assert.match(oracle, /PREPARED FALLBACK - deterministic projection/);
});
