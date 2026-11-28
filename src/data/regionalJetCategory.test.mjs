import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAircraft,
  aircraftCategory,
  AIRCRAFT_CLASS_LABELS,
} from './aircraftClass.js';

test('regional jet switches: CRJ and E-jets follow Regional, mainline jets follow Airliners', () => {
  for (const typeCode of [
    'CRJ2',
    'CRJ7',
    'CRJ9',
    'CRJX',
    'E135',
    'E145',
    'E170',
    'E75L',
    'E190',
    'RJ85',
  ]) {
    const klass = classifyAircraft({ typeCode, category: 0 });
    assert.equal(aircraftCategory(klass), 'regional', typeCode);
    assert.ok(AIRCRAFT_CLASS_LABELS[klass], typeCode);
  }
  assert.equal(
    aircraftCategory(classifyAircraft({ typeCode: 'AT76' })),
    'regional',
  );
  assert.equal(
    aircraftCategory(classifyAircraft({ typeCode: 'A320' })),
    'airliners',
  );
});
