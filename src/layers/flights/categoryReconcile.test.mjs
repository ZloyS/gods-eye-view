// Category toggles: what hiding and showing keep, count and draw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCategories } from './categories.js';
import { createFlightSnapshotRenderer } from './snapshotRenderer.js';
import { createMotion } from './motion.js';
import { createFlightState } from './state.js';
import { createEnrichment } from './enrichment.js';
import { createClockFollow } from './clockFollow.js';
import { createIngestion } from './ingestion.js';

function stub(overrides = {}) {
  return new Proxy(overrides, {
    get: (target, key) => (key in target ? target[key] : () => undefined),
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

const settle = () => new Promise((done) => setTimeout(done, 20));

/** categories.test.mjs's harness, plus a real enrichment over a fixture source. */
function harness({ getEnrichment = async () => null } = {}) {
  const iconIds = new Set();
  const updates = [];
  let invalidations = 0;
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
  const flightState = createFlightState({
    services,
    source: { label: 'Fixture aircraft', getEnrichment },
  });
  flightState._viewer = {};
  flightState._panel = { invalidate: () => (invalidations += 1) };
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
  const layer = {
    update: (viewer) => {
      updates.push(viewer);
      return Promise.resolve();
    },
  };
  parts.categories = createCategories({ flightState, parts, layer });
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
  let fixMs = Date.now() - 5_000;
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
    positionTimeMs: fixMs,
    ...fields,
  });
  return {
    flightState,
    parts,
    iconIds,
    updates,
    categories: parts.categories,
    enrichment: parts.enrichment,
    invalidations: () => invalidations,
    apply(rows) {
      fixMs += 10_000;
      const accepted = apply(
        {
          observedAtMs: Date.now(),
          complete: true,
          records: rows.map(([id, fields]) => contact(id, fields)),
        },
        null,
      );
      // What ingestion does with the result.
      flightState.feed._count = accepted.count;
      return accepted;
    },
  };
}

test('hidden evidence: a hidden helicopter stays hidden across a category dropout', () => {
  const h = harness();
  h.apply([['e20001', { category: 8 }]]);
  assert.equal(h.flightState.records.data.get('e20001').klass, 'helicopter');
  h.categories.setCategories({ helicopters: false });
  assert.equal(h.iconIds.has('e20001'), false);
  h.apply([['e20001', {}]]);
  assert.equal(
    h.iconIds.has('e20001'),
    false,
    'the hidden helicopter reappears under Other when one poll omits its category',
  );
});

test('hidden evidence: a hidden TXLU station stays hidden across a callsign dropout', () => {
  const h = harness();
  const row = { onGround: true, speedMps: 0, baroAltitudeM: null };
  h.apply([['f20002', { ...row, callsign: 'TXLU03' }]]);
  assert.equal(h.flightState.records.data.get('f20002').klass, 'station');
  h.categories.setCategories({ ground: false });
  h.apply([['f20002', { ...row, callsign: '' }]]);
  assert.equal(
    h.iconIds.has('f20002'),
    false,
    'the hidden station reappears under Other when one poll omits its callsign',
  );
});

test('late lookup: an answer that lands while the contact is hidden is not lost', async () => {
  const pending = deferred();
  let calls = 0;
  const h = harness({
    getEnrichment: () => {
      calls += 1;
      return pending.promise;
    },
  });
  h.apply([['0b0001', { callsign: '' }]]);
  assert.equal(h.flightState.records.data.get('0b0001').klass, 'unknown');
  h.enrichment._requestTypeEnrichment('0b0001', true);
  await settle();
  assert.equal(calls, 1, 'the lookup was dispatched');
  h.categories.setCategories({ other: false });
  assert.equal(h.iconIds.has('0b0001'), false);
  pending.resolve({ found: true, typeCode: 'C172' });
  await settle();
  h.categories.setCategories({ other: true });
  h.apply([['0b0001', { callsign: '' }]]);
  h.enrichment._requestTypeEnrichment('0b0001', true);
  await settle();
  const klass = h.flightState.records.data.get('0b0001')?.klass;
  h.flightState.lifetime.abort();
  assert.ok(
    klass === 'light' || calls === 2,
    `answer lost and no retry: klass=${klass}, calls=${calls}`,
  );
});

test('enrichment counts: a lookup that hides a contact updates the total and tallies', async () => {
  const h = harness({
    getEnrichment: async () => ({ found: true, typeCode: 'C172' }),
  });
  h.categories.setCategories({ light: false });
  h.apply([['0c0001', { callsign: '' }]]);
  assert.equal(h.iconIds.has('0c0001'), true);
  assert.equal(h.flightState.feed._count, 1);
  assert.equal(h.flightState._categoryCounts.get('other'), 1);
  h.enrichment._requestTypeEnrichment('0c0001', true);
  await settle();
  h.flightState.lifetime.abort();
  assert.equal(h.iconIds.has('0c0001'), false, 'the icon goes');
  assert.deepEqual(
    {
      count: h.flightState.feed._count,
      other: h.flightState._categoryCounts.get('other') ?? 0,
    },
    { count: 0, other: 0 },
    'the total and the Other tally still count the removed contact',
  );
});

test('seek clear: clearing the layer clears the chip counts', () => {
  const h = harness();
  h.apply([
    ['d30001', { typeCode: 'C172' }],
    ['d30002', { typeCode: 'C172' }],
    ['a30001', { typeCode: 'A320' }],
  ]);
  assert.equal(h.flightState._categoryCounts.get('light'), 2);
  const clockFollow = createClockFollow({
    flightState: h.flightState,
    services: { placement: null },
    parts: {
      ...h.parts,
      tracking: stub(),
    },
  });
  clockFollow.clear();
  assert.equal(h.iconIds.size, 0);
  assert.equal(h.flightState.feed._count, 0);
  const counted = h.categories
    .rowControls()
    .chips.filter((chip) => chip.count > 0)
    .map((chip) => `${chip.id}:${chip.count}`);
  assert.deepEqual(counted, [], 'chips keep the counts of the cleared map');
});

test('station handover: a C0 transmitter stays a station on a vector that cannot carry the flag', () => {
  const h = harness();
  const row = {
    callsign: '',
    onGround: true,
    speedMps: 0,
    baroAltitudeM: null,
  };
  h.apply([['3c0001', { ...row, typeCode: 'ZVEH', transmitter: true }]]);
  assert.equal(h.flightState.records.data.get('3c0001').klass, 'station');
  h.apply([['3c0001', { ...row }]]);
  const meta = h.flightState.records.data.get('3c0001');
  assert.deepEqual(
    { klass: meta.klass, transmitter: meta.transmitter },
    { klass: 'station', transmitter: true },
  );
});

test('feed station: a TWR row keeps its station class across a ZVEH lookup', async () => {
  const h = harness({
    getEnrichment: async () => ({ found: true, typeCode: 'ZVEH' }),
  });
  const row = {
    typeCode: 'TWR',
    callsign: 'RX1',
    onGround: true,
    speedMps: 0,
    baroAltitudeM: null,
  };
  h.apply([['3c0002', row]]);
  assert.equal(h.flightState.records.data.get('3c0002').klass, 'station');
  h.enrichment._requestTypeEnrichment('3c0002', true);
  await settle();
  h.flightState.lifetime.abort();
  const afterLookup = h.flightState.records.data.get('3c0002').klass;
  h.apply([['3c0002', row]]);
  const afterPoll = h.flightState.records.data.get('3c0002').klass;
  assert.deepEqual(
    { afterLookup, afterPoll },
    {
      afterLookup: 'station',
      afterPoll: 'station',
    },
  );
});

test('lookup station: a lookup-only TWR stands on the ground', async () => {
  const h = harness({
    getEnrichment: async () => ({ found: true, typeCode: 'TWR' }),
  });
  const row = {
    callsign: 'RX1',
    onGround: false,
    baroAltitudeM: 300,
    speedMps: 0,
  };
  h.apply([['3c0003', row]]);
  h.enrichment._requestTypeEnrichment('3c0003', true);
  await settle();
  h.flightState.lifetime.abort();
  assert.equal(h.flightState.records.data.get('3c0003').klass, 'station');
  h.apply([['3c0003', row]]);
  const meta = h.flightState.records.data.get('3c0003');
  assert.deepEqual(
    { klass: meta.klass, onGround: meta.onGround },
    { klass: 'station', onGround: true },
    `the mast stays airborne at ${meta.altitude} m`,
  );
});

test('refresh ordering: an older poll never applies over a newer one', async () => {
  const flightState = createFlightState({
    services: stub({
      groundSnap: { createGroundSnap: () => stub() },
      geoid: {},
      groundFloor: {},
    }),
    source: {
      label: 'Fixture',
      getSnapshot: () => polls.shift().promise,
    },
  });
  const polls = [deferred(), deferred()];
  const pollA = polls[0];
  const pollB = polls[1];
  const applied = [];
  const ingestion = createIngestion({
    feed: flightState.feed,
    getQuery: () => ({}),
    applySnapshot: (snapshot) => {
      applied.push(snapshot.tag);
      return { count: snapshot.records.length, ids: new Set() };
    },
    setSourceLabel: () => {},
    applyPendingTrackingRestore: () => {},
  });
  // The managed poll for view A is out; showing a category polls for view B.
  const a = ingestion.methods.update({});
  const b = ingestion.methods.update({});
  pollB.resolve({ tag: 'B', observedAtMs: 2_000, records: [{}, {}] });
  await b;
  pollA.resolve({ tag: 'A', observedAtMs: 1_000, records: [{}] });
  await a;
  // Coalesced (only B), serialized (A then B) or superseding (only B) all
  // pass; A applied over an accepted B does not.
  assert.notEqual(applied.at(-1), 'A', `applied in order ${applied}`);
  assert.equal(flightState.feed._lastUpdate, 2_000, 'freshness went back');
});
