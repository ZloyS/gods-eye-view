import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAircraft,
  aircraftCategory,
  AIRCRAFT_CLASS_LABELS,
} from './aircraftClass.js';

test('grounded test transmitter cards read as test transmitters, under Ground', () => {
  const station = AIRCRAFT_CLASS_LABELS[classifyAircraft({ typeCode: 'GRND' })];
  for (const callsign of ['ADSTEST', 'TEST', 'TEST1']) {
    const klass = classifyAircraft({ callsign, onGround: true });
    assert.equal(aircraftCategory(klass), 'ground', callsign);
    assert.notEqual(
      AIRCRAFT_CLASS_LABELS[klass],
      station,
      `${callsign} reads as an ordinary station`,
    );
    assert.match(String(AIRCRAFT_CLASS_LABELS[klass]), /test/i, callsign);
  }
});
