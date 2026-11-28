// The vessels row's category toggles: what each category draws, what a
// hidden one leaves out, and how the toggles travel in share links.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVesselLayer } from './index.js';
import { createVesselIconBook } from './iconBook.js';
import { VESSEL_CATEGORY_LABELS } from './policy.js';
import {
  DEFAULT_VESSEL_CATEGORY_VISIBILITY,
  VESSEL_CATEGORIES,
  VESSEL_KIND_STYLES,
  vesselCategory,
} from '../../data/vesselTypes.js';
import {
  AID_TO_NAVIGATION_STYLE,
  DISTRESS_BEACON_STYLE,
} from '../../data/vesselLabels.js';
import {
  aidSprite,
  beaconSprite,
  nonVesselSprite,
  platformSprite,
  vesselSprite,
} from '../../data/vesselSprites.js';
import { aircraftIcon } from '../../data/aircraftIcons.js';
import { vesselModelSpec } from '../../data/fleetModels.js';
import { cssColor } from '../../render/color.js';
import { setLocale, t } from '../../i18n/index.js';
import { formatFact } from '../../data/entityContext.js';
import {
  createDefaultLayerState,
  decodeLayerStateParams,
  encodeLayerStateParams,
  layerOptionsForRestore,
  optionSpecs,
} from '../../data/layerState.js';
import {
  SHARE_VIEW_LAYER_OPTION_ABSENT,
  decodeShareView,
  encodeShareView,
} from '../../share/viewCodec.js';

const noop = () => {};
function services() {
  return {
    context: {
      clearSelectedEntityContextForLayer: noop,
      registerEntityContext: () => null,
    },
    trails: {
      createTrail: () => ({ setPositions: noop, clear: noop, destroy: noop }),
    },
    labels: { formatKnots: (knots) => `${knots} kt` },
    picking: { unregisterPickOwner: noop },
    overlay: {
      setOverlayEntries: noop,
      setOverlaySourceVisible: noop,
      clearOverlaySource: noop,
    },
    geoid: {},
    sprites: {},
    focus: {
      focusNowMs: (now) => now,
      getFocusTarget: () => null,
      focusPassIsNeeded: () => false,
      forgetSpriteFocus: noop,
    },
    worldFocus: {},
    render: {
      holdContinuousRender: noop,
      releaseContinuousRender: noop,
      governorRequestRender: noop,
    },
  };
}

const observation = (id, extra = {}) => ({
  id,
  mmsi: /^\d+$/.test(id) ? id : '',
  reference: id,
  latitude: 51.93,
  longitude: 4.05,
  name: id,
  observedAtMs: 500,
  speedMps: 4,
  headingDeg: 180,
  courseDeg: 170,
  ...extra,
});

/** One record of every kind the row tells apart. */
const FLEET = [
  observation('366999001', { type: 'Oil Products Tanker', typeBroad: 'Cargo' }),
  observation('366999002', { type: '70' }),
  observation('366999003', { type: 'Fishing' }),
  // A VTS station, its broad type a navigation aid.
  observation('366999004', {
    type: 'Manned VTS',
    typeBroad: 'Navigation Aid',
    speedMps: 0,
  }),
  // A coast station whose MMSI lost its zeros on the way.
  observation('2442234', { type: '' }),
  observation('992442234', { type: 'Cardinal Mark N' }),
  observation('111244100', { type: '' }),
  observation('974123456', { type: '' }),
];

async function setup(records = FLEET) {
  const layer = createVesselLayer({
    source: {
      async getSnapshot() {
        return {
          records,
          source: 'Fixture vessels',
          complete: true,
          stale: false,
          freshness: 'current',
          observedAtMs: 500,
          transportStatus: 'live',
          rawRowCount: records.length,
        };
      },
    },
    services: services(),
  });
  const icons = createVesselIconBook();
  layer.testing._setVesselStateForTest({
    viewer: {},
    icons,
    interactionKeyTarget: new EventTarget(),
  });
  layer.testing._setAisRuntimeForTest({
    now: () => 1000,
    setTimeout,
    clearTimeout,
  });
  await layer.update();
  return { layer, icons };
}

test('stations and navigation aids are Other, shown by default, and drawn as what they are', async () => {
  const { layer, icons } = await setup();
  const item = (id) => icons.item(id);
  assert.deepEqual(layer.getParams(), DEFAULT_VESSEL_CATEGORY_VISIBILITY);
  // Shown by default: a station is the upright mast, an aid the buoy, both
  // bone white.
  for (const id of ['366999004', '2442234', '992442234'])
    assert.equal(item(id).show, true, id);
  for (const id of ['366999004', '2442234']) {
    assert.equal(item(id).show, true, id);
    assert.equal(item(id).image, aircraftIcon('station', 64), id);
    assert.equal(item(id).image, nonVesselSprite('station'));
    assert.equal(item(id).rotationMode, 'screen', id);
    assert.deepEqual(item(id).color, cssColor(AID_TO_NAVIGATION_STYLE.css));
  }
  assert.equal(item('992442234').image, aidSprite());
  assert.equal(layer.getStats().count, FLEET.length);
  // Hidden with Other: drawn nowhere, counted nowhere.
  assert.equal(layer.setParams({ other: false }), true);
  for (const id of ['366999004', '2442234', '992442234'])
    assert.equal(item(id).show, false, id);
  assert.equal(layer.getStats().count, 5);
  assert.deepEqual(
    layer
      .getAnalystRecords()
      .map((record) => record.vesselId)
      .sort(),
    ['111244100', '366999001', '366999002', '366999003', '974123456'],
  );
  layer.setParams({ other: true });
  // A SAR aircraft is an aircraft, turned with its course; a distress beacon
  // an upright buoy with a flash ring, in alarm red. Both are with the
  // service vessels.
  assert.equal(item('111244100').image, aircraftIcon('turboprop', 64));
  assert.equal(item('111244100').rotationMode, 'course');
  assert.deepEqual(
    item('111244100').color,
    cssColor(VESSEL_KIND_STYLES.military.css),
  );
  assert.equal(item('974123456').image, beaconSprite());
  assert.equal(item('974123456').rotationMode, 'screen');
  assert.deepEqual(
    item('974123456').color,
    cssColor(DISTRESS_BEACON_STYLE.css),
  );
  // Vessels keep their kind's hull and colour.
  assert.equal(item('366999001').image, vesselSprite('tanker'));
  assert.equal(item('366999002').image, vesselSprite('cargo'));
});

test('platforms follow the other chip', async () => {
  const fixed = { speedMps: 0 };
  const { layer, icons } = await setup([
    observation('366999002', { type: '70' }),
    observation('366999020', { type: 'Offshore Platform', ...fixed }),
    observation('PLATFORM', {
      mmsi: '',
      type: '',
      destination: 'STEADY OBJECT',
      ...fixed,
    }),
    observation('993672020', { type: 'Fixed structure off shore', ...fixed }),
  ]);
  const platforms = ['366999020', 'PLATFORM', '993672020'];
  // Shown by default, with the stations and aids: upright, bone white.
  for (const id of platforms) {
    assert.equal(icons.item(id).show, true, id);
    assert.equal(icons.item(id).image, platformSprite(), id);
    assert.equal(icons.item(id).rotationMode, 'screen', id);
    assert.deepEqual(
      icons.item(id).color,
      cssColor(AID_TO_NAVIGATION_STYLE.css),
      id,
    );
  }
  assert.equal(layer.getStats().count, 4);
  // Its card names it: its own type text, else the kind's word.
  const card = (id) =>
    layer.buildSelectedVesselCard(layer.testing._vesselRecordForTest(id))
      .details[0];
  assert.equal(card('366999020'), 'OFFSHORE PLATFORM');
  assert.equal(card('PLATFORM'), 'PLATFORM');
  // Hidden with the other chip; the cargo ship stays.
  layer.setParams({ other: false });
  for (const id of platforms) assert.equal(icons.item(id).show, false, id);
  assert.equal(layer.getStats().count, 1);
});

test('a hidden category hides its icons, its cards and its records', async () => {
  const { layer, icons } = await setup();
  icons.show = true;
  const detected = () =>
    layer.getDetectableObjects().map((object) => object.sourceId);
  assert.ok(detected().includes('366999001'));
  assert.equal(layer.selectById('366999001'), true);
  assert.equal(
    layer.setParams({ tankers: false, other: 'no', bogus: false }),
    true,
  );
  assert.equal(layer.getParams().tankers, false);
  // Non-booleans and unknown keys change nothing.
  assert.equal(layer.getParams().other, true);
  assert.equal(Object.hasOwn(layer.getParams(), 'bogus'), false);
  assert.equal(icons.item('366999001').show, false);
  assert.equal(icons.item('366999002').show, true);
  // The selected tanker lets its selection go.
  assert.equal(layer.getSelectedInfo(), null);
  assert.equal(layer.getStats().count, 7);
  assert.ok(
    !layer
      .getAnalystRecords()
      .some((record) => record.vesselId === '366999001'),
  );
  assert.ok(!detected().includes('366999001'));
  assert.ok(detected().includes('366999002'));
  assert.equal(
    layer.getNearby(icons.item('366999002').pos, Infinity).length,
    7,
  );
  layer.setParams({ tankers: true });
  assert.equal(icons.item('366999001').show, true);
});

test('the vessels row has seven chips in order, all on', async () => {
  const { layer } = await setup();
  const { chips } = layer.getRowControls();
  assert.equal(chips.length, 7);
  assert.deepEqual(
    chips.map((chip) => chip.id),
    VESSEL_CATEGORIES.map((category) => `vessels-${category}`),
  );
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ['TANKERS', 'CARGO', 'PASSENGER', 'FISHING', 'SERVICE', 'LEISURE', 'OTHER'],
  );
  assert.ok(chips.every((chip) => chip.active));
  const other = chips.at(-1);
  assert.deepEqual(other.params, { other: false });
  assert.equal(other.title, 'Hide Other');
  layer.setParams({ other: false });
  assert.equal(layer.getRowControls().chips.at(-1).title, 'Show Other');
  assert.deepEqual(chips[0].params, { tankers: false });
  assert.equal(chips[0].title, 'Hide Tankers');
  assert.equal(chips[4].title, 'Hide Service');
  assert.deepEqual(Object.keys(VESSEL_CATEGORY_LABELS), [...VESSEL_CATEGORIES]);
});

test('a shown chip carries the colour its ships are drawn in, a hidden one none', async () => {
  // One ship of each category by its AIS ship-type code.
  const codes = {
    tankers: '80',
    cargo: '70',
    passenger: '60',
    fishing: '30',
    service: '52',
    leisure: '37',
    other: '90',
  };
  const ids = Object.fromEntries(
    VESSEL_CATEGORIES.map((category, i) => [category, `36699910${i}`]),
  );
  const { layer, icons } = await setup(
    VESSEL_CATEGORIES.map((category) =>
      observation(ids[category], { type: codes[category] }),
    ),
  );
  for (const chip of layer.getRowControls().chips) {
    const category = chip.id.replace('vessels-', '');
    assert.equal(vesselCategory({ type: codes[category] }), category);
    assert.equal(typeof chip.swatch, 'string', category);
    assert.deepEqual(
      cssColor(chip.swatch),
      icons.item(ids[category]).color,
      category,
    );
  }
  layer.setParams({ tankers: false });
  const [tankers, cargo] = layer.getRowControls().chips;
  assert.equal(tankers.swatch, undefined);
  assert.equal(cargo.swatch, VESSEL_KIND_STYLES.cargo.css);
});

test("the chips read as plural category names, apart from the card's ship type words", async () => {
  const { layer } = await setup();
  const labels = () => layer.getRowControls().chips.map((chip) => chip.label);
  const cardWord = (shipType) => t(formatFact('shipType', shipType).words.text);
  try {
    setLocale('ru');
    assert.deepEqual(labels(), [
      'ТАНКЕРЫ',
      'ГРУЗОВЫЕ',
      'ПАССАЖИРСКИЕ',
      'РЫБОЛОВНЫЕ',
      'СЛУЖЕБНЫЕ',
      'ПРОГУЛОЧНЫЕ',
      'ПРОЧИЕ',
    ]);
    assert.equal(cardWord(70), 'Грузовое');
    assert.equal(cardWord(60), 'Пассажирское');
    setLocale('uk');
    assert.equal(labels()[1], 'ВАНТАЖНІ');
    assert.equal(cardWord(70), 'Вантажне');
    setLocale('de');
    assert.equal(labels()[2], 'PASSAGIERSCHIFFE');
    assert.equal(cardWord(60), 'Passagierschiff');
  } finally {
    setLocale('en');
  }
  assert.equal(labels()[1], 'CARGO');
});

test('stations, aircraft and beacons get no ship model', () => {
  const set = { catalog: {}, types: {} };
  for (const vessel of [
    { type: 'Manned VTS', mmsi: '366999004' },
    { type: '', mmsi: '2442234' },
    { type: '', destination: 'STEADY OBJECT' },
    { type: '', mmsi: '111244100' },
    { type: '', mmsi: '970123456' },
  ])
    assert.equal(vesselModelSpec(set, vessel), null, JSON.stringify(vessel));
});

test('the category toggles travel in both share-link forms', () => {
  // The option keys are the categories, defaulting as the layer does.
  assert.deepEqual(
    Object.fromEntries(
      optionSpecs('ais-live-vessels').map((spec) => [
        spec.key,
        spec.defaultValue,
      ]),
    ),
    DEFAULT_VESSEL_CATEGORY_VISIBILITY,
  );
  assert.deepEqual(
    SHARE_VIEW_LAYER_OPTION_ABSENT['ais-live-vessels'],
    DEFAULT_VESSEL_CATEGORY_VISIBILITY,
  );
  const layerState = createDefaultLayerState();
  layerState.enabledLayerIds = ['ais-live-vessels'];
  Object.assign(layerState.options['ais-live-vessels'], {
    service: false,
    leisure: false,
    other: false,
  });
  const wanted = {
    ...DEFAULT_VESSEL_CATEGORY_VISIBILITY,
    service: false,
    leisure: false,
    other: false,
  };
  // Long form: only the toggles that differ are written.
  const params = encodeLayerStateParams(new URLSearchParams(), layerState);
  assert.deepEqual(
    params
      .get('lo')
      .split('_')
      .filter((option) => option.startsWith('a.')),
    ['a.s.0', 'a.l.0', 'a.x.0'],
  );
  const long = decodeLayerStateParams(new URLSearchParams(`v=2&${params}`));
  assert.deepEqual(layerOptionsForRestore(long, 'ais-live-vessels'), wanted);
  // Compact form.
  const nowMs = Date.UTC(2026, 10, 27);
  const code = encodeShareView({ layerState });
  const compact = decodeShareView(code, { nowMs });
  assert.equal(compact.ok, true, compact.reason);
  assert.deepEqual(
    compact.state.layerState.options['ais-live-vessels'],
    wanted,
  );
  // A link that names no toggle opens on the defaults.
  const plain = createDefaultLayerState();
  plain.enabledLayerIds = ['ais-live-vessels'];
  assert.deepEqual(
    decodeShareView(encodeShareView({ layerState: plain }), { nowMs }).state
      .layerState.options['ais-live-vessels'],
    DEFAULT_VESSEL_CATEGORY_VISIBILITY,
  );
  assert.deepEqual(
    layerOptionsForRestore(
      decodeLayerStateParams(new URLSearchParams('v=2&l=a')),
      'ais-live-vessels',
    ),
    DEFAULT_VESSEL_CATEGORY_VISIBILITY,
  );
});

test('the card of what is not a vessel names what it is', async () => {
  const { layer } = await setup();
  const record = (id) => layer.testing._vesselRecordForTest(id);
  const selected = (id) => layer.buildSelectedVesselCard(record(id));
  // A station's own type, whole, and no speed or heading.
  assert.equal(selected('366999004').details[0], 'MANNED VTS');
  assert.deepEqual(layer.buildVesselCard(record('366999004')).details, [
    'MANNED VTS',
  ]);
  assert.equal(selected('366999004').accent, AID_TO_NAVIGATION_STYLE.accent);
  // Known only by its MMSI prefix.
  assert.equal(selected('2442234').details[0], 'COAST STATION');
  assert.equal(selected('974123456').details[0], 'DISTRESS BEACON · EPIRB');
  assert.equal(selected('974123456').accent, DISTRESS_BEACON_STYLE.accent);
  // A SAR aircraft moves: it keeps its speed and heading.
  assert.match(
    selected('111244100').details[0],
    /^SAR AIRCRAFT · .*KT · 180°$/,
  );
});
