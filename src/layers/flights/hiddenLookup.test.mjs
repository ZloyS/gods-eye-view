import test from 'node:test';
import assert from 'node:assert/strict';
import { createCategories } from './categories.js';
import { createFlightSnapshotRenderer } from './snapshotRenderer.js';
import { createMotion } from './motion.js';
import { createFlightState } from './state.js';
import { createEnrichment } from './enrichment.js';
import { fixPosition } from '../../data/aircraftMotionRegime.js';
import { bindRenderer } from '../../render/rendererOf.js';
import { dot, normalize, scale, sub, vec } from '../../geo/vector.js';

/** Any property is a no-op function unless given. */
function stub(overrides = {}) {
  return new Proxy(overrides, {
    get: (target, key) => (key in target ? target[key] : () => undefined),
  });
}

/** A flights layer's snapshot path and enrichment over fixture icons. */
function harness({ getEnrichment }) {
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
  const flightState = createFlightState({
    services,
    source: { label: 'Fixture aircraft', getEnrichment },
  });
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

/** A camera 20 km above lon −115, lat 36, looking straight down. */
function downwardPose() {
  const position = fixPosition(-115, 36, 20_000);
  const direction = normalize(scale(position, -1));
  const z = vec(0, 0, 1);
  const up = normalize(sub(z, scale(direction, dot(z, direction))));
  return {
    position,
    direction,
    up,
    fovy: 1,
    aspectRatio: 1.5,
    near: 1,
    far: 1e8,
    lat: 36,
    lon: -115,
  };
}

test('an untyped contact hidden with Other is still looked up and drawn once its type is known', async () => {
  const asked = [];
  const h = harness({
    getEnrichment: async ({ id }) => {
      asked.push(id);
      return id === 'a0f1bc' ? { found: true, typeCode: 'C172' } : null;
    },
  });
  // Snapshots are applied over a scene with no renderer, as the other
  // harnesses do; the sweep looks through a camera.
  const scene = {};
  const viewer = {};
  const pose = downwardPose();
  const unbind = bindRenderer(viewer, { camera: { pose: () => pose } });
  h.flightState._viewer = scene;
  try {
    h.parts.categories.setCategories({ other: false });
    const row = ['a0f1bc', { callsign: 'N123AC', category: 0 }];
    h.apply([row]);
    assert.equal(h.iconIds.has('a0f1bc'), false, 'Other is hidden');
    h.flightState._viewer = viewer;
    h.parts.enrichment._sweepAmbientEnrichment();
    h.flightState._viewer = scene;
    await new Promise((done) => setTimeout(done, 450));
    assert.deepEqual(asked, ['a0f1bc'], 'the hidden contact was looked up');
    h.apply([row]);
    assert.equal(h.iconIds.has('a0f1bc'), true, 'its type draws it');
    assert.equal(h.flightState.records.data.get('a0f1bc').klass, 'light');
  } finally {
    unbind();
    h.flightState.lifetime.abort();
  }
});
