// A detailed type that names a ship is not overruled by a broad platform or aid
// type.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nonVesselKind, isVessel, vesselCategory } from './vesselTypes.js';
import { normalizeVesselObservation } from '../sources/live/vessels.js';

test('detailed ship versus broad platform or aid', () => {
  const row = normalizeVesselObservation({
    lat: 1,
    lon: 1,
    mmsi: 366999715,
    type_specific: 'Platform Supply Vessel',
    type: 'Platform',
  });
  assert.equal(row.typeBroad, 'Platform');
  assert.equal(nonVesselKind(row), null);
  assert.equal(vesselCategory(row), 'service');
  const tender = {
    type: 'Buoy Tender',
    typeBroad: 'Navigation Aid',
    mmsi: '366999716',
  };
  assert.equal(isVessel(tender), true);
  assert.equal(vesselCategory(tender), 'service');
  // Controls: an unplaced detailed type still falls back to the broad label,
  // and a station MMSI still wins.
  assert.equal(
    nonVesselKind({ type: 'Unknown', typeBroad: 'Platform', mmsi: '366999717' }),
    'platform',
  );
  assert.equal(
    nonVesselKind({ type: 'Platform Supply Vessel', mmsi: '002442234' }),
    'station',
  );
});
