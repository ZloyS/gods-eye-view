import test from 'node:test';
import assert from 'node:assert/strict';
import { setLocale, translateKnown } from '../i18n/index.js';
import { classifyAircraft } from './aircraftClass.js';
import {
  AWARENESS_RELATIONSHIP,
  aircraftClassMatches,
  findByDoublingRadius,
  getAwarenessNavigationTargets,
  formatAwarenessDistance,
  formatAwarenessLabel,
  summarizeAwarenessCohort,
} from './militaryAwarenessEngine.js';

test('awareness formatters preserve valid zeroes and replace missing or invalid values', () => {
  assert.equal(formatAwarenessDistance(0), '0 m');
  assert.equal(formatAwarenessDistance(950), '950 m');
  assert.equal(formatAwarenessDistance(Number.NaN), '—');
  assert.equal(formatAwarenessDistance(-1), '—');
  assert.equal(formatAwarenessLabel(' UAL649 '), 'UAL649');
  assert.equal(formatAwarenessLabel(0), '0');
  assert.equal(formatAwarenessLabel({ callsign: ' UAL649 ', id: 'fallback' }), 'UAL649');
  assert.equal(formatAwarenessLabel({ name: '', label: 'Mapped site' }), 'Mapped site');
  assert.equal(formatAwarenessLabel({ id: 0 }), '0');
  assert.equal(formatAwarenessLabel(''), '—');
  assert.equal(formatAwarenessLabel({}), '—');
  assert.equal(formatAwarenessLabel(undefined), '—');
});

test('a contact marker moves a distance that rounds to 1,000 m into kilometres', () => {
  assert.equal(formatAwarenessDistance(999.4), '999 m');
  assert.equal(formatAwarenessDistance(999.6), '1.0 km');
  assert.equal(formatAwarenessDistance(4600), '4.6 km');
  assert.equal(formatAwarenessDistance(9949), '9.9 km');
  assert.equal(formatAwarenessDistance(9950), '10 km');
  assert.equal(formatAwarenessDistance(9960), '10 km');
});

test('awareness cohorts sort nearest-first and do not turn empty data into out of range', () => {
  const result = summarizeAwarenessCohort([{ id: 'far', distance: 9000 }, { id: 'near', distanceM: 1000 }]);
  assert.equal(result.relationship, 'NEARBY');
  assert.deepEqual(result.nearest.map((item) => item.id), ['near', 'far']);
  assert.equal(summarizeAwarenessCohort([]).relationship, 'UNKNOWN');
});

test('awareness cohorts reject negative and non-finite distances as unavailable data', () => {
  const result = summarizeAwarenessCohort([
    { id: 'negative', distanceM: -1 },
    { id: 'nan', distanceM: Number.NaN },
    { id: 'valid-zero', distanceM: 0 },
  ]);
  assert.equal(result.relationship, 'NEARBY');
  assert.deepEqual(result.nearest.map((item) => item.id), ['valid-zero']);
});

test('unavailable and stale feeds remain unknown', () => {
  assert.equal(AWARENESS_RELATIONSHIP.OUTSIDE_RANGE, 'OUTSIDE_RANGE');
  assert.equal(summarizeAwarenessCohort([], { available: false }).reason, 'feed unavailable');
  assert.equal(summarizeAwarenessCohort([], { stale: true }).reason, 'feed stale');
});

test('cohort reasons stay English in data and translate where the panel shows them', (t) => {
  t.after(() => setLocale('en'));
  setLocale('ru');
  const reasons = [
    summarizeAwarenessCohort([], { available: false }).reason,
    summarizeAwarenessCohort([], { stale: true }).reason,
    summarizeAwarenessCohort([{ id: 'near', distanceM: 10 }]).reason,
    summarizeAwarenessCohort([]).reason,
  ];
  assert.deepEqual(reasons, [
    'feed unavailable',
    'feed stale',
    'observed or mapped nearby context',
    'no observed or mapped objects in current feeds',
  ]);
  // The awareness panel shows a reason through translateKnown().
  for (const reason of reasons) assert.notEqual(translateKnown(reason), reason);
});

test('navigation prioritizes nearby targets from the selected cohort', () => {
  const cohorts = [
    { id: 'flights', summary: { nearest: [{ icao24: 'a1', distanceM: 1000 }, { icao24: 'a2', distanceM: 2000 }] } },
    { id: 'military', summary: { nearest: [{ icao24: 'm1', distanceM: 500 }] } },
  ];
  const targets = getAwarenessNavigationTargets(cohorts, { layerId: 'flights', id: 'subject' }, ['flights:a1']);
  // Cohort affinity still wins among UNVISITED targets: a2 leads at 2000 m even
  // though military m1 sits at 500 m.
  //
  // Visited state now outranks that affinity, which is the corrected half of
  // this ordering. Ranking the subject's own layer first unconditionally put
  // the already-visited a1 ahead of the unvisited m1, so NEXT cycled inside the
  // subject's layer and never reached military, vessels, or installations.
  assert.deepEqual(targets.map((target) => `${target.layerId}:${target.id}`), ['flights:a2', 'military:m1', 'flights:a1']);
});

test('awareness cycling excludes satellites, which retain independent tracking', () => {
  const cohorts = [
    { id: 'satellites', summary: { nearest: [{ id: 'iss', distanceM: 100 }] } },
    { id: 'ais-live-vessels', summary: { nearest: [{ mmsi: 'v1', distanceM: 1000 }] } },
  ];
  const targets = getAwarenessNavigationTargets(cohorts);
  assert.deepEqual(targets.map((target) => `${target.layerId}:${target.id}`), ['ais-live-vessels:v1']);
});

test('empty proximity searches double their radius until an aircraft is found', () => {
  const searched = [];
  const result = findByDoublingRadius((radiusM) => {
    searched.push(radiusM);
    return radiusM >= 1000000 ? { id: 'closest-flight' } : null;
  });
  assert.deepEqual(searched, [250000, 500000, 1000000]);
  assert.deepEqual(result, {
    candidate: { id: 'closest-flight' },
    radiusM: 1000000,
  });
});

test('expanding proximity search stops at its global bound when feeds are empty', () => {
  const searched = [];
  const result = findByDoublingRadius((radiusM) => {
    searched.push(radiusM);
    return null;
  }, { initialRadiusM: 250000, maxRadiusM: 1000000 });
  assert.equal(result, null);
  assert.deepEqual(searched, [250000, 500000, 1000000]);
});

/** A nearby row as `getNearby` reports it: the class the contact draws as. */
const nearbyRow = (icao24, record) => ({
  icao24,
  aircraftClass: classifyAircraft(record),
});

test('a category word matches every class in that Flights category', () => {
  const crj = nearbyRow('crj900', { typeCode: 'CRJ9' });
  const dh8d = nearbyRow('dh8d', { typeCode: 'DH8D' });
  assert.equal(crj.aircraftClass, 'regionaljet');
  assert.equal(dh8d.aircraftClass, 'turboprop');
  for (const word of ['regional', 'Regionals']) {
    assert.equal(aircraftClassMatches(crj, word), true, word);
    assert.equal(aircraftClassMatches(dh8d, word), true, word);
  }

  const test = nearbyRow('test', { callsign: 'TEST1234', onGround: true });
  const grnd = nearbyRow('grnd', { typeCode: 'GRND' });
  const zveh = nearbyRow('zveh', { typeCode: 'ZVEH' });
  assert.equal(test.aircraftClass, 'testtransmitter');
  assert.equal(grnd.aircraftClass, 'station');
  assert.equal(zveh.aircraftClass, 'vehicle');
  for (const item of [test, grnd, zveh]) {
    assert.equal(aircraftClassMatches(item, 'ground'), true, item.icao24);
  }

  const fastjet = { aircraftClass: 'fastjet' };
  assert.equal(aircraftClassMatches(fastjet, 'other'), true);
  assert.equal(aircraftClassMatches(nearbyRow('untyped', {}), 'other'), true);
  assert.equal(aircraftClassMatches(nearbyRow('c56x', { typeCode: 'C56X' }), 'business jet'), true);
  assert.equal(aircraftClassMatches(nearbyRow('c56x', { typeCode: 'C56X' }), 'bizjet'), true);
});

test('a word with no Latin letters is still a filter', () => {
  const airliner = { aircraftClass: 'airliner', type: 'A320' };
  const helicopter = { aircraftClass: 'helicopter', typeName: 'вертолёт' };
  for (const word of ['вертолёт', '直升机', '—']) {
    assert.equal(aircraftClassMatches(airliner, word), false, word);
  }
  assert.equal(aircraftClassMatches(helicopter, 'вертолёт'), true);
  assert.equal(aircraftClassMatches(airliner, '  '), true);
});

test('"ground station" names the station class', () => {
  const grnd = nearbyRow('grnd', { typeCode: 'GRND' });
  const zveh = nearbyRow('zveh', { typeCode: 'ZVEH' });
  for (const word of ['ground station', 'Ground stations']) {
    assert.equal(aircraftClassMatches(grnd, word), true, word);
    assert.equal(aircraftClassMatches(zveh, word), false, word);
  }
});

test('a word that names a class and a category matches only that class', () => {
  const crj = nearbyRow('crj900', { typeCode: 'CRJ9' });
  const dh8d = nearbyRow('dh8d', { typeCode: 'DH8D' });
  for (const word of ['turboprop', 'turboprops', 'Turboprops']) {
    assert.equal(aircraftClassMatches(dh8d, word), true, word);
    assert.equal(aircraftClassMatches(crj, word), false, word);
  }

  // "Airliner" is the card word of airliners and regional jets alike.
  const a320 = nearbyRow('a320', { typeCode: 'A320' });
  const b77w = nearbyRow('b77w', { typeCode: 'B77W' });
  const b744 = nearbyRow('b744', { typeCode: 'B744' });
  assert.equal(b744.aircraftClass, 'quadjet');
  for (const word of ['airliner', 'Airliners']) {
    assert.equal(aircraftClassMatches(a320, word), true, word);
    assert.equal(aircraftClassMatches(crj, word), true, word);
    assert.equal(aircraftClassMatches(b77w, word), false, word);
    assert.equal(aircraftClassMatches(b744, word), false, word);
  }

  const light = { aircraftClass: 'light' };
  const glider = nearbyRow('glider', { typeCode: 'GLID' });
  const balloon = nearbyRow('balloon', { typeCode: 'BALL' });
  for (const word of ['light', 'light aircraft', 'Light aircraft']) {
    assert.equal(aircraftClassMatches(light, word), true, word);
    assert.equal(aircraftClassMatches(glider, word), false, word);
    assert.equal(aircraftClassMatches(balloon, word), false, word);
  }

  const test = nearbyRow('test', { callsign: 'TEST1234', onGround: true });
  const grnd = nearbyRow('grnd', { typeCode: 'GRND' });
  const zveh = nearbyRow('zveh', { typeCode: 'ZVEH' });
  assert.equal(aircraftClassMatches(grnd, 'station'), true);
  assert.equal(aircraftClassMatches(test, 'station'), false);
  assert.equal(aircraftClassMatches(zveh, 'station'), false);
  assert.equal(aircraftClassMatches(zveh, 'vehicles'), true);
  assert.equal(aircraftClassMatches(grnd, 'vehicle'), false);
  assert.equal(aircraftClassMatches(test, 'vehicle'), false);

  assert.equal(aircraftClassMatches({ aircraftClass: 'helicopter' }, 'helicopters'), true);
  assert.equal(aircraftClassMatches({ aircraftClass: 'bizjet' }, 'Business jets'), true);
});

test('the Business chip label matches business jets only', () => {
  const bizjet = nearbyRow('c56x', { typeCode: 'C56X' });
  assert.equal(bizjet.aircraftClass, 'bizjet');
  for (const word of ['business', 'Business']) {
    assert.equal(aircraftClassMatches(bizjet, word), true, word);
    assert.equal(aircraftClassMatches(nearbyRow('a320', { typeCode: 'A320' }), word), false, word);
    assert.equal(aircraftClassMatches({ aircraftClass: 'light' }, word), false, word);
  }
});

test('untyped contacts match only the Other category and the unknown word', () => {
  const untyped = nearbyRow('untyped', {});
  assert.equal(untyped.aircraftClass, 'unknown');
  for (const word of ['other', 'unknown']) {
    assert.equal(aircraftClassMatches(untyped, word), true, word);
  }
  for (const word of ['airliner', 'regional', 'business jet', 'light', 'helicopter', 'station', 'aircraft']) {
    assert.equal(aircraftClassMatches(untyped, word), false, word);
  }
  for (const klass of ['fastjet', 'uav']) {
    assert.equal(aircraftClassMatches({ aircraftClass: klass }, 'unknown'), false, klass);
  }
  assert.equal(aircraftClassMatches({ icao24: 'none' }, 'other'), false);
});

test('an exact class word still matches only its class', () => {
  const b77w = nearbyRow('b77w', { typeCode: 'B77W' });
  assert.equal(b77w.aircraftClass, 'widebody');
  assert.equal(aircraftClassMatches(b77w, 'widebody'), true);
  for (const record of [{ typeCode: 'A320' }, { typeCode: 'CRJ9' }, { typeCode: 'B744' }, {}]) {
    assert.equal(aircraftClassMatches(nearbyRow('x', record), 'widebody'), false, record.typeCode);
  }
  assert.equal(aircraftClassMatches({ aircraftClass: 'fastjet' }, 'fast jet'), true);
  assert.equal(aircraftClassMatches({ aircraftClass: 'uav' }, 'drone'), true);
  assert.equal(aircraftClassMatches({ aircraftClass: 'glider' }, 'glider'), true);
  assert.equal(aircraftClassMatches({ aircraftClass: 'light' }, 'glider'), false);
  assert.equal(aircraftClassMatches({ aircraftClass: 'tr3b' }, 'tr3b'), true);
  assert.equal(aircraftClassMatches({ aircraftClass: 'airliner' }, null), true);
});

test('a class card word does not match another category', () => {
  assert.equal(aircraftClassMatches(nearbyRow('a320', { typeCode: 'A320' }), 'light aircraft'), false);
});

test('a plural class word matches its class', () => {
  for (const [klass, word] of [
    ['uav', 'drones'],
    ['glider', 'gliders'],
    ['widebody', 'widebodies'],
    ['fastjet', 'fast jets'],
    ['balloon', 'balloons'],
  ]) {
    assert.equal(aircraftClassMatches({ aircraftClass: klass }, word), true, word);
  }
  assert.equal(aircraftClassMatches({ aircraftClass: 'airliner' }, 'widebodies'), false);
  assert.equal(aircraftClassMatches({ aircraftClass: 'light' }, 'gliders'), false);
});
