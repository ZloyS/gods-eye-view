import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FLIGHT_CATEGORIES,
  createCategories,
  normalizeFlightCategories,
} from './categories.js';
import { createFlightSnapshotRenderer } from './snapshotRenderer.js';
import { createMotion } from './motion.js';
import { createFlightState } from './state.js';
import { createEnrichment } from './enrichment.js';
import { createQueries } from './queries.js';
import { createTracking } from './tracking.js';
import {
  createDefaultLayerState,
  decodeLayerStateParams,
  encodeLayerStateParams,
} from '../../data/layerState.js';
import { decodeShareView, encodeShareView } from '../../share/viewCodec.js';
import { setLocale, t } from '../../i18n/index.js';
import { coverageText } from '../../ui/libraryBrowser.js';

/** Any property is a no-op function unless given. */
function stub(overrides = {}) {
  return new Proxy(overrides, {
    get: (target, key) => (key in target ? target[key] : () => undefined),
  });
}

/** A flights layer's snapshot path over fixture icons, with its categories. */
function harness() {
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
    source: { label: 'Fixture aircraft' },
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
    positionTimeMs: Date.now() - 5_000,
    ...fields,
  });
  return {
    flightState,
    iconIds,
    updates,
    parts,
    categories: parts.categories,
    invalidations: () => invalidations,
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

/** One contact of each category. */
const FLEET = [
  ['a10001', { typeCode: 'A320' }],
  ['a10002', { typeCode: 'B77W' }],
  ['b10001', { typeCode: 'AT76' }],
  ['c10001', { typeCode: 'C56X' }],
  ['d10001', { typeCode: 'C172' }],
  ['d10002', { typeCode: 'BALL' }],
  ['e10001', { typeCode: 'EC35' }],
  [
    'f10001',
    { typeCode: 'ZVEH', onGround: true, speedMps: 5, callsign: 'FIRE1' },
  ],
  ['f10002', { callsign: 'TXLU03', onGround: true, speedMps: 0 }],
  ['f10003', { callsign: 'ADSTEST', onGround: true, speedMps: 0 }],
  ['0a0001', { typeCode: 'ZZZZ' }],
  ['0a0002', {}],
];

test('category toggles normalise like any layer option', () => {
  assert.deepEqual(normalizeFlightCategories({}), DEFAULT_FLIGHT_CATEGORIES);
  assert.deepEqual(
    normalizeFlightCategories({ ground: false, other: 'no', bogus: false }),
    { ...DEFAULT_FLIGHT_CATEGORIES, ground: false },
  );
  const current = { ...DEFAULT_FLIGHT_CATEGORIES, light: false };
  assert.deepEqual(normalizeFlightCategories({ ground: false }, current), {
    ...current,
    ground: false,
  });
});

test('each contact counts in its category, and every category draws by default', () => {
  const h = harness();
  h.apply(FLEET);
  assert.equal(h.iconIds.size, FLEET.length);
  assert.deepEqual(Object.fromEntries(h.flightState._categoryCounts), {
    airliners: 2,
    regional: 1,
    bizjets: 1,
    light: 1,
    helicopters: 1,
    ground: 3,
    other: 3,
  });
  // Transmitters keep their finer class, a station; test transmitters theirs.
  assert.equal(h.flightState.records.data.get('f10002').klass, 'station');
  assert.equal(
    h.flightState.records.data.get('f10003').klass,
    'testtransmitter',
  );
  assert.equal(h.flightState.records.data.get('0a0002').klass, 'unknown');
  assert.ok(h.invalidations() > 0, 'the row paints the counts');
});

test('a hidden category goes at once and stays away; showing it polls again', () => {
  const h = harness();
  h.apply(FLEET);
  // The ZZZZ contact's type was looked up while drawn.
  const looked = h.flightState.records.data.get('0a0001');
  looked.typeCode = 'C172';
  looked.typeLookedUp = true;
  looked.klass = 'light';
  h.flightState._trackedIcao = 'a10002';
  h.categories.setCategories({ airliners: false, light: false });
  // The tracked widebody stays; the other airliner and light aircraft go.
  assert.equal(h.iconIds.has('a10001'), false);
  assert.equal(h.iconIds.has('a10002'), true);
  assert.equal(h.iconIds.has('d10001'), false);
  assert.equal(h.iconIds.has('0a0001'), false);
  assert.equal(h.flightState.records.data.has('a10001'), false);
  assert.equal(h.flightState.feed._count, h.iconIds.size);
  assert.equal(h.updates.length, 0, 'hiding asks for nothing');
  // The next poll draws none of them, but still counts them.
  h.apply(FLEET);
  assert.equal(h.iconIds.has('a10001'), false);
  assert.equal(h.iconIds.has('d10001'), false);
  assert.equal(h.flightState._categoryCounts.get('airliners'), 2);
  // The looked-up type was kept: it is still a light aircraft, still hidden.
  assert.equal(h.iconIds.has('0a0001'), false);
  assert.equal(h.flightState.records.airframes.get('0a0001')?.typeCode, 'C172');
  // A contact a share link is about to track is drawn whatever its category.
  h.flightState._pendingTrackingRestore = { id: 'a10001' };
  h.apply(FLEET);
  assert.equal(h.iconIds.has('a10001'), true);
  h.flightState._pendingTrackingRestore = null;
  // Shown again: the next poll is brought forward and draws them.
  h.categories.setCategories({ light: true });
  assert.equal(h.updates.length, 1);
  h.apply(FLEET);
  assert.equal(h.iconIds.has('d10001'), true);
  assert.equal(h.iconIds.has('0a0001'), true);
  assert.equal(h.flightState.records.data.get('0a0001').klass, 'light');
  // Setting what is already set does nothing.
  h.categories.setCategories({ light: true, bogus: false });
  assert.equal(h.updates.length, 1);
});

test('the row has a Show/Hide chip per category, keyed and counted while shown', () => {
  const h = harness();
  h.apply(FLEET);
  h.categories.setCategories({ ground: false });
  const { chips } = h.categories.rowControls();
  assert.deepEqual(
    chips.map((chip) => chip.id),
    [
      'flights-airliners',
      'flights-regional',
      'flights-bizjets',
      'flights-light',
      'flights-helicopters',
      'flights-ground',
      'flights-other',
    ],
  );
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ['AIRLINERS', 'REGIONAL', 'BUSINESS', 'LIGHT', 'HELICOPTERS', 'GROUND', 'OTHER'],
  );
  const airliners = chips[0];
  assert.equal(airliners.label, 'AIRLINERS');
  assert.equal(airliners.title, 'Hide Airliners');
  assert.equal(airliners.active, true);
  assert.deepEqual(airliners.params, { airliners: false });
  assert.equal(airliners.count, 2);
  assert.ok(airliners.swatch);
  const ground = chips[5];
  assert.equal(ground.title, 'Show Ground');
  assert.equal(ground.active, false);
  assert.deepEqual(ground.params, { ground: true });
  assert.equal(Object.hasOwn(ground, 'count'), false);
  assert.equal(Object.hasOwn(ground, 'swatch'), false);
});

test('the Regional chip has its own words, apart from the library coverage "Regional"', () => {
  const h = harness();
  const regional = () =>
    h.categories
      .rowControls()
      .chips.find((chip) => chip.id === 'flights-regional');
  try {
    for (const [locale, chip, coverage] of [
      ['ru', 'РЕГИОНАЛЬНЫЕ', 'Регионально'],
      ['uk', 'РЕГІОНАЛЬНІ', 'Регіонально'],
    ]) {
      setLocale(locale);
      assert.equal(regional().label, chip, locale);
      assert.equal(coverageText({ coverage: {} }), coverage, locale);
    }
  } finally {
    setLocale('en');
  }
  assert.equal(regional().label, 'REGIONAL');
  assert.equal(regional().title, 'Hide Regional');
});

test('every chip reads as a plural category name in its own context, apart from other uses of its word', () => {
  const h = harness();
  const labels = () =>
    h.categories.rowControls().chips.map((chip) => chip.label);
  try {
    setLocale('ru');
    assert.deepEqual(labels(), [
      'АВИАЛАЙНЕРЫ',
      'РЕГИОНАЛЬНЫЕ',
      'БИЗНЕС',
      'ЛЁГКИЕ',
      'ВЕРТОЛЁТЫ',
      'НАЗЕМНЫЕ',
      'ПРОЧИЕ',
    ]);
    // The same English elsewhere keeps its own words.
    assert.equal(t('Light', { context: 'earthquake' }), 'Лёгкое');
    assert.equal(t('Other'), 'Другое');
    setLocale('fr');
    assert.equal(labels()[1], 'RÉGIONAUX');
  } finally {
    setLocale('en');
  }
  assert.deepEqual(labels(), [
    'AIRLINERS',
    'REGIONAL',
    'BUSINESS',
    'LIGHT',
    'HELICOPTERS',
    'GROUND',
    'OTHER',
  ]);
});

test('category toggles survive both share-link forms; older links show every category', () => {
  const state = createDefaultLayerState();
  state.enabledLayerIds = ['flights'];
  Object.assign(state.options.flights, {
    airliners: false,
    ground: false,
  });
  // The long form.
  const params = new URLSearchParams('v=2');
  encodeLayerStateParams(params, state);
  // Only the hidden categories are written.
  const flightOptions = params
    .get('lo')
    .split('_')
    .filter((entry) => /^f\.[abghlor]\./.test(entry));
  assert.deepEqual(flightOptions, ['f.a.0', 'f.g.0']);
  const decoded = decodeLayerStateParams(params);
  assert.equal(decoded.options.flights.airliners, false);
  assert.equal(decoded.options.flights.ground, false);
  assert.equal(decoded.options.flights.light, true);
  // The compact form.
  const hash = encodeShareView({ layerState: state });
  const result = decodeShareView(hash, { nowMs: Date.now() });
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(
    {
      airliners: result.state.layerState.options.flights.airliners,
      ground: result.state.layerState.options.flights.ground,
      other: result.state.layerState.options.flights.other,
    },
    { airliners: false, ground: false, other: true },
  );
  // A link written before the categories existed hides none.
  const before = decodeLayerStateParams(
    new URLSearchParams('v=2&l=f&lo=f.m.a'),
  );
  for (const key of Object.keys(DEFAULT_FLIGHT_CATEGORIES))
    assert.equal(before.options.flights[key], true, key);
  const defaults = createDefaultLayerState();
  defaults.enabledLayerIds = ['flights'];
  const plain = decodeShareView(encodeShareView({ layerState: defaults }), {
    nowMs: Date.now(),
  });
  for (const key of Object.keys(DEFAULT_FLIGHT_CATEGORIES))
    assert.equal(plain.state.layerState.options.flights[key], true, key);
});

test('a looked-up type keeps a transmitter a station and sends a hidden class away', async () => {
  const answers = {
    342351: { found: true, typeCode: 'ZVEH' },
    a0f1bb: { found: true, typeCode: 'C172' },
  };
  const flightState = createFlightState({
    services: stub({
      groundSnap: { createGroundSnap: () => stub() },
      geoid: {},
      groundFloor: {},
    }),
    source: { getEnrichment: async ({ id }) => answers[id] },
  });
  const restyled = [];
  const hidden = [];
  const parts = {
    icons: stub({ _applyIconPresentation: (id) => restyled.push(id) }),
    rendering: stub(),
    categories: {
      reclassified: (id, meta) => {
        if (meta.klass !== 'light') return true;
        hidden.push(id);
        return false;
      },
    },
  };
  const enrichment = createEnrichment({
    flightState,
    services: {
      militaryRegistry: { isMilitaryIcao: () => false },
      aircraftPresentation: { isTr3b: () => false },
    },
    parts,
  });
  flightState.records.data.set('342351', {
    callsign: 'TXLU13',
    klass: 'station',
    transmitter: true,
  });
  flightState.records.data.set('a0f1bb', { klass: 'unknown' });
  enrichment._requestTypeEnrichment('342351', true);
  enrichment._requestTypeEnrichment('a0f1bb', true);
  // Lookups leave one per dispatch gap (ENRICH_DISPATCH_GAP_MS).
  await new Promise((done) => setTimeout(done, 300));
  const transmitter = flightState.records.data.get('342351');
  assert.equal(transmitter.typeCode, 'ZVEH');
  assert.equal(transmitter.klass, 'station');
  assert.equal(flightState.records.data.get('a0f1bb').klass, 'light');
  assert.deepEqual(hidden, ['a0f1bb']);
  assert.deepEqual(restyled, []);
  flightState.lifetime.abort();
});

test('a contact released from tracking in a hidden category goes at once', () => {
  const h = harness();
  h.flightState._trackedIcao = 'a10001';
  h.categories.setCategories({ airliners: false });
  h.apply([['a10001', { typeCode: 'B738' }]]);
  h.flightState.feed._count = h.iconIds.size;
  assert.equal(h.iconIds.has('a10001'), true, 'the tracked one is drawn');
  h.flightState._trackedIcao = null;
  assert.equal(h.categories.refilter('a10001'), true);
  assert.equal(h.iconIds.has('a10001'), false);
  assert.equal(h.flightState.feed._count, 0);
});

/** The tracking module over a harness's layer, with no-op app services. */
function trackingOf(h) {
  const services = stub(
    Object.fromEntries(
      [
        'context',
        'aircraftPresentation',
        'trails',
        'geoid',
        'groundFloor',
        'focus',
        'militaryRegistry',
        'readout',
        'camera',
        'picking',
      ].map((name) => [name, stub()]),
    ),
  );
  return createTracking({
    flightState: h.flightState,
    services,
    parts: h.parts,
    layer: {},
  });
}

test('clearing tracking sends a contact of a hidden category away at once', () => {
  const h = harness();
  const tracking = trackingOf(h);
  h.flightState._trackedIcao = 'a10001';
  h.categories.setCategories({ airliners: false });
  h.apply([['a10001', { typeCode: 'B738' }]]);
  assert.equal(h.iconIds.has('a10001'), true, 'the tracked one is drawn');
  tracking._clearTracking(true, { origin: 'user' });
  assert.equal(h.flightState._trackedIcao, null);
  assert.equal(h.iconIds.has('a10001'), false);
});

test('cancelling a share restore sends its target of a hidden category away', () => {
  const h = harness();
  const tracking = trackingOf(h);
  h.flightState._pendingTrackingRestore = {
    id: 'a10001',
    generation: h.flightState._trackingIntentGeneration,
    origin: 'share',
  };
  h.categories.setCategories({ airliners: false });
  h.apply([['a10001', { typeCode: 'B738' }]]);
  assert.equal(h.iconIds.has('a10001'), true, 'the share target is drawn');
  tracking._cancelPendingTrackingRestore();
  assert.equal(h.flightState._pendingTrackingRestore, null);
  assert.equal(h.iconIds.has('a10001'), false);
});

test('a share target is drawn through the destination refresh in a hidden category', () => {
  const h = harness();
  h.flightState._restoreCandidate = 'a10001';
  h.categories.setCategories({ airliners: false });
  h.apply([['a10001', { typeCode: 'B738' }]]);
  assert.equal(h.iconIds.has('a10001'), true);
  h.flightState._restoreCandidate = null;
  h.categories.refilter('a10001');
  assert.equal(h.iconIds.has('a10001'), false);
});

test('a share target replaced by another goes when its category is hidden', () => {
  const h = harness();
  const queries = createQueries({
    flightState: h.flightState,
    services: stub(),
    parts: { categories: h.categories, testing: stub() },
  }).methods;
  queries.prepareTrackingRestoreTarget('a10001');
  h.categories.setCategories({ airliners: false });
  h.apply([['a10001', { typeCode: 'B738' }]]);
  assert.equal(h.iconIds.has('a10001'), true);
  queries.prepareTrackingRestoreTarget('A10001');
  assert.equal(h.iconIds.has('a10001'), true, 'the same target stays');
  queries.prepareTrackingRestoreTarget('a10002');
  assert.equal(h.iconIds.has('a10001'), false, 'the replaced target goes');
});

test('a category shown again while following the clock reloads the time shown', () => {
  const h = harness();
  let reloads = 0;
  h.flightState.timeline = { active: () => true, reload: () => reloads++ };
  h.apply([['d10001', { typeCode: 'C172' }]]);
  h.categories.setCategories({ light: false });
  h.categories.setCategories({ light: true });
  assert.equal(reloads, 1);
  assert.equal(h.updates.length, 0, 'the live poll is not asked');
});

test('a category refresh repaints the row when it settles', async () => {
  const h = harness();
  h.apply([['d10001', { typeCode: 'C172' }]]);
  h.categories.setCategories({ light: false });
  h.categories.setCategories({ light: true });
  const painted = h.invalidations();
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(h.updates.length, 1);
  assert.equal(h.invalidations(), painted + 1);
});
