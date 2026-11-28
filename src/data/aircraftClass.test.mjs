// src/data/aircraftClass.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRCRAFT_CATEGORIES,
  AIRCRAFT_CATEGORY_LABELS,
  AIRCRAFT_CLASS_LABELS,
  aircraftCategory,
  classifyAircraft,
  isGroundTransmitter,
} from './aircraftClass.js';

test('type-code classification (military layer path)', () => {
  assert.equal(classifyAircraft({ typeCode: 'F16' }), 'fastjet');
  assert.equal(classifyAircraft({ typeCode: 'EC35' }), 'helicopter');
  assert.equal(classifyAircraft({ typeCode: 'B744' }), 'quadjet');
  assert.equal(classifyAircraft({ typeCode: 'B77W' }), 'widebody');
  assert.equal(classifyAircraft({ typeCode: 'C17' }), 'widebody');
  assert.equal(classifyAircraft({ typeCode: 'AT76' }), 'turboprop');
  assert.equal(classifyAircraft({ typeCode: 'C172' }), 'light');
  assert.equal(classifyAircraft({ typeCode: 'b738' }), 'airliner'); // case-insensitive default-jet
});

test('bizjet + uav classes (2026-08-16 Hangar fleet)', () => {
  assert.equal(classifyAircraft({ typeCode: 'C25A' }), 'bizjet');
  assert.equal(classifyAircraft({ typeCode: 'C56X' }), 'bizjet');
  assert.equal(classifyAircraft({ typeCode: 'GLF5' }), 'bizjet');
  assert.equal(classifyAircraft({ typeCode: 'CL60' }), 'bizjet');
  // SF50 Cirrus Vision Jet is a JET — it must NOT fall back to the light/prop class.
  assert.equal(classifyAircraft({ typeCode: 'SF50' }), 'bizjet');
  assert.equal(classifyAircraft({ typeCode: 'MQ9' }), 'uav');
  assert.equal(classifyAircraft({ typeCode: 'Q4' }), 'uav');
  assert.equal(classifyAircraft({ typeCode: 'TB2' }), 'uav');
});

test('category fallback (flights layer path — OpenSky extended int)', () => {
  assert.equal(classifyAircraft({ category: 8 }), 'helicopter');
  assert.equal(classifyAircraft({ category: 6 }), 'widebody');
  assert.equal(classifyAircraft({ category: 7 }), 'fastjet');
  assert.equal(classifyAircraft({ category: 2 }), 'light');
  assert.equal(classifyAircraft({ category: 9 }), 'glider');
  assert.equal(classifyAircraft({ category: 4 }), 'airliner');
});

test('ADS-B emitter string categories', () => {
  assert.equal(classifyAircraft({ category: 'A7' }), 'helicopter');
  assert.equal(classifyAircraft({ category: 'A5' }), 'widebody');
  assert.equal(classifyAircraft({ category: 'A1' }), 'light');
  assert.equal(classifyAircraft({ category: 'B1' }), 'glider');
});

test('typeCode outranks category; unknown → unknown', () => {
  assert.equal(classifyAircraft({ typeCode: 'F18', category: 6 }), 'fastjet');
  assert.equal(classifyAircraft({}), 'unknown');
  assert.equal(classifyAircraft({ typeCode: null, category: 0 }), 'unknown');
  // A type in no set is unknown, whatever its category says.
  assert.equal(classifyAircraft({ typeCode: 'ZZZZ' }), 'unknown');
  assert.equal(
    classifyAircraft({ typeCode: 'ZZZZ', category: 'A1' }),
    'unknown',
  );
  assert.equal(classifyAircraft({ typeCode: 'ZZZZ', category: 4 }), 'unknown');
  assert.equal(AIRCRAFT_CLASS_LABELS.unknown, 'Aircraft');
});

test('narrow-body jets are airliners, regional jets their own class', () => {
  for (const typeCode of ['A20N', 'A321', 'B38M', 'B752', 'BCS3', 'MD88'])
    assert.equal(classifyAircraft({ typeCode }), 'airliner', typeCode);
  for (const typeCode of ['CRJ9', 'E75L', 'E190', 'E45X', 'E275', 'RJ85'])
    assert.equal(classifyAircraft({ typeCode }), 'regionaljet', typeCode);
  assert.equal(
    AIRCRAFT_CLASS_LABELS.regionaljet,
    AIRCRAFT_CLASS_LABELS.airliner,
  );
});

test('light, turboprop, business-jet and balloon types from a live sample', () => {
  const expected = {
    light: [
      'C402',
      'T210',
      'PA31',
      'P212',
      'T206',
      'PA30',
      'TB20',
      'DV20',
      'PA11',
      'PA22',
      'C140',
      'C77R',
      'BE55',
      'BE95',
      'M7',
      'ERCO',
      'RV12',
      'XL2',
      'WT9',
      'CH7A',
      'CH7B',
      'DHC1',
      'T34P',
      'LNP4',
      'PISI',
      'PIAT',
      'P06T',
      'P208',
      'P68',
      'BN2P',
    ],
    turboprop: ['F406', 'SC7', 'BE9L', 'BE10', 'C27J', 'C30J'],
    bizjet: ['E35L', 'EA50', 'C55B', 'GALX'],
    balloon: ['BALL'],
  };
  for (const [klass, codes] of Object.entries(expected))
    for (const typeCode of codes)
      assert.equal(classifyAircraft({ typeCode }), klass, typeCode);
});

test('lighter-than-air, ultralight and drone emitter categories', () => {
  assert.equal(classifyAircraft({ category: 'B2' }), 'balloon');
  assert.equal(classifyAircraft({ category: 10 }), 'balloon');
  assert.equal(classifyAircraft({ category: 'B4' }), 'light');
  assert.equal(classifyAircraft({ category: 12 }), 'light');
  assert.equal(classifyAircraft({ category: 'B6' }), 'uav');
  assert.equal(classifyAircraft({ category: 14 }), 'uav');
});

test('TWR and GND are ground stations, as GRND is', () => {
  for (const typeCode of ['GRND', 'TWR', 'GND', ' twr '])
    assert.equal(classifyAircraft({ typeCode }), 'station', typeCode);
});

test('ground and test transmitters are ground stations whatever their type', () => {
  for (const callsign of ['TXLU00', 'TXLU13', ' txlu7 '])
    for (const typeCode of [null, 'ZVEH', 'A320']) {
      assert.equal(isGroundTransmitter({ callsign }), true, callsign);
      assert.equal(
        classifyAircraft({ typeCode, callsign }),
        'station',
        `${callsign} ${typeCode}`,
      );
    }
  // A test callsign on the ground; the same callsign flying is an aircraft.
  for (const callsign of ['ADSTEST', 'TEST', 'TEST1', 'ADSTEST12']) {
    assert.equal(
      classifyAircraft({ typeCode: 'ZVEH', callsign, onGround: true }),
      'testtransmitter',
      callsign,
    );
    assert.equal(
      classifyAircraft({ typeCode: 'A320', callsign, onGround: false }),
      'airliner',
      callsign,
    );
  }
  // A feed's ground transmitter (readsb C0 adsb_icao_nt on the ground).
  assert.equal(classifyAircraft({ transmitter: true }), 'station');
  assert.equal(
    classifyAircraft({ typeCode: 'ZVEH', transmitter: true }),
    'station',
  );
  // Look-alikes are not transmitters.
  for (const callsign of ['TXLU', 'TXLUX1', 'TESTA', 'ATEST', 'DLH400'])
    assert.equal(
      isGroundTransmitter({ callsign, onGround: true }),
      false,
      callsign,
    );
});

test('every class falls in one of the seven categories', () => {
  assert.deepEqual(AIRCRAFT_CATEGORIES, [
    'airliners',
    'regional',
    'bizjets',
    'light',
    'helicopters',
    'ground',
    'other',
  ]);
  const expected = {
    airliner: 'airliners',
    widebody: 'airliners',
    quadjet: 'airliners',
    turboprop: 'regional',
    regionaljet: 'regional',
    bizjet: 'bizjets',
    light: 'light',
    helicopter: 'helicopters',
    vehicle: 'ground',
    station: 'ground',
    testtransmitter: 'ground',
    glider: 'other',
    balloon: 'other',
    fastjet: 'other',
    uav: 'other',
    unknown: 'other',
  };
  assert.deepEqual(
    Object.keys(AIRCRAFT_CLASS_LABELS).sort(),
    Object.keys(expected).sort(),
  );
  for (const [klass, category] of Object.entries(expected))
    assert.equal(aircraftCategory(klass), category, klass);
  assert.equal(aircraftCategory(undefined), 'other');
  assert.equal(aircraftCategory('constructor'), 'other');
  for (const category of AIRCRAFT_CATEGORIES)
    assert.ok(AIRCRAFT_CATEGORY_LABELS[category], category);
  // Each category from the classifier end to end.
  const samples = {
    airliners: { typeCode: 'A320' },
    regional: { typeCode: 'AT76' },
    bizjets: { typeCode: 'C56X' },
    light: { typeCode: 'C172' },
    helicopters: { typeCode: 'EC35' },
    ground: { typeCode: 'ZVEH' },
    other: { typeCode: 'F16' },
  };
  for (const [category, record] of Object.entries(samples))
    assert.equal(
      aircraftCategory(classifyAircraft(record)),
      category,
      category,
    );
  assert.equal(aircraftCategory(classifyAircraft({})), 'other');
});

test('every class has a label', () => {
  for (const kind of [
    'light',
    'glider',
    'turboprop',
    'airliner',
    'regionaljet',
    'widebody',
    'quadjet',
    'helicopter',
    'fastjet',
    'bizjet',
    'uav',
    'balloon',
    'vehicle',
    'station',
    'testtransmitter',
    'unknown',
  ]) {
    assert.ok(AIRCRAFT_CLASS_LABELS[kind], kind);
  }
});

test('airport vehicles and ground stations class apart from aircraft', () => {
  // A feed's own types, in any case.
  assert.equal(classifyAircraft({ typeCode: 'ZVEH' }), 'vehicle');
  assert.equal(classifyAircraft({ typeCode: ' zveh ' }), 'vehicle');
  assert.equal(classifyAircraft({ typeCode: 'GRND' }), 'station');
  // Emitter categories: surface vehicles, then obstacles.
  assert.equal(classifyAircraft({ category: 'C1' }), 'vehicle');
  assert.equal(classifyAircraft({ category: 'C2' }), 'vehicle');
  for (const category of ['C3', 'C4', 'C5'])
    assert.equal(classifyAircraft({ category }), 'station', category);
  // OpenSky's integer categories for the same.
  assert.equal(classifyAircraft({ category: 16 }), 'vehicle');
  assert.equal(classifyAircraft({ category: 17 }), 'vehicle');
  assert.equal(classifyAircraft({ category: 18 }), 'station');
  // A type code still outranks the category.
  assert.equal(
    classifyAircraft({ typeCode: 'ZVEH', category: 'A3' }),
    'vehicle',
  );
  assert.equal(
    classifyAircraft({ typeCode: 'A320', category: 'C1' }),
    'airliner',
  );
});

test('helicopter types and categories', () => {
  for (const typeCode of ['EC35', 'R44', 'S76', 'H60', 'AS50', 'B407'])
    assert.equal(classifyAircraft({ typeCode }), 'helicopter', typeCode);
  assert.equal(classifyAircraft({ category: 'A7' }), 'helicopter');
  assert.equal(classifyAircraft({ category: 8 }), 'helicopter');
});
