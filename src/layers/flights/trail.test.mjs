import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createFlightState } from './state.js';
import { createTracking } from './tracking.js';
import { TRAIL_MAX_POINTS } from './policy.js';
import {
  insertTrailFix,
  trailHeadJoins,
  trailPairBreaks,
  trailTimeAt,
} from '../../data/trailContinuity.js';
import { createGroundFloor } from '../../services/groundFloor.js';
import { createMeshFloorSampler } from '../../services/meshFloorSampler.js';
import { bindRenderer } from '../../render/rendererOf.js';
import { approxDistanceKm } from '../../data/approxDistance.js';
import { normalizeAircraftTrack } from '../../sources/live/aircraft.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NM = 1852;

function services({
  trails,
  floor = () => null,
  groundFloor = null,
  geoidHeightM = 0,
  meshFloor = {},
} = {}) {
  const names = [
    'picking',
    'sprites',
    'aircraftPresentation',
    'camera',
    'militaryRegistry',
    'labels',
    'meshFloor',
    'focus',
    'readout',
    'context',
    'render',
    'recession',
  ];
  return {
    ...Object.fromEntries(names.map((name) => [name, {}])),
    groundSnap: { createGroundSnap: () => ({ clear() {} }) },
    meshFloor,
    trails,
    geoid: {
      ensureGeoidReady: async () => {},
      geoidHeight: () => geoidHeightM,
    },
    groundFloor: groundFloor ?? {
      resolveGroundFloorCellsBounded: async () => {},
      cachedGroundFloor: floor,
      floorAltitudeM: (alt, ground) =>
        Number.isFinite(alt)
          ? alt
          : Number.isFinite(ground)
            ? ground + 1
            : null,
    },
  };
}

/** A fake trail that records every segment list it is given. */
function recordingTrail() {
  const calls = [];
  return {
    calls,
    // What draws: a lone point is a segment with no line.
    last: () =>
      (calls[calls.length - 1] ?? []).filter((segment) => segment.length >= 2),
    createTrail: () => ({
      setSegments(segments) {
        calls.push(segments.map((segment) => segment.slice()));
      },
      setPositions(positions) {
        calls.push([positions.slice()]);
      },
      setVisible() {},
      clear() {
        calls.push([]);
      },
      destroy() {},
    }),
  };
}

function viewer() {
  const added = [];
  return {
    added,
    isDestroyed: () => false,
    entities: {
      add(definition) {
        added.push(definition);
        return definition;
      },
      remove() {},
    },
  };
}

/**
 * A tracked aircraft whose live history holds `liveFixes` ({timeMs, lat, lon}),
 * with a track endpoint answering `waypoints`.
 */
function trackedHarness({
  liveFixes = [],
  waypoints = null,
  nowMs,
  floor,
  head = null,
  placed = false,
  warmingUp = false,
  source = null,
  groundFloor = null,
  geoidHeightM = 0,
  meshFloor = {},
} = {}) {
  const trail = recordingTrail();
  const svc = services({
    trails: trail,
    floor,
    groundFloor,
    geoidHeightM,
    meshFloor,
  });
  const flightState = createFlightState({
    services: svc,
    source: source ?? {
      label: 'Fixture aircraft',
      async getTrack() {
        if (!waypoints) throw new Error('404');
        return { records: waypoints };
      },
    },
  });
  const v = viewer();
  flightState._viewer = v;
  flightState._trackedIcao = 'abc123';
  flightState.now = () => nowMs;
  flightState._positionHistory.set(
    'abc123',
    liveFixes.map((fix) => ({
      time: Cesium.JulianDate.fromDate(new Date(fix.timeMs)),
      epochMs: fix.timeMs,
      position: Cesium.Cartesian3.fromDegrees(fix.lon, fix.lat, 10_000),
    })),
  );
  const tracking = createTracking({
    flightState,
    services: svc,
    parts: {
      motion: {
        _isTrackWarmingUp: () => warmingUp,
        _trackedPlaced: () => placed,
        _trackedDisplayCached: () => head,
        _trackedTrailCached: () => head,
        _trackedDisplayPosition: () => head,
        _trackedModelCenterWorld: () => null,
        _trackedModelEnvelopeM: () => null,
      },
    },
    layer: {},
  });
  return { trail, tracking, flightState, viewer: v };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function waypoint(timeMs, lat, lon, baroAltitudeM = 10_000) {
  return { observedAtMs: timeMs, latitude: lat, longitude: lon, baroAltitudeM };
}

/** `count` waypoints one minute apart flying east at ~420 kt from (lat, lon). */
function leg(startMs, lat, lon, count) {
  return Array.from({ length: count }, (_, i) =>
    waypoint(startMs + i * MINUTE, lat, lon + i * 0.12),
  );
}

/** The live head the trail would draw now. */
function headPositions({ tracking }) {
  return tracking._trailHeadPositions();
}

test('a pair 40 minutes and 300 km apart stays joined', () => {
  assert.equal(trailPairBreaks(40 * MINUTE, 300_000), false);
});

test('a pair 1 minute and 200 km apart breaks: faster than 1,500 kt', () => {
  assert.equal(trailPairBreaks(MINUTE, 200_000), true);
});

test('a gap longer than 48 minutes breaks, and time that does not advance breaks', () => {
  assert.equal(trailPairBreaks(49 * MINUTE, 10_000), true);
  assert.equal(trailPairBreaks(48 * MINUTE, 10_000), false);
  assert.equal(trailPairBreaks(0, 0), true);
  assert.equal(trailPairBreaks(-MINUTE, 100), true);
});

test('a parked aircraft two hours apart within 0.1 nm stays joined', () => {
  assert.equal(trailPairBreaks(2 * HOUR, 0.09 * NM), false);
  assert.equal(trailPairBreaks(3 * HOUR + MINUTE, 0.09 * NM), true);
  assert.equal(trailPairBreaks(2 * HOUR, 0.2 * NM), true);
});

test('the head joins within 150 km under the time and speed test', () => {
  assert.equal(trailHeadJoins(30_000, 5_000), true);
  assert.equal(trailHeadJoins(30 * MINUTE, 151_000), false);
  assert.equal(trailHeadJoins(HOUR, 5_000), false);
});

test('a backfill with gaps of 10 h, 2 h, 1.2 h and 6.5 h draws five segments and no line across a gap', async () => {
  const t0 = Date.UTC(2026, 10, 8, 0, 0);
  const legs = [];
  let start = t0;
  const gaps = [10 * HOUR, 2 * HOUR, 1.2 * HOUR, 6.5 * HOUR];
  const anchors = [
    [30, 31],
    [12, 0],
    [14, -15],
    [20, -40],
    [35, -75],
  ];
  for (let i = 0; i < anchors.length; i++) {
    const points = leg(start, anchors[i][0], anchors[i][1], 6);
    legs.push(points);
    start = points[points.length - 1].observedAtMs + (gaps[i] ?? 0);
  }
  const waypoints = legs.flat();
  const lastLeg = legs[legs.length - 1];
  const liveStart = lastLeg[lastLeg.length - 1].observedAtMs + MINUTE;
  const liveFixes = [0, 1, 2].map((i) => ({
    timeMs: liveStart + i * MINUTE,
    lat: 35,
    lon: -75 + 0.72 + i * 0.12,
  }));
  const nowMs = liveStart + 3 * MINUTE;
  const { trail, tracking, flightState } = trackedHarness({
    liveFixes,
    waypoints,
    nowMs,
  });
  tracking._startTrail('abc123');
  await settle();

  assert.equal(flightState._trailFixes.length, waypoints.length + 3);
  const segments = trail.last();
  assert.equal(segments.length, 5);
  const bodyCount = segments.reduce((sum, segment) => sum + segment.length, 0);
  // The body draws every fix at or before the display time: all of them here.
  assert.equal(bodyCount, waypoints.length + 3);
  for (const [index, segment] of segments.entries()) {
    const expected = legs[index].map((point) =>
      Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, 10_000),
    );
    for (const position of segment.slice(0, expected.length)) {
      assert.ok(
        expected.some((e) => Cesium.Cartesian3.distance(e, position) < 1),
        `segment ${index} holds a point from another leg`,
      );
    }
  }
});

test('a null-altitude waypoint breaks the line, and nothing is drawn at 10 km', async () => {
  const t0 = Date.UTC(2026, 10, 8, 0, 0);
  const waypoints = leg(t0, 40, 10, 6);
  waypoints[3] = waypoint(waypoints[3].observedAtMs, 40, 10.36, null);
  const nowMs = t0 + 8 * MINUTE;
  const liveFixes = [
    { timeMs: t0 + 6 * MINUTE, lat: 40, lon: 10.72 },
    { timeMs: t0 + 7 * MINUTE, lat: 40, lon: 10.84 },
  ];

  // Unknown floor: the null point is skipped, and the line still breaks there.
  const skipped = trackedHarness({ liveFixes, waypoints, nowMs });
  skipped.tracking._startTrail('abc123');
  await settle();
  assert.equal(
    skipped.flightState._trailFixes.length,
    waypoints.length - 1 + 2,
  );
  const segments = skipped.trail.last();
  assert.deepEqual(
    segments.map((segment) => segment.length),
    [3, 4],
  );
  for (const segment of segments) {
    for (const position of segment) {
      const height = Cesium.Cartographic.fromCartesian(position).height;
      assert.ok(Math.abs(height - 10_000) < 1, 'only real altitudes drawn');
    }
  }

  // Known floor: the point is kept on the ground, alone, joined to nothing.
  const grounded = trackedHarness({
    liveFixes,
    waypoints,
    nowMs,
    floor: () => 120,
  });
  grounded.tracking._startTrail('abc123');
  await settle();
  assert.equal(grounded.flightState._trailFixes.length, waypoints.length + 2);
  assert.deepEqual(
    grounded.trail.last().map((segment) => segment.length),
    [3, 4],
  );
  const kept = grounded.flightState._trailFixes[3];
  assert.ok(
    Math.abs(Cesium.Cartographic.fromCartesian(kept.position).height - 121) < 1,
  );
});

test('a history tail far from the first live fix does not connect to it', async () => {
  const t0 = Date.UTC(2026, 10, 8, 0, 0);
  // History ends 20 minutes before the first live fix, 1,400 km away.
  const waypoints = leg(t0, 50, 0, 5);
  const liveStart = t0 + 24 * MINUTE;
  const liveFixes = [0, 1, 2].map((i) => ({
    timeMs: liveStart + i * MINUTE,
    lat: 50,
    lon: 20 + i * 0.12,
  }));
  const { trail, tracking } = trackedHarness({
    liveFixes,
    waypoints,
    nowMs: liveStart + 3 * MINUTE,
  });
  tracking._startTrail('abc123');
  await settle();
  assert.deepEqual(
    trail.last().map((segment) => segment.length),
    [5, 3],
  );
});

test('the head is drawn to a nearby aircraft and not to one more than 150 km away', () => {
  const t0 = Date.UTC(2026, 10, 8, 0, 0);
  const liveFixes = [0, 1, 2].map((i) => ({
    timeMs: t0 + i * MINUTE,
    lat: 50,
    lon: 1 + i * 0.12,
  }));
  const near = Cesium.Cartesian3.fromDegrees(1.3, 50, 10_000);
  const joined = trackedHarness({
    liveFixes,
    nowMs: t0 + 3 * MINUTE,
    head: near,
  });
  joined.tracking._startTrail('abc123');
  const drawn = headPositions(joined);
  assert.equal(drawn.length, 2);
  assert.ok(Cesium.Cartesian3.distance(drawn[1], near) < 1e-6);

  const far = Cesium.Cartesian3.fromDegrees(4, 50, 10_000);
  const detached = trackedHarness({
    liveFixes,
    nowMs: t0 + 3 * MINUTE,
    head: far,
  });
  detached.tracking._startTrail('abc123');
  assert.deepEqual(headPositions(detached), []);

  // An hour without a fix: the head no longer joins the last body point.
  const stale = trackedHarness({ liveFixes, nowMs: t0 + HOUR, head: near });
  stale.tracking._startTrail('abc123');
  assert.deepEqual(headPositions(stale), []);
});

test('a live fix after a one-hour feed gap starts a new segment', () => {
  const t0 = Date.UTC(2026, 10, 8, 0, 0);
  const liveFixes = [0, 1, 2].map((i) => ({
    timeMs: t0 + i * MINUTE,
    lat: 50,
    lon: 1 + i * 0.12,
  }));
  const { trail, tracking, flightState } = trackedHarness({
    liveFixes,
    nowMs: t0 + 3 * MINUTE,
  });
  tracking._startTrail('abc123');
  assert.deepEqual(
    trail.last().map((segment) => segment.length),
    [3],
  );
  const later = t0 + 2 * MINUTE + HOUR;
  // The display time moves past the new fixes.
  flightState.now = () => later + 3 * MINUTE;
  for (const [i, lon] of [3, 3.12, 3.24].entries()) {
    tracking._appendTrailFix(
      Cesium.Cartesian3.fromDegrees(lon, 50, 10_000),
      later + i * MINUTE,
    );
  }
  assert.equal(flightState._trailFixes.length, 6);
  assert.deepEqual(
    trail.last().map((segment) => segment.length),
    [3, 3],
  );
});

test('every waypoint of a 24 h history survives, and the trail stays within TRAIL_MAX_POINTS', async () => {
  // A full day at one fix per minute.
  const day = 24 * 60;
  const t0 = Date.UTC(2026, 10, 8, 0, 0);
  const full = leg(t0, 10, -100, day);
  const liveStart = t0 + day * MINUTE;
  const liveFixes = [{ timeMs: liveStart, lat: 10, lon: -100 + day * 0.12 }];
  const kept = trackedHarness({
    liveFixes,
    waypoints: full,
    nowMs: liveStart + MINUTE,
  });
  kept.tracking._startTrail('abc123');
  await settle();
  assert.ok(TRAIL_MAX_POINTS >= day + 500);
  assert.equal(kept.flightState._trailFixes.length, full.length + 1);
  assert.deepEqual(
    kept.trail.last().map((segment) => segment.length),
    [day + 1],
  );

  const count = TRAIL_MAX_POINTS + 120;
  const large = leg(
    liveStart - count * MINUTE,
    10,
    -100 + (day - count) * 0.12,
    count,
  );
  const capped = trackedHarness({
    liveFixes,
    waypoints: large,
    nowMs: liveStart + MINUTE,
  });
  capped.tracking._startTrail('abc123');
  await settle();
  const fixes = capped.flightState._trailFixes;
  assert.equal(fixes.length, TRAIL_MAX_POINTS);
  // The oldest go first: the newest live fix is still the last point.
  assert.equal(fixes[fixes.length - 1].timeMs, liveStart);
});

/** A trail of `count` reports one minute apart flying east from (50, 1). */
function eastTrail(t0, count) {
  const fixes = [];
  for (let i = 0; i < count; i++)
    insertTrailFix(
      fixes,
      Cesium.Cartesian3.fromDegrees(1 + i * 0.12, 50, 10_000),
      t0 + i * MINUTE,
      TRAIL_MAX_POINTS,
    );
  return fixes;
}

test('the time on the trail is read where the aircraft is drawn', () => {
  const t0 = Date.UTC(2026, 10, 8, 0, 0);
  const fixes = eastTrail(t0, 4);
  const at = (lon) =>
    trailTimeAt(fixes, Cesium.Cartesian3.fromDegrees(lon, 50, 10_000));
  // Halfway between the second and third reports.
  assert.ok(Math.abs(at(1.18) - (t0 + 1.5 * MINUTE)) < 2_000);
  // On a report.
  assert.ok(Math.abs(at(1.24) - (t0 + 2 * MINUTE)) < 2_000);
  // Past the newest report the time runs on; before the oldest it runs back.
  assert.ok(Math.abs(at(1.42) - (t0 + 3.5 * MINUTE)) < 2_000);
  assert.ok(Math.abs(at(0.94) - (t0 - 0.5 * MINUTE)) < 2_000);
  // Nothing to read without a pair of reports, or without a position.
  assert.ok(Number.isNaN(trailTimeAt(fixes.slice(0, 1), fixes[0].position)));
  assert.ok(Number.isNaN(trailTimeAt(fixes, null)));
});

test('the time on the trail is never read across a break', () => {
  const t0 = Date.UTC(2026, 10, 8, 0, 0);
  const fixes = eastTrail(t0, 2);
  // An hour later, far on: a new segment.
  insertTrailFix(
    fixes,
    Cesium.Cartesian3.fromDegrees(20, 50, 10_000),
    t0 + HOUR,
    TRAIL_MAX_POINTS,
  );
  insertTrailFix(
    fixes,
    Cesium.Cartesian3.fromDegrees(20.12, 50, 10_000),
    t0 + HOUR + MINUTE,
    TRAIL_MAX_POINTS,
  );
  assert.equal(fixes[2].breakBefore, true);
  // Halfway along the gap is not on the trail: it is read on the newest pair.
  const at = trailTimeAt(fixes, Cesium.Cartesian3.fromDegrees(10, 50, 10_000));
  assert.ok(at <= t0 + HOUR, `read ${at - t0} ms in, across the break`);
});

test('a placed aircraft drawn ahead of the display delay keeps its trail joined to it', () => {
  const t0 = Date.UTC(2026, 10, 8, 0, 0);
  const liveFixes = [0, 1, 2, 3].map((i) => ({
    timeMs: t0 + i * MINUTE,
    lat: 50,
    lon: 1 + i * 0.12,
  }));
  // The layer's own delay puts the aircraft before its first fix (warming
  // up), but the placement draws it between the third and fourth reports.
  const near = Cesium.Cartesian3.fromDegrees(1.3, 50, 10_000);
  const placed = trackedHarness({
    liveFixes,
    nowMs: t0 + 3.5 * MINUTE,
    head: near,
    placed: true,
    warmingUp: true,
  });
  placed.flightState._displayDelay = { currentMs: 10 * MINUTE };
  placed.tracking._startTrail('abc123');
  // The body runs to the last report behind the aircraft, none ahead of it.
  assert.deepEqual(
    placed.trail.last().map((segment) => segment.length > 0),
    [true],
  );
  const body = placed.trail.last()[0];
  assert.ok(
    Cesium.Cartesian3.distance(
      body[body.length - 1],
      Cesium.Cartesian3.fromDegrees(1.24, 50, 10_000),
    ) < 1,
  );
  // The head joins it to the aircraft.
  const drawn = headPositions(placed);
  assert.ok(drawn.length >= 2);
  assert.ok(Cesium.Cartesian3.distance(drawn[0], body[body.length - 1]) < 1);
  assert.ok(Cesium.Cartesian3.distance(drawn[drawn.length - 1], near) < 1e-6);

  // The layer's own motion, warming up, draws no head and no body.
  const own = trackedHarness({
    liveFixes,
    nowMs: t0 + 3.5 * MINUTE,
    head: near,
    warmingUp: true,
  });
  own.flightState._displayDelay = { currentMs: 10 * MINUTE };
  own.tracking._startTrail('abc123');
  assert.deepEqual(own.trail.last(), []);
  assert.deepEqual(headPositions(own), []);
});

test('a placed aircraft drawn behind the display delay has no trail ahead of it', () => {
  const t0 = Date.UTC(2026, 10, 8, 0, 0);
  const liveFixes = [0, 1, 2, 3].map((i) => ({
    timeMs: t0 + i * MINUTE,
    lat: 50,
    lon: 1 + i * 0.12,
  }));
  // The layer's delay would draw every report; the placement holds the
  // aircraft between the first and second.
  const behind = Cesium.Cartesian3.fromDegrees(1.06, 50, 10_000);
  const { trail, tracking, flightState } = trackedHarness({
    liveFixes,
    nowMs: t0 + 4 * MINUTE,
    head: behind,
    placed: true,
  });
  flightState._displayDelay = { currentMs: 0 };
  tracking._startTrail('abc123');
  // One report behind it: no line yet, and nothing ahead of the aircraft.
  assert.deepEqual(trail.last(), []);
  const drawn = headPositions({ tracking });
  assert.equal(drawn.length, 2);
  assert.ok(
    Cesium.Cartesian3.distance(
      drawn[0],
      Cesium.Cartesian3.fromDegrees(1, 50, 10_000),
    ) < 1,
  );
  assert.ok(Cesium.Cartesian3.distance(drawn[1], behind) < 1e-6);
});

// A departure's history as the track endpoint sends it:
// [time, latitude, longitude, baro_altitude, true_track, on_ground].
// Taxi on the ground (no altitude, or 0), the take-off roll the feed sends at
// baro 0 while no longer on the ground, then the climb.
const T0_S = 1_795_870_000;
const DEPARTURE_ROWS = [
  [T0_S, 50.03, 8.54, null, 250, true],
  [T0_S + 20, 50.0302, 8.538, 0, 250, true],
  [T0_S + 40, 50.0304, 8.536, null, 250, true],
  [T0_S + 60, 50.0306, 8.534, 0, 250, false],
  [T0_S + 70, 50.0308, 8.53, 0, 250, false],
  [T0_S + 90, 50.031, 8.52, 300, 250, false],
  [T0_S + 110, 50.0312, 8.51, 600, 250, false],
];
/** Ellipsoidal sea level (the geoid height) and runway floor in these cases. */
const SEA_LEVEL_M = 50;
const FIELD_M = 106;
/** Bare earth under a runway deck built out on columns: the DEM cells land
 *  below the deck the rendered mesh shows. */
const DEM_UNDER_DECK_M = 60;
/** A short floor deadline, so a late floor needs no 1.2 s wait. */
const DEADLINE_MS = 20;
/** The airport, where the camera is. */
const VIEWER = { lat: 50.03, lon: 8.54 };
/** The mesh sampler's reach from the camera, as the app's sampler has it. */
const MESH_FLOOR = { MAX_SAMPLE_DIST_KM: 15 };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const heightOf = (fix) =>
  Cesium.Cartographic.fromCartesian(fix.position).height;
const cellOf = ({ lat, lon }) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

/**
 * The real ground-floor service over a terrain whose cells read `floorM`
 * (null while cold). `lookup` answers each floor request.
 */
function floorFixture({ floorM = null, lookup = async () => {} } = {}) {
  const state = { floorM, lookups: 0, cellsAsked: 0 };
  const groundFloor = createGroundFloor({
    terrain: {
      cachedRealEllipsoidalGround: () => state.floorM,
      async resolveEllipsoidalGround(cells) {
        state.lookups += 1;
        state.cellsAsked += cells.length;
        await lookup(state);
      },
    },
    floorResolveDeadlineMs: DEADLINE_MS,
  });
  return { state, groundFloor };
}

/** A floor lookup that stays open until `release()` warms every cell. */
function lateFloorFixture() {
  let release = () => {};
  const fixture = floorFixture({
    lookup: (state) =>
      new Promise((resolve) => {
        release = () => {
          state.floorM = FIELD_M;
          resolve();
        };
      }),
  });
  return { ...fixture, release: () => release() };
}

/** A tracked aircraft whose history is `rows`, at `nowMs` after it. */
function historyHarness(
  rows,
  groundFloor,
  { liveFixes = [], nowMs = (rows[rows.length - 1][0] + 300) * 1000 } = {},
) {
  const records = normalizeAircraftTrack(rows);
  return trackedHarness({
    nowMs,
    liveFixes,
    groundFloor,
    meshFloor: MESH_FLOOR,
    geoidHeightM: SEA_LEVEL_M,
    source: {
      label: 'Fixture aircraft',
      async getTrack(id) {
        if (id !== 'abc123') throw new Error('404');
        return { records };
      },
    },
  });
}

const departureHarness = (groundFloor, options) =>
  historyHarness(DEPARTURE_ROWS, groundFloor, options);

/** The climb: baro altitude plus the geoid, as before. */
function assertClimb(fixes) {
  const climb = fixes.slice(-2).map(heightOf);
  assert.ok(Math.abs(climb[0] - (300 + SEA_LEVEL_M)) < 0.5, `${climb[0]}`);
  assert.ok(Math.abs(climb[1] - (600 + SEA_LEVEL_M)) < 0.5, `${climb[1]}`);
}

/** Taxi and roll on the floor, and the whole departure one line. */
function assertOnFloor({ flightState, trail }, groundFloor, groundM = FIELD_M) {
  const fixes = flightState._trailFixes;
  assert.equal(fixes.length, DEPARTURE_ROWS.length);
  const floorM = groundM + groundFloor.GROUND_FLOOR_LIFT_M;
  for (const fix of fixes.slice(0, 5))
    assert.ok(Math.abs(heightOf(fix) - floorM) < 0.01, `${heightOf(fix)}`);
  for (const fix of fixes)
    assert.ok(heightOf(fix) >= floorM - 0.01, 'no vertex under the floor');
  assertClimb(fixes);
  // Taxi, the roll along the runway and the climb out: no stretch missing.
  assert.deepEqual(
    trail.last().map((segment) => segment.length),
    [DEPARTURE_ROWS.length],
  );
}

/** One poll's floor work, the way the layer's poll does it. */
function poll(harness, groundFloor, { contacts = [], meshM = null } = {}) {
  const batch = harness.tracking._floorBatch(contacts, VIEWER.lat, VIEWER.lon);
  groundFloor.warmGroundFloor(batch.warm);
  const missed = [];
  if (meshM != null)
    for (const point of batch.mesh)
      if (
        !groundFloor.reportValidatedMeshFloorCell(point.lat, point.lon, meshM)
      )
        missed.push(point);
  return { batch, redrawn: harness.tracking._refloorTrail(missed) };
}

test('a departure history with a cold floor draws nothing at sea level and breaks where the height is unknown', async () => {
  const { groundFloor } = floorFixture();
  const harness = departureHarness(groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();

  const fixes = harness.flightState._trailFixes;
  for (const fix of fixes)
    assert.ok(heightOf(fix) > SEA_LEVEL_M + 1, 'a vertex at sea level');
  // Taxi and roll have no height: they are left out and the line breaks.
  assert.equal(fixes.length, 2);
  assert.equal(fixes[0].breakBefore, true);
  assertClimb(fixes);
  assert.deepEqual(
    harness.trail.last().map((segment) => segment.length),
    [2],
  );
});

test('a departure history with a warm floor draws taxi, roll and climb as one line on the floor', async () => {
  const { groundFloor } = floorFixture({ floorM: FIELD_M });
  const harness = departureHarness(groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();
  assertOnFloor(harness, groundFloor);
});

test('an approach whose last reports read 0 or below reaches touchdown', async () => {
  const rows = [600, 300, 100, -10, -40].map((baro, i) => [
    T0_S + i * 20,
    50.05 - i * 0.002,
    8.54,
    baro,
    180,
    false,
  ]);
  rows.push([T0_S + 100, 50.04, 8.54, null, 180, true]);
  rows.push([T0_S + 120, 50.0395, 8.54, null, 180, true]);
  const { groundFloor } = floorFixture({ floorM: FIELD_M });
  const harness = historyHarness(rows, groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();
  const segments = harness.trail.last();
  assert.deepEqual(
    segments.map((segment) => segment.length),
    [rows.length],
  );
  const touchdown = harness.flightState._trailFixes[rows.length - 1];
  assert.equal(segments[0][segments[0].length - 1], touchdown.position);
});

test('a report at 0 in the middle of a cruise breaks the line and draws no dive to the ground', async () => {
  const rows = [10_000, 10_000, 0, 10_000, 10_000].map((baro, i) => [
    T0_S + i * 60,
    50,
    8 + i * 0.12,
    baro,
    90,
    false,
  ]);
  const { groundFloor } = floorFixture({ floorM: FIELD_M });
  const harness = historyHarness(rows, groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();
  const segments = harness.trail.last();
  assert.deepEqual(
    segments.map((segment) => segment.length),
    [2, 2],
  );
  for (const segment of segments)
    for (const position of segment)
      assert.ok(Cesium.Cartographic.fromCartesian(position).height > 9_000);
});

test('a ground report with an altitude keeps it while the floor is cold, and stands on the floor once known', async () => {
  const rows = [[T0_S, 50.03, 8.54, 120, 250, true]];
  const cold = historyHarness(rows, floorFixture().groundFloor);
  cold.tracking._startTrail('abc123');
  await settle();
  assert.equal(cold.flightState._trailFixes.length, 1);
  assert.ok(
    Math.abs(heightOf(cold.flightState._trailFixes[0]) - (120 + SEA_LEVEL_M)) <
      0.5,
  );

  const { groundFloor } = floorFixture({ floorM: FIELD_M });
  const warm = historyHarness(rows, groundFloor);
  warm.tracking._startTrail('abc123');
  await settle();
  assert.ok(
    Math.abs(
      heightOf(warm.flightState._trailFixes[0]) -
        (FIELD_M + groundFloor.GROUND_FLOOR_LIFT_M),
    ) < 0.01,
  );
});

test('a floor that lands after the deadline re-floors the history once and redraws it', async () => {
  const { state, groundFloor, release } = lateFloorFixture();
  const harness = departureHarness(groundFloor);
  harness.tracking._startTrail('abc123');
  await wait(DEADLINE_MS + 30);

  // Painted cold at the deadline.
  assert.equal(harness.flightState._trailFixes.length, 2);
  const draws = harness.trail.calls.length;

  release();
  await settle();
  assertOnFloor(harness, groundFloor);
  assert.equal(harness.trail.calls.length, draws + 1);
  assert.equal(state.lookups, 1);

  await wait(50);
  assert.equal(harness.trail.calls.length, draws + 1, 'one re-floor only');
});

test('a late floor does not touch the trail of a newer selection or a cleared track', async () => {
  for (const moveOn of [
    ({ tracking, flightState }) => {
      flightState._trackedIcao = 'def456';
      tracking._startTrail('def456');
    },
    ({ tracking }) => tracking._clearTrail(),
  ]) {
    const { groundFloor, release } = lateFloorFixture();
    const harness = departureHarness(groundFloor);
    harness.tracking._startTrail('abc123');
    await wait(DEADLINE_MS + 30);
    moveOn(harness);
    await settle();
    const draws = harness.trail.calls.length;

    release();
    await settle();
    assert.deepEqual(harness.flightState._trailFixes, []);
    assert.equal(harness.trail.calls.length, draws);
  }
});

test('a floor lookup that failed is asked again by a later poll, and taxi and roll appear', async () => {
  let fail = true;
  const { groundFloor } = floorFixture({
    lookup: async (state) => {
      await null;
      if (fail) throw new Error('502');
      state.floorM = FIELD_M;
    },
  });
  const harness = departureHarness(groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();
  assert.equal(harness.flightState._trailFixes.length, 2);

  fail = false;
  const { batch, redrawn } = poll(harness, groundFloor);
  assert.equal(redrawn, false, 'the lookup has not answered yet');
  // The cold cells of the waypoints with no height of their own.
  assert.deepEqual(
    new Set(batch.warm.map(cellOf)),
    new Set(
      DEPARTURE_ROWS.slice(0, 5).map(([, lat, lon]) => cellOf({ lat, lon })),
    ),
  );
  assert.equal(batch.mesh.length, 0, 'a cold cell is not sampled');
  await settle();
  assert.equal(harness.tracking._refloorTrail(), true);
  assertOnFloor(harness, groundFloor);
});

test('mesh readings at a runway deck lift the history off the bare earth below it, once', async () => {
  const { groundFloor } = floorFixture({ floorM: DEM_UNDER_DECK_M });
  const harness = departureHarness(groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();
  assertOnFloor(harness, groundFloor, DEM_UNDER_DECK_M);

  // The poll asks the mesh under the waypoints that rest on the floor:
  // taxi and roll, newest first, and not the climb.
  const draws = harness.trail.calls.length;
  const { batch, redrawn } = poll(harness, groundFloor, { meshM: FIELD_M });
  assert.deepEqual(
    batch.mesh.map(({ lat, lon }) => [lat, lon]),
    DEPARTURE_ROWS.slice(0, 5)
      .reverse()
      .map(([, lat, lon]) => [lat, lon]),
  );
  assert.equal(redrawn, true);
  assertOnFloor(harness, groundFloor, FIELD_M);
  assert.equal(harness.trail.calls.length, draws + 1);

  // The next poll finds every cell read: it offers none and draws nothing.
  const next = poll(harness, groundFloor, { meshM: FIELD_M });
  assert.equal(next.batch.mesh.length, 0);
  assert.equal(next.redrawn, false);
  assert.equal(harness.trail.calls.length, draws + 1);
});

test('a re-floor keeps every position whose height did not change', async () => {
  const { groundFloor } = floorFixture({ floorM: DEM_UNDER_DECK_M });
  const harness = departureHarness(groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();
  const before = harness.flightState._trailFixes.map((fix) => fix.position);

  // One cell is read: only its waypoint moves.
  const [, lat, lon] = DEPARTURE_ROWS[0];
  assert.ok(groundFloor.reportValidatedMeshFloorCell(lat, lon, FIELD_M));
  assert.equal(harness.tracking._refloorTrail(), true);
  const after = harness.flightState._trailFixes.map((fix) => fix.position);
  assert.notEqual(after[0], before[0]);
  for (let i = 1; i < before.length; i++)
    assert.equal(after[i], before[i], `position ${i} was rebuilt`);

  // A reading within a few centimetres of the last changes nothing.
  assert.ok(groundFloor.reportValidatedMeshFloorCell(lat, lon, FIELD_M - 0.1));
  assert.equal(harness.tracking._refloorTrail(), false);
});

test('a long taxi has its older cells offered once the newer ones are read, and cells out of range or just missed wait', async () => {
  const rows = Array.from({ length: 70 }, (_, i) => [
    T0_S + i * 20,
    50.03 + i * 0.001,
    8.54,
    null,
    0,
    true,
  ]);
  const { groundFloor } = floorFixture({ floorM: DEM_UNDER_DECK_M });
  const harness = historyHarness(rows, groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();
  const cells = (batch) => batch.mesh.map(cellOf);
  const rowCells = rows.map(([, lat, lon]) => cellOf({ lat, lon }));

  // A camera 100 km away is past the sampler's reach: nothing to offer.
  assert.deepEqual(
    harness.tracking._floorBatch([], VIEWER.lat + 0.9, VIEWER.lon).mesh,
    [],
  );

  // The newest 40 first; the 8 newest come back with no reading.
  const first = harness.tracking._floorBatch([], VIEWER.lat, VIEWER.lon);
  assert.deepEqual(cells(first), rowCells.slice(30).reverse());
  const missed = first.mesh.slice(0, 8);
  for (const point of first.mesh.slice(8))
    groundFloor.reportValidatedMeshFloorCell(point.lat, point.lon, FIELD_M);
  harness.tracking._refloorTrail(missed);

  // Next: the 30 older cells; the missed ones wait their turn.
  const second = harness.tracking._floorBatch([], VIEWER.lat, VIEWER.lon);
  assert.deepEqual(cells(second), rowCells.slice(0, 30).reverse());
  for (const point of second.mesh)
    groundFloor.reportValidatedMeshFloorCell(point.lat, point.lon, FIELD_M);
  harness.tracking._refloorTrail([]);

  // Polls later the missed cells are offered again.
  let again = [];
  for (let i = 0; i < 10 && !again.length; i++) {
    again = cells(harness.tracking._floorBatch([], VIEWER.lat, VIEWER.lon));
    harness.tracking._refloorTrail([]);
  }
  assert.deepEqual(again, missed.map(cellOf));
});

test('at a busy airport the history is probed on the first poll, and the contacts keep most of the budget', async () => {
  const { groundFloor } = floorFixture({ floorM: DEM_UNDER_DECK_M });
  const sampler = createMeshFloorSampler({ groundFloor });
  const asked = [];
  const viewer = { isDestroyed: () => false };
  bindRenderer(viewer, {
    capabilities: { has: (name) => name === 'sampleHeight' },
    camera: { pose: () => ({ ...VIEWER, height: 900 }) },
    globe: { isGlobeVisible: () => false, isSettled: () => true },
    query: {
      sampleHeightNow(point) {
        asked.push(cellOf(point));
        return FIELD_M;
      },
    },
  });
  const contacts = Array.from({ length: 300 }, (_, i) => ({
    lat: 50.01 + Math.floor(i / 20) * 0.001,
    lon: 8.56 + (i % 20) * 0.001,
  }));
  const harness = departureHarness(groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();

  const batch = harness.tracking._floorBatch(contacts, VIEWER.lat, VIEWER.lon);
  const missed = sampler.sampleMeshFloorCells(viewer, batch.mesh, {
    viewerLat: VIEWER.lat,
    viewerLon: VIEWER.lon,
  });
  const trailCells = new Set(
    DEPARTURE_ROWS.slice(0, 5).map(([, lat, lon]) => cellOf({ lat, lon })),
  );
  const trailProbes = asked.filter((cell) => trailCells.has(cell)).length;
  assert.equal(trailProbes, 5);
  assert.equal(asked.length, 40);
  assert.equal(harness.tracking._refloorTrail(missed), true);
  assertOnFloor(harness, groundFloor, FIELD_M);
});

test('a re-floor with live reports keeps them once each and judges the join again', async () => {
  // A history that ends on the runway, and two live reports after it.
  const rows = DEPARTURE_ROWS.slice(0, 5);
  const liveFixes = [1, 2].map((i) => ({
    timeMs: (T0_S + 70 + i * 20) * 1000,
    lat: 50.0308,
    lon: 8.53 - i * 0.005,
  }));
  const { groundFloor, release } = lateFloorFixture();
  const harness = historyHarness(rows, groundFloor, {
    liveFixes,
    nowMs: (T0_S + 200) * 1000,
  });
  harness.tracking._startTrail('abc123');
  await wait(DEADLINE_MS + 30);
  const live = harness.flightState._trailFixes.slice();
  assert.equal(live.length, 2, 'cold: only the live reports');
  assert.equal(
    live[0].breakBefore,
    true,
    'the cold history breaks before them',
  );

  release();
  await settle();
  const fixes = harness.flightState._trailFixes;
  assert.equal(fixes.length, rows.length + 2);
  assert.equal(new Set(fixes).size, fixes.length);
  assert.equal(fixes[rows.length], live[0]);
  assert.equal(fixes[rows.length + 1], live[1]);
  assert.equal(
    live[0].breakBefore,
    false,
    'the roll now joins the first live report',
  );
});

test('a re-floor past the point limit keeps the newest points once each', async () => {
  const cruise = Array.from({ length: 2_030 }, (_, i) => [
    T0_S + i * 60,
    40 + i * 0.002,
    -170 + i * 0.12,
    10_000,
    90,
    false,
  ]);
  const end = cruise[cruise.length - 1][0];
  const taxi = Array.from({ length: 20 }, (_, i) => [
    end + 600 + i * 20,
    50.03 + i * 0.0002,
    8.54,
    null,
    0,
    true,
  ]);
  const rows = cruise.concat(taxi);
  const liveFixes = [1, 2, 3].map((i) => ({
    timeMs: (taxi[19][0] + i * 20) * 1000,
    lat: 50.034 + i * 0.0002,
    lon: 8.54,
  }));
  const { state, groundFloor, release } = lateFloorFixture();
  const harness = historyHarness(rows, groundFloor, { liveFixes });
  harness.tracking._startTrail('abc123');
  await wait(DEADLINE_MS + 30);
  // Only the newest TRAIL_MAX_POINTS waypoints are looked up and kept.
  assert.ok(state.cellsAsked <= TRAIL_MAX_POINTS, `${state.cellsAsked}`);

  release();
  await settle();
  const fixes = harness.flightState._trailFixes;
  assert.equal(fixes.length, TRAIL_MAX_POINTS);
  assert.equal(new Set(fixes).size, fixes.length);
  assert.equal(fixes[fixes.length - 1].timeMs, liveFixes[2].timeMs);
  const floorM = FIELD_M + groundFloor.GROUND_FLOOR_LIFT_M;
  const ground = fixes.slice(-23, -3);
  for (const fix of ground)
    assert.ok(Math.abs(heightOf(fix) - floorM) < 0.01, `${heightOf(fix)}`);
});

test('mesh readings that land after a newer selection leave its trail alone', async () => {
  const { groundFloor } = floorFixture({ floorM: DEM_UNDER_DECK_M });
  const harness = departureHarness(groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();
  const points = harness.tracking._floorBatch([], VIEWER.lat, VIEWER.lon).mesh;

  harness.flightState._trackedIcao = 'def456';
  harness.tracking._startTrail('def456');
  await settle();
  const draws = harness.trail.calls.length;
  const contacts = [{ lat: 1, lon: 1 }];
  const batch = harness.tracking._floorBatch(contacts, VIEWER.lat, VIEWER.lon);
  assert.deepEqual(batch, { warm: contacts, mesh: contacts });

  for (const point of points)
    groundFloor.reportValidatedMeshFloorCell(point.lat, point.lon, FIELD_M);
  assert.equal(harness.tracking._refloorTrail(), false);
  assert.deepEqual(harness.flightState._trailFixes, []);
  assert.equal(harness.trail.calls.length, draws);
});

test('with no mesh to read the history stays on the bare-earth floor', async () => {
  const { groundFloor } = floorFixture({ floorM: DEM_UNDER_DECK_M });
  const harness = departureHarness(groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();
  const draws = harness.trail.calls.length;

  // A renderer that cannot sample: no reading lands.
  assert.equal(harness.tracking._refloorTrail(), false);
  // A globe stack (no 3D tiles): nothing is offered, and readings do not apply.
  groundFloor.setMeshFloorPreferred(false);
  const contacts = [{ lat: 1, lon: 1 }];
  assert.deepEqual(
    harness.tracking._floorBatch(contacts, VIEWER.lat, VIEWER.lon),
    { warm: contacts, mesh: contacts },
  );
  for (const [, lat, lon] of DEPARTURE_ROWS)
    groundFloor.reportValidatedMeshFloorCell(lat, lon, FIELD_M);
  assert.equal(harness.tracking._refloorTrail(), false);
  assertOnFloor(harness, groundFloor, DEM_UNDER_DECK_M);
  assert.equal(harness.trail.calls.length, draws);
});

/** A floor lookup that fails until `heal()`, then warms every cell. */
function healingFloorFixture() {
  let fail = true;
  const fixture = floorFixture({
    lookup: async (state) => {
      await null;
      if (fail) throw new Error('502');
      state.floorM = FIELD_M;
    },
  });
  return { ...fixture, heal: () => (fail = false) };
}

test('a ground report with an altitude on a cold floor is asked again and lands on the floor, on a globe and on 3D tiles', async () => {
  for (const preferred of [false, true]) {
    const rows = [
      [T0_S, 50.03, 8.54, 120, 250, true],
      [T0_S + 20, 50.0302, 8.538, 125, 250, true],
    ];
    const { groundFloor, heal } = healingFloorFixture();
    groundFloor.setMeshFloorPreferred(preferred);
    const harness = historyHarness(rows, groundFloor);
    harness.tracking._startTrail('abc123');
    await settle();
    const heights = () => harness.flightState._trailFixes.map(heightOf);
    assert.ok(Math.abs(heights()[0] - (120 + SEA_LEVEL_M)) < 0.5);

    heal();
    const { batch } = poll(harness, groundFloor);
    assert.deepEqual(
      new Set(batch.warm.map(cellOf)),
      new Set(rows.map(([, lat, lon]) => cellOf({ lat, lon }))),
      `cold cells asked again (mesh preferred: ${preferred})`,
    );
    await settle();
    assert.equal(harness.tracking._refloorTrail(), true);
    for (const height of heights())
      assert.ok(
        Math.abs(height - (FIELD_M + groundFloor.GROUND_FLOOR_LIFT_M)) < 0.01,
        `${height}`,
      );
  }
});

test('an overhead pass later over the departure cell still has its ground cell sampled and lifted', async () => {
  const rows = [
    [T0_S, 50.03, 8.54, null, 90, true],
    [T0_S + 20, 50.03, 8.542, null, 90, true],
    // Ten minutes later, 3 km up over the first ground cell.
    [T0_S + 600, 50.0302, 8.5402, 3_000, 90, false],
  ];
  const { groundFloor } = floorFixture({ floorM: DEM_UNDER_DECK_M });
  const harness = historyHarness(rows, groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();
  const { batch, redrawn } = poll(harness, groundFloor, { meshM: FIELD_M });
  assert.deepEqual(batch.mesh.map(cellOf), [
    cellOf({ lat: 50.03, lon: 8.542 }),
    cellOf({ lat: 50.03, lon: 8.54 }),
  ]);
  assert.equal(redrawn, true);
  const ground = harness.flightState._trailFixes[0];
  assert.ok(
    Math.abs(heightOf(ground) - (FIELD_M + groundFloor.GROUND_FLOOR_LIFT_M)) <
      0.01,
    `${heightOf(ground)}`,
  );
});

test('a cold roll cell is asked again when a later high pass shares it', async () => {
  const rows = [
    [T0_S, 50.03, 8.54, null, 90, true],
    [T0_S + 20, 50.03, 8.544, 0, 90, false],
    [T0_S + 40, 50.031, 8.55, 400, 90, false],
    // Later, high over the roll cell.
    [T0_S + 900, 50.0302, 8.5441, 3_000, 90, false],
  ];
  const { groundFloor } = healingFloorFixture();
  const harness = historyHarness(rows, groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();
  const { batch } = poll(harness, groundFloor);
  assert.ok(
    batch.warm.map(cellOf).includes(cellOf({ lat: 50.03, lon: 8.544 })),
  );
});

test('a live report appended after the history joined an empty trail survives the next re-floor', async () => {
  const { groundFloor, release } = lateFloorFixture();
  const harness = departureHarness(groundFloor);
  harness.tracking._startTrail('abc123');
  await wait(DEADLINE_MS + 30);
  assert.equal(harness.flightState._trailFixes.length, 2);

  const liveMs = (T0_S + 130) * 1000;
  harness.tracking._appendTrailFix(
    Cesium.Cartesian3.fromDegrees(8.5, 50.0314, 800),
    liveMs,
  );
  release();
  await settle();
  const fixes = harness.flightState._trailFixes;
  assert.equal(fixes.length, DEPARTURE_ROWS.length + 1);
  assert.equal(fixes[fixes.length - 1].timeMs, liveMs);
});

test('a dropout far in time and distance from a ground report stands alone instead of running along the ground', async () => {
  const rows = [
    [T0_S, 50.03, 8.54, null, 0, true],
    // Ten minutes and 70 km later, no altitude; then the cruise.
    [T0_S + 600, 50.66, 8.54, 0, 0, false],
    [T0_S + 660, 50.7, 8.54, 10_000, 0, false],
    [T0_S + 720, 50.74, 8.54, 10_000, 0, false],
  ];
  const { groundFloor } = floorFixture({ floorM: FIELD_M });
  const harness = historyHarness(rows, groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();
  const segments = harness.trail.last();
  assert.deepEqual(
    segments.map((segment) => segment.length),
    [2],
  );
  for (const position of segments[0])
    assert.ok(Cesium.Cartographic.fromCartesian(position).height > 9_000);
});

test('a cell whose centre is past the sampler reach is not offered, though its waypoint is within it', async () => {
  const lat = VIEWER.lat + 0.1346;
  const cellLat = Number(lat.toFixed(3));
  const reach = MESH_FLOOR.MAX_SAMPLE_DIST_KM;
  assert.ok(approxDistanceKm(VIEWER.lat, VIEWER.lon, lat, VIEWER.lon) < reach);
  assert.ok(
    approxDistanceKm(VIEWER.lat, VIEWER.lon, cellLat, VIEWER.lon) > reach,
  );
  const rows = [[T0_S, lat, VIEWER.lon, null, 0, true]];
  const { groundFloor } = floorFixture({ floorM: DEM_UNDER_DECK_M });
  const harness = historyHarness(rows, groundFloor);
  harness.tracking._startTrail('abc123');
  await settle();
  assert.deepEqual(
    harness.tracking._floorBatch([], VIEWER.lat, VIEWER.lon).mesh,
    [],
  );
});

test('a floor service without the mesh members still takes the poll floor work', async () => {
  const t0 = Date.UTC(2026, 10, 8, 0, 0);
  const waypoints = leg(t0, 40, 10, 3);
  waypoints[1] = waypoint(waypoints[1].observedAtMs, 40, 10.12, null);
  // The default harness floor service: no cell, mesh or reach members.
  const { tracking } = trackedHarness({
    waypoints,
    nowMs: t0 + 10 * MINUTE,
    floor: () => 120,
  });
  tracking._startTrail('abc123');
  await settle();
  const contacts = [{ lat: 1, lon: 1 }];
  const batch = tracking._floorBatch(contacts, 40, 10);
  assert.deepEqual(batch.warm, contacts);
  assert.equal(tracking._refloorTrail(), false);
});
