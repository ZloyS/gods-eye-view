import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyAircraft, aircraftCategory } from './aircraftClass.js';

const EXPECTED = {
  // In the fleet catalog (public/models/fleet/types.json) but in no class set.
  FA6X: 'bizjets',
  P46T: 'regional',
  P180: 'regional',
  BE30: 'regional',
  C170: 'light',
  C82R: 'light',
  C82T: 'light',
  C414: 'light',
  PA23: 'light',
  H269: 'helicopters',
  EC75: 'helicopters',
  // Common designators missing from both.
  H160: 'helicopters',
  AW09: 'helicopters',
  L410: 'regional',
  Y12: 'regional',
  AN24: 'regional',
  C295: 'regional',
  CN35: 'regional',
  PC6T: 'regional',
  DHC2: 'light',
  DHC3: 'light',
  IL76: 'airliners',
};

test('designators without emitter evidence land in their own category', () => {
  for (const [typeCode, category] of Object.entries(EXPECTED))
    assert.equal(
      aircraftCategory(classifyAircraft({ typeCode, category: 0 })),
      category,
      typeCode,
    );
  // A conflicting coarse emitter category does not override a known type.
  assert.equal(
    aircraftCategory(classifyAircraft({ typeCode: 'FA6X', category: 'A3' })),
    'bizjets',
  );
});

test('catalog designators: none falls through to unknown', () => {
  const d = JSON.parse(
    fs.readFileSync(
      new URL('../../public/models/fleet/types.json', import.meta.url),
      'utf8',
    ),
  );
  const unknown = Object.keys({ ...d.aircraft, ...d.helicopters }).filter(
    (typeCode) => classifyAircraft({ typeCode, category: 0 }) === 'unknown',
  );
  assert.deepEqual(unknown, []);
});
