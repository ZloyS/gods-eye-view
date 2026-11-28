import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAircraft,
  aircraftCategory,
  AIRCRAFT_CLASS_LABELS,
} from './aircraftClass.js';

test('explicit unknown versus missing type: an unlisted designator is never an Airliner', () => {
  for (const category of [3, 4, 5, 'A3', 'A4']) {
    const klass = classifyAircraft({ typeCode: 'ZZZZ', category });
    assert.equal(aircraftCategory(klass), 'other', `ZZZZ/${category}`);
    assert.equal(AIRCRAFT_CLASS_LABELS[klass], AIRCRAFT_CLASS_LABELS.unknown);
  }
  assert.equal(classifyAircraft({ typeCode: 'A320', category: 4 }), 'airliner');
});
