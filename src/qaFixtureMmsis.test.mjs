// The synthetic vessel fixtures of the QA harnesses use MMSIs whose category
// the map shows by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  vesselCategory,
  DEFAULT_VESSEL_CATEGORY_VISIBILITY,
} from './data/vesselTypes.js';

const read = (name) =>
  fs.readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

test('synthetic harbor visibility: QA fixture MMSIs are shown by default', () => {
  const cards = read('../scripts/qa-vessel-cards.mjs').match(
    /mmsiBase = portKey === 'rotterdam' \? (\d+) : (\d+)/,
  );
  const harbor = read('../scripts/qa-focus-evidence.mjs').match(
    /mmsi: String\((\d+) \+ i\)/,
  );
  for (const base of [cards[1], cards[2], harbor[1]]) {
    const category = vesselCategory({ mmsi: base, type: 'Cargo' });
    assert.equal(
      DEFAULT_VESSEL_CATEGORY_VISIBILITY[category],
      true,
      `${base} -> ${category}`,
    );
  }
});
