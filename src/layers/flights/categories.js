import { t } from '../../i18n/index.js';
import {
  AIRCRAFT_CATEGORIES,
  aircraftCategory,
} from '../../data/aircraftClass.js';
import { fixPosition } from '../../data/aircraftMotionRegime.js';

/** Default visibility: every category on. */
export const DEFAULT_FLIGHT_CATEGORIES = Object.freeze(
  Object.fromEntries(AIRCRAFT_CATEGORIES.map((category) => [category, true])),
);

/** The colour key on a shown category's chip: the fleet's white. */
const CATEGORY_SWATCH = '#FFFFFF';

/**
 * A category's chip words: plural category names, in a context of their own,
 * so a generic word ("Regional", "Light", "Ground") is not another use's: the
 * library browser's coverage "Regional" is not an aircraft category
 * (ru «Регионально»).
 * @param {string} category
 * @returns {string}
 */
function categoryLabel(category) {
  switch (category) {
    case 'airliners':
      return t('Airliners', { context: 'aircraft category' });
    case 'regional':
      return t('Regional', { context: 'aircraft category' });
    case 'bizjets':
      return t('Business', { context: 'aircraft category' });
    case 'light':
      return t('Light', { context: 'aircraft category' });
    case 'helicopters':
      return t('Helicopters', { context: 'aircraft category' });
    case 'ground':
      return t('Ground', { context: 'aircraft category' });
    default:
      return t('Other', { context: 'aircraft category' });
  }
}

/**
 * Normalise requested category toggles against the current ones. Unknown keys
 * are ignored and non-boolean values keep the current setting, so a malformed
 * share link can hide nothing it did not name.
 * @param {Record<string, unknown>} params
 * @param {Record<string, boolean>} [current]
 * @returns {Record<string, boolean>}
 */
export function normalizeFlightCategories(
  params,
  current = DEFAULT_FLIGHT_CATEGORIES,
) {
  const next = {};
  for (const category of AIRCRAFT_CATEGORIES) {
    next[category] =
      typeof params?.[category] === 'boolean'
        ? params[category]
        : current[category] !== false;
  }
  return next;
}

/**
 * The Flights layer's category toggles (Airliners, Regional, Business,
 * Light, Helicopters, Ground, Other). A contact in a
 * hidden category is not drawn: no icon, no model, nothing to pick or count.
 * The tracked contact, and one a share link is about to track, stay drawn.
 */
export function createCategories({ flightState, services, parts, layer }) {
  flightState._categories = { ...DEFAULT_FLIGHT_CATEGORIES };
  /** Contacts per category in the last snapshot, drawn or not. */
  flightState._categoryCounts = new Map();
  /**
   * Where each untyped contact hidden in the last snapshot was, so the
   * ambient lookup can still ask for its type.
   */
  flightState._hiddenFixes = new Map();
  // A harness without presentation services draws every class as itself.
  const tr3bClass =
    services?.aircraftPresentation?.tr3bAircraftClass ?? ((id, klass) => klass);

  /**
   * The category a contact is shown under: a converted TR-3B's, not its
   * airframe's.
   * @param {string} icao24
   * @param {{klass?: string}|null|undefined} meta
   * @returns {string}
   */
  function categoryOf(icao24, meta) {
    return aircraftCategory(tr3bClass(icao24, meta?.klass));
  }

  /**
   * Whether the layer draws a contact of this record.
   * @param {string} icao24
   * @param {{klass?: string}|null|undefined} meta
   * @returns {boolean}
   */
  function drawn(icao24, meta) {
    if (flightState._categories[categoryOf(icao24, meta)] !== false)
      return true;
    return (
      icao24 === flightState._trackedIcao ||
      icao24 === flightState._pendingTrackingRestore?.id ||
      icao24 === flightState._restoreCandidate
    );
  }

  /**
   * Stop drawing a contact: it goes with its icon and model, as an absent one
   * does, but what its airframe is stays known, so it classes the same when
   * its category is shown again.
   * @param {string} icao24
   */
  function hideContact(icao24) {
    const meta = flightState.records.data.get(icao24);
    const facts = flightState.records.airframeOf(icao24);
    parts.icons._forgetContact(icao24);
    flightState.records.keepAirframe(icao24, facts);
    if (
      meta &&
      !meta.typeCode &&
      meta.onGround !== true &&
      Number.isFinite(meta.rawLat) &&
      Number.isFinite(meta.rawLon) &&
      Number.isFinite(meta.renderAltitudeM)
    )
      flightState._hiddenFixes.set(
        icao24,
        fixPosition(meta.rawLon, meta.rawLat, meta.renderAltitudeM),
      );
  }

  /** Start a snapshot: only its own hidden contacts are looked up. */
  function beginSnapshot() {
    flightState._hiddenFixes.clear();
  }

  /** Forget the tallies and hidden contacts, as when the layer is cleared. */
  function clear() {
    setCounts(new Map());
    flightState._hiddenFixes.clear();
  }

  /** Drop a drawn contact its category now hides; whether it went. */
  function refilter(icao24) {
    const icons = flightState._icons;
    if (
      !icons?.has(icao24) ||
      drawn(icao24, flightState.records.data.get(icao24))
    )
      return false;
    hideContact(icao24);
    flightState.feed._count = icons.count;
    flightState._panel?.invalidate();
    return true;
  }

  /**
   * A lookup changed a drawn contact's class: move it between the tallies,
   * and drop it when its new category is hidden. Whether it is still drawn.
   * @param {string} icao24
   * @param {{klass?: string}} meta
   * @param {string} previousKlass
   * @returns {boolean}
   */
  function reclassified(icao24, meta, previousKlass) {
    const from = categoryOf(icao24, { klass: previousKlass });
    const to = categoryOf(icao24, meta);
    const counts = flightState._categoryCounts;
    if (from !== to && counts.get(from) > 0) {
      const next = new Map(counts);
      if (next.get(from) === 1) next.delete(from);
      else next.set(from, next.get(from) - 1);
      next.set(to, (next.get(to) || 0) + 1);
      setCounts(next);
    }
    if (drawn(icao24, meta)) return true;
    hideContact(icao24);
    flightState.feed._count = flightState._icons?.count ?? 0;
    flightState._panel?.invalidate();
    return false;
  }

  /**
   * Take the category tally of a snapshot; the row is painted again when it
   * changed.
   * @param {Map<string, number>} counts
   */
  function setCounts(counts) {
    const previous = flightState._categoryCounts;
    flightState._categoryCounts = counts;
    if (
      previous.size !== counts.size ||
      [...counts].some(([category, count]) => previous.get(category) !== count)
    )
      flightState._panel?.invalidate();
  }

  /**
   * Show or hide categories. Unknown keys and non-booleans change nothing.
   * A hidden category's contacts go at once; a category shown again brings
   * the next poll forward, since their records went with them.
   * @param {Record<string, unknown>} params
   */
  function setCategories(params) {
    const current = flightState._categories;
    const next = normalizeFlightCategories(params, current);
    if (AIRCRAFT_CATEGORIES.every((key) => next[key] === current[key])) return;
    flightState._categories = next;
    const icons = flightState._icons;
    if (icons) {
      const hidden = [];
      for (const icao24 of icons.ids())
        if (!drawn(icao24, flightState.records.data.get(icao24)))
          hidden.push(icao24);
      for (const icao24 of hidden) hideContact(icao24);
      flightState.feed._count = icons.count;
    }
    const shownAgain = AIRCRAFT_CATEGORIES.some(
      (key) => next[key] && !current[key],
    );
    if (shownAgain && icons?.show && flightState._viewer) {
      // At another time the snapshot shown is loaded again; live, the next
      // poll comes forward.
      if (flightState.timeline?.active()) flightState.timeline.reload();
      else
        layer
          .update(flightState._viewer)
          .catch(() => {
            /* the next poll brings them */
          })
          .finally(() => flightState._panel?.invalidate());
    }
    flightState._panel?.invalidate();
  }

  /**
   * One chip per category; a shown category carries the colour key and its
   * count from the last snapshot.
   * @returns {{chips: object[]}}
   */
  function rowControls() {
    const counts = flightState._categoryCounts;
    const chips = AIRCRAFT_CATEGORIES.map((category) => {
      const on = flightState._categories[category] !== false;
      const label = categoryLabel(category);
      const chip = {
        id: `flights-${category}`,
        label: label.toUpperCase(),
        title: on
          ? t('Hide {category}', { category: label })
          : t('Show {category}', { category: label }),
        active: on,
        busy: false,
        disabled: false,
        state: on ? 'active' : 'idle',
        params: { [category]: !on },
      };
      if (!on) return chip;
      chip.swatch = CATEGORY_SWATCH;
      if (counts.get(category) > 0) chip.count = counts.get(category);
      return chip;
    });
    return { chips };
  }

  return {
    categoryOf,
    drawn,
    hideContact,
    beginSnapshot,
    clear,
    refilter,
    reclassified,
    setCounts,
    setCategories,
    rowControls,
  };
}
