// A "Fixed Station" type is a station and an "OffShore Structure" a platform,
// not a ship.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nonVesselKind, isVessel, vesselCategory } from './vesselTypes.js';

test('fixed provider labels are stations, a platform supply vessel is not', () => {
  for (const [type, kind] of [
    ['Fixed Station', 'station'],
    ['OffShore Structure', 'platform'],
  ]) {
    const record = { type, mmsi: '366999710', destination: '' };
    assert.equal(nonVesselKind(record), kind, type);
    assert.equal(isVessel(record), false, type);
    assert.equal(vesselCategory(record), 'other', type);
  }
  const psv = { type: 'Platform Supply Vessel', mmsi: '366999711' };
  assert.equal(isVessel(psv), true);
  assert.equal(vesselCategory(psv), 'service');
});
