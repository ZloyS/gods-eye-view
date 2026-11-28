// Shared fixture for the vessel-layer tests: a real vessel layer over a
// snapshot the test can replace, with spies on the HUD and the overlay host.
import { createVesselLayer } from './index.js';
import { createVesselIconBook } from './iconBook.js';

const noop = () => {};

/** One vessel observation off Kiel, its MMSI the id when the id is digits. */
export const observation = (id, extra = {}) => ({
  id,
  mmsi: /^\d+$/.test(id) ? id : '',
  reference: id,
  latitude: 54.5,
  longitude: 10.2,
  name: id,
  observedAtMs: 500,
  speedMps: 4,
  headingDeg: 180,
  courseDeg: 170,
  ...extra,
});

/** The latitude `nm` nautical miles north of the fixture's observations. */
export const north = (nm) => 54.5 + nm / 60;

/** `panel`: told when the row changes, as the layer panel's handle is. */
export async function setupVesselLayer(fleet, { panel = null } = {}) {
  const log = { hud: [], entries: [] };
  let current = fleet;
  let at = 500;
  const layer = createVesselLayer({
    source: {
      async getSnapshot() {
        return {
          records: current,
          source: 'Fixture vessels',
          complete: true,
          stale: false,
          freshness: 'current',
          observedAtMs: at,
          transportStatus: 'live',
          rawRowCount: current.length,
        };
      },
    },
    services: {
      context: {
        clearSelectedEntityContextForLayer: noop,
        registerEntityContext: () => null,
      },
      trails: {
        createTrail: () => ({
          setPositions: noop,
          clear: noop,
          destroy: noop,
          setVisible: noop,
        }),
      },
      labels: { formatKnots: (knots) => `${knots} kt` },
      picking: { unregisterPickOwner: noop },
      overlay: {
        setOverlayEntries: noop,
        setOverlaySourceVisible: noop,
        clearOverlaySource: noop,
      },
      readouts: { presentSelectedVessel: (value) => log.hud.push(value) },
      geoid: {},
      sprites: {},
      focus: {
        focusNowMs: (now) => now,
        getFocusTarget: () => null,
        focusPassIsNeeded: () => false,
        forgetSpriteFocus: noop,
      },
      worldFocus: { requestWorldFocus: noop },
      render: {
        holdContinuousRender: noop,
        releaseContinuousRender: noop,
        governorRequestRender: noop,
      },
    },
  });
  const icons = createVesselIconBook();
  layer.testing._setVesselStateForTest({
    viewer: {},
    icons,
    interactionKeyTarget: new EventTarget(),
    panel,
  });
  layer.testing._setAisRuntimeForTest({
    now: () => 1000,
    setTimeout,
    clearTimeout,
  });
  layer.testing._setVesselOverlayHostForTest({
    setEntries: (id, entries) => log.entries.push(entries),
    setVisible: noop,
    clear: noop,
    clearSource: noop,
  });
  await layer.update();
  /** Replace the snapshot with `next`, observed at `time`, and update. */
  const refresh = async (next, time) => {
    current = next;
    at = time;
    await layer.update();
  };
  // The ids of the cards published with no ambient candidates: the
  // selected card only.
  const publishedCards = () => {
    log.entries.length = 0;
    layer.testing._updateVesselCardsForTest([]);
    return (log.entries.at(-1) ?? []).map((entry) => entry.id);
  };
  return {
    layer,
    icons,
    log,
    refresh,
    publishedCards,
    record: (id) => layer.testing._vesselRecordForTest(id),
  };
}
