import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdsbLolPointResponse } from './adsbLolFallback.js';
import {
  normalizeReadsbAircraft,
  openSkySnapshot,
} from '../sources/live/aircraft.js';
import { classifyAircraft, aircraftCategory } from './aircraftClass.js';

const NOW = 1_800_000_000;
const rows = ['C1', 'C2', 'C3', 'C4', 'C5'].map((category, i) => ({
  hex: `c0000${i + 1}`,
  flight: `OPS${i + 1}`,
  lat: 51.47,
  lon: -0.45 + i * 0.001,
  alt_baro: 'ground',
  gs: 3,
  seen_pos: 0,
  seen: 0,
  category,
}));

test('surface category parity: the adsb.lol fallback keeps C1-C5 for the Ground toggle', () => {
  const payload = normalizeAdsbLolPointResponse({ now: NOW * 1000, ac: rows });
  assert.deepEqual(
    payload.states.map((s) => s[17]),
    [16, 17, 18, 19, 20],
  );
  const { records } = openSkySnapshot(payload, { now: NOW * 1000 });
  for (const [i, row] of rows.entries()) {
    const direct = normalizeReadsbAircraft(row, NOW * 1000);
    const viaFallback = records.find((r) => r.id === row.hex);
    const a = classifyAircraft(direct);
    const b = classifyAircraft(viaFallback);
    assert.equal(b, a, `${row.category}: fallback ${b} vs direct ${a}`);
    assert.equal(aircraftCategory(b), 'ground', row.category);
  }
});
