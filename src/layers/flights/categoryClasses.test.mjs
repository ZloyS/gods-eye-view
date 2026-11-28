import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCategories } from './categories.js';
import { createFlightSnapshotRenderer } from './snapshotRenderer.js';
import { createMotion } from './motion.js';
import { createFlightState } from './state.js';
import { createEnrichment } from './enrichment.js';
import { aircraftModelSpec } from '../../data/fleetModels.js';
import { describeEntity } from '../../data/entityContext.js';
import {
  setTr3b,
  clearTr3bRegistry,
  tr3bAircraftClass,
} from '../../data/tr3bRegistry.js';
import { normalizeReadsbAircraft } from '../../sources/live/aircraft.js';
import { normalizeAdsbLolPointResponse } from '../../data/adsbLolFallback.js';

const FLEET_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../public/models/fleet',
);
const fleetSet = {
  catalog: JSON.parse(
    fs.readFileSync(path.join(FLEET_DIR, 'catalog.json'), 'utf8'),
  ),
  types: JSON.parse(
    fs.readFileSync(path.join(FLEET_DIR, 'types.json'), 'utf8'),
  ),
};

function stub(overrides = {}) {
  return new Proxy(overrides, {
    get: (target, key) => (key in target ? target[key] : () => undefined),
  });
}

function harness({ answers = {}, deferred = null } = {}) {
  const iconIds = new Set();
  const groundFloor = stub({
    cachedGroundFloor: () => null,
    floorAltitudeM: (altitude) => altitude,
  });
  const services = stub({
    geoid: { geoidHeight: () => 0 },
    camera: stub(),
    focus: stub(),
    groundFloor,
    meshFloor: stub(),
    groundSnap: stub({ createGroundSnap: () => stub() }),
    placement: null,
  });
  const lookups = [];
  const flightState = createFlightState({
    services,
    source: {
      label: 'Fixture aircraft',
      getEnrichment: async ({ id }) => {
        lookups.push(id);
        if (deferred) await deferred.promise;
        return answers[id];
      },
    },
  });
  flightState._viewer = {};
  flightState._panel = { invalidate: () => {} };
  flightState._icons = {
    show: true,
    has: (id) => iconIds.has(id),
    ids: () => [...iconIds],
    get count() {
      return iconIds.size;
    },
  };
  const parts = {
    rendering: stub({ _modelOwnsVisual: () => false }),
    icons: stub({
      _addIcon: (id) => iconIds.add(id),
      _forgetContact: (id) => {
        iconIds.delete(id);
        flightState.records.forget(id);
      },
    }),
    tracking: stub({ _militaryLayerSuppresses: () => false }),
  };
  parts.motion = createMotion({ flightState, services, parts, layer: {} });
  parts.categories = createCategories({
    flightState,
    services: { aircraftPresentation: { tr3bAircraftClass } },
    parts,
    layer: { update: () => Promise.resolve() },
  });
  parts.enrichment = createEnrichment({
    flightState,
    services: {
      militaryRegistry: { isMilitaryIcao: () => false },
      aircraftPresentation: { isTr3b: () => false },
    },
    parts,
  });
  const apply = createFlightSnapshotRenderer({
    flightState,
    records: flightState.records,
    militaryRegistry: stub({ isMilitaryIcao: () => false }),
    groundFloor,
    rendering: parts.rendering,
    tracking: parts.tracking,
    motion: parts.motion,
    icons: parts.icons,
    enrichment: stub(),
    queries: stub({ _likelyLanded: () => false }),
    categories: parts.categories,
  });
  let t = Date.now() - 60_000;
  const contact = (id, fields) => ({
    id,
    reference: id,
    longitude: -115,
    latitude: 36,
    callsign: `C${id}`,
    baroAltitudeM: 9_000,
    onGround: false,
    speedMps: 220,
    courseDeg: 90,
    positionTimeMs: (t += 5_000),
    ...fields,
  });
  return {
    flightState,
    iconIds,
    lookups,
    parts,
    apply(rows) {
      return apply(
        {
          observedAtMs: Date.now(),
          complete: true,
          records: rows.map(([id, fields]) => contact(id, fields)),
        },
        null,
      );
    },
  };
}

const settle = () => new Promise((done) => setTimeout(done, 450));

test('a lookup answered while hidden is not lost', async () => {
  let release;
  const deferred = { promise: new Promise((r) => (release = r)) };
  const h = harness({
    answers: { a0f1bc: { found: true, typeCode: 'C172' } },
    deferred,
  });
  h.apply([['a0f1bc', { callsign: 'N123AC', category: 0 }]]);
  h.parts.enrichment._requestTypeEnrichment('a0f1bc');
  await new Promise((d) => setTimeout(d, 50));
  h.parts.categories.setCategories({ other: false });
  release();
  await settle();
  h.parts.categories.setCategories({ other: true });
  h.apply([['a0f1bc', { callsign: 'N123AC', category: 0 }]]);
  h.parts.enrichment._requestTypeEnrichment('a0f1bc', true);
  await settle();
  h.apply([['a0f1bc', { callsign: 'N123AC', category: 0 }]]);
  assert.equal(h.flightState.records.data.get('a0f1bc')?.klass, 'light');
  h.flightState.lifetime.abort();
});

test('the card preview of a ground transmitter is the mast', () => {
  const card = describeEntity(null, {
    layerId: 'flights',
    id: '342351',
    record: {
      id: '342351',
      icao24: '342351',
      callsign: 'TXLU03',
      typeCode: 'ZVEH',
      category: null,
      aircraftClass: 'station',
      transmitter: true,
      onGround: true,
      lat: 40.47,
      lon: -3.56,
    },
  });
  assert.ok(card?.aircraftModel, 'the card has a model descriptor');
  assert.equal(
    aircraftModelSpec(fleetSet, card.aircraftModel).model,
    'radio_mast',
  );
});

test('a feed TWR stays a station across a conflicting lookup', async () => {
  for (const [feed, answer] of [
    ['TWR', 'ZVEH'],
    ['GND', 'ZVEH'],
    ['TWR', 'A320'],
  ]) {
    const h = harness({
      answers: { abc123: { found: true, typeCode: answer } },
    });
    const row = {
      typeCode: feed,
      callsign: 'RX1',
      onGround: true,
      speedMps: 0,
      baroAltitudeM: null,
    };
    h.apply([['abc123', row]]);
    assert.equal(h.flightState.records.data.get('abc123').klass, 'station');
    h.parts.enrichment._requestTypeEnrichment('abc123', true);
    await settle();
    assert.equal(
      h.flightState.records.data.get('abc123').klass,
      'station',
      `${feed}/${answer} after lookup`,
    );
    h.apply([['abc123', row]]);
    assert.equal(
      h.flightState.records.data.get('abc123').klass,
      'station',
      `${feed}/${answer} next poll`,
    );
    h.flightState.lifetime.abort();
  }
});

test('a hidden contact stays hidden through a callsign or category dropout', () => {
  const h = harness();
  h.apply([
    [
      'f10002',
      { callsign: 'TXLU03', onGround: true, speedMps: 0, baroAltitudeM: null },
    ],
    ['e10001', { callsign: 'HELI1', category: 8 }],
  ]);
  h.parts.categories.setCategories({ ground: false, helicopters: false });
  h.apply([
    [
      'f10002',
      { callsign: '', onGround: true, speedMps: 0, baroAltitudeM: null },
    ],
    ['e10001', { callsign: '', category: null }],
  ]);
  assert.equal(h.iconIds.has('f10002'), false, 'the station stays hidden');
  assert.equal(h.iconIds.has('e10001'), false, 'the helicopter stays hidden');
});

test('a TR-3B follows the category its card names', () => {
  clearTr3bRegistry();
  setTr3b('a10001', true);
  try {
    const h = harness();
    h.parts.categories.setCategories({ airliners: false });
    h.apply([['a10001', { typeCode: 'B738' }]]);
    assert.equal(
      h.iconIds.has('a10001'),
      true,
      'hiding Airliners leaves the TR-3B',
    );
    const o = harness();
    o.parts.categories.setCategories({ other: false });
    o.apply([['a10001', { typeCode: 'B738' }]]);
    assert.equal(
      o.iconIds.has('a10001'),
      false,
      'hiding Other removes the TR-3B',
    );
  } finally {
    clearTr3bRegistry();
  }
});

test('a moving C0 non-transponder is no fixed station', () => {
  const row = (fields) => ({
    hex: 'a12345',
    flight: 'OPS1',
    t: 'ZVEH',
    category: 'C0',
    type: 'adsb_icao_nt',
    alt_baro: 'ground',
    lat: 39,
    lon: -77,
    gs: 12,
    track: 90,
    seen: 0.5,
    seen_pos: 0.5,
    ...fields,
  });
  assert.notEqual(
    normalizeReadsbAircraft(row(), 1700000000000).transmitter,
    true,
  );
  assert.equal(
    normalizeReadsbAircraft(row({ hex: 'a12346', gs: 0 }), 1700000000000)
      .transmitter,
    true,
  );
  const fb = normalizeAdsbLolPointResponse({
    now: 1700000000000,
    ac: [row(), row({ hex: 'a12346', gs: 0 })],
  });
  assert.deepEqual(fb.transmitterByIcao, ['a12346']);
});
