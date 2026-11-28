// Ship types that mention a helicopter or an aircraft stay vessels; only the
// MMSI makes a SAR aircraft or a beacon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nonVesselKind, isVessel } from './vesselTypes.js';

test('ship descriptions containing device words stay vessels', () => {
  for (const type of [
    'Helicopter Support Vessel',
    'Helicopter Landing Vessel',
    'Aircraft Rescue Vessel',
  ]) {
    const record = { type, mmsi: '232001234' };
    assert.equal(nonVesselKind(record), null, type);
    assert.equal(isVessel(record), true, type);
  }
  // The MMSI prefixes still decide for real SAR aircraft and beacons.
  assert.equal(nonVesselKind({ mmsi: '111244100' }), 'aircraft');
  assert.equal(nonVesselKind({ mmsi: '974123456' }), 'beacon');
});
