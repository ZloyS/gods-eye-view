/** Pure proximity helpers for Global Context. No capability modeling. */

import { msg, t } from '../i18n/index.js';
import { UNNAMED_PLACE_NAMES } from './installationNames.js';
import { formatDistanceText } from './distanceFormat.js';
import { AIRCRAFT_CLASS_LABELS, aircraftCategory } from './aircraftClass.js';

const UNNAMED_NAMES = new Set(UNNAMED_PLACE_NAMES);

export const AWARENESS_RADIUS_M = 250000;
export const AWARENESS_MAX_FLIGHT_SEARCH_RADIUS_M = 16000000;
export const AWARENESS_RELATIONSHIP = Object.freeze({
  NEARBY: 'NEARBY',
  OUTSIDE_RANGE: 'OUTSIDE_RANGE',
  UNKNOWN: 'UNKNOWN',
});

/** A filter word or class id, lower-cased, letters and digits only. */
const compactWord = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/**
 * The words for each Flights category ({@link AIRCRAFT_CATEGORIES}), its
 * chip label among them.
 */
const CATEGORY_WORDS = new Map([
  ['airliner', 'airliners'],
  ['regional', 'regional'],
  ['turboprop', 'regional'],
  ['business', 'bizjets'],
  ['businessjet', 'bizjets'],
  ['bizjet', 'bizjets'],
  ['light', 'light'],
  ['lightaircraft', 'light'],
  ['helicopter', 'helicopters'],
  ['station', 'ground'],
  ['ground', 'ground'],
  ['vehicle', 'ground'],
  ['other', 'other'],
  ['unknown', 'other'],
]);

/**
 * The classes each class word names: its id, its card word and the card
 * word's first part ("drone" is `uav`, "airliner" also `regionaljet`,
 * "ground station" `station`). An untyped contact's card word ("Aircraft")
 * names nothing; only its id does.
 */
const CLASS_WORDS = new Map();
for (const [klass, label] of Object.entries(AIRCRAFT_CLASS_LABELS)) {
  const words =
    klass === 'unknown'
      ? [klass]
      : [klass, compactWord(label), compactWord(String(label).split('/')[0])];
  for (const word of words) {
    if (!CLASS_WORDS.has(word)) CLASS_WORDS.set(word, new Set());
    CLASS_WORDS.get(word).add(klass);
  }
}

/**
 * A word and its singular forms ("widebodies" also "widebody").
 * @param {string} word
 * @returns {string[]}
 */
function wordForms(word) {
  const forms = [word];
  if (word.endsWith('ies')) forms.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('s')) forms.push(word.slice(0, -1));
  return forms;
}

/**
 * Whether an aircraft matches a spoken class filter ("helicopter", "tanker").
 * A class word ("turboprop", "widebody", "drone", "unknown") matches only its
 * class, even where it also names a category. A category's word ("regional",
 * "ground", "other") matches every class in that Flights category, so an
 * untyped contact matches "other" and "unknown" only. Any other word matches
 * part of the class or type fields. No filter matches everything; an
 * aircraft with no class or type matches no filter.
 * @param {object} item Aircraft summary (`getNearby` row or cohort item).
 * @param {string|null} aircraftClass Requested class.
 * @returns {boolean}
 */
export function aircraftClassMatches(item, aircraftClass) {
  const normalize = (value) =>
    String(value || '')
      .trim()
      .toLowerCase();
  const word = normalize(aircraftClass);
  if (!word) return true;
  // A word with no Latin letters or digits ("вертолёт") names no class or
  // category here; it can still match part of a type field.
  const requested = compactWord(aircraftClass);
  if (requested) {
    const classes = [item?.aircraftClass, item?.klass]
      .map(compactWord)
      .filter(Boolean);
    const forms = wordForms(requested);
    if (
      classes.some((klass) =>
        forms.some(
          (form) => klass === form || CLASS_WORDS.get(form)?.has(klass),
        ),
      )
    )
      return true;
    const category = forms
      .map((form) => CATEGORY_WORDS.get(form))
      .find(Boolean);
    if (category) {
      if (forms.some((form) => CLASS_WORDS.has(form))) return false;
      return classes.some((klass) => aircraftCategory(klass) === category);
    }
  }
  return [
    item?.aircraftClass,
    item?.klass,
    item?.type,
    item?.typeCode,
    item?.typeName,
  ]
    .map(normalize)
    .filter((candidate) => candidate && candidate !== 'unknown')
    .some((candidate) => candidate.includes(word));
}

/**
 * Search an expanding area synchronously, doubling the radius after each miss.
 * The maximum covers the farthest possible Earth-surface chord while keeping
 * an empty feed bounded.
 *
 * @template T
 * @param {(radiusM: number) => T|null|undefined} search Search callback.
 * @param {{initialRadiusM?: number, maxRadiusM?: number}} [options] Bounds.
 * @returns {{candidate: T, radiusM: number}|null} First match and radius used.
 */
export function findByDoublingRadius(
  search,
  {
    initialRadiusM = AWARENESS_RADIUS_M,
    maxRadiusM = AWARENESS_MAX_FLIGHT_SEARCH_RADIUS_M,
  } = {},
) {
  if (typeof search !== 'function') return null;
  if (!Number.isFinite(initialRadiusM) || initialRadiusM <= 0) return null;
  if (!Number.isFinite(maxRadiusM) || maxRadiusM < initialRadiusM) return null;

  let radiusM = initialRadiusM;
  while (radiusM <= maxRadiusM) {
    const candidate = search(radiusM);
    if (candidate) return { candidate, radiusM };
    if (radiusM === maxRadiusM) break;
    radiusM = Math.min(radiusM * 2, maxRadiusM);
  }
  return null;
}

/** @param {number} meters @returns {string} */
export function formatAwarenessDistance(meters) {
  return formatDistanceText(meters) ?? '—';
}

/**
 * Return a stable visible label without leaking missing values into UI text.
 * The English name the data gives an unnamed installation ("Military area")
 * is shown in the UI language; mapped names and callsigns show as they are.
 */
export function formatAwarenessLabel(value) {
  if (value && typeof value === 'object') {
    for (const candidate of [
      value.callsign,
      value.name,
      value.label,
      value.mmsi,
      value.id,
      value.icao24,
    ]) {
      const label = formatAwarenessLabel(candidate);
      if (label !== '—') return label;
    }
    return '—';
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return '—';
    return UNNAMED_NAMES.has(text) ? t(text) : text;
  }
  if (Number.isFinite(value)) return String(value);
  return '—';
}

/**
 * Summarize sorted nearby results without promoting missing/stale feeds to a
 * negative finding. `UNKNOWN` is an input-data state, never an out-of-range
 * claim in this MVP. `reason` is English data; the awareness panel shows it
 * in the UI language.
 */
export function summarizeAwarenessCohort(
  items,
  { available = true, stale = false, limit = 3 } = {},
) {
  if (!available)
    return {
      relationship: AWARENESS_RELATIONSHIP.UNKNOWN,
      count: null,
      nearest: [],
      reason: msg('feed unavailable'),
    };
  if (stale)
    return {
      relationship: AWARENESS_RELATIONSHIP.UNKNOWN,
      count: null,
      nearest: [],
      reason: msg('feed stale'),
    };
  const normalized = (Array.isArray(items) ? items : [])
    .filter(
      (item) =>
        Number.isFinite(item?.distanceM ?? item?.distance) &&
        (item.distanceM ?? item.distance) >= 0,
    )
    .map((item) => ({ ...item, distanceM: item.distanceM ?? item.distance }))
    .sort((a, b) => a.distanceM - b.distanceM);
  return {
    relationship: normalized.length
      ? AWARENESS_RELATIONSHIP.NEARBY
      : AWARENESS_RELATIONSHIP.UNKNOWN,
    count: normalized.length,
    nearest: normalized.slice(0, limit),
    reason: normalized.length
      ? msg('observed or mapped nearby context')
      : msg('no observed or mapped objects in current feeds'),
  };
}

/**
 * Return selectable nearby targets in a stable, subject-first order.
 * @param {Array<{id: string, summary?: {nearest?: Array<Object>}}>} cohorts Awareness cohorts.
 * @param {{layerId?: string}|null} [subject] Current subject.
 * @param {Iterable<string>} [visitedKeys] Previously visited layer/id keys.
 * @returns {Array<{layerId: string, id: string, item: Object}>} Selectable targets.
 */
export function getAwarenessNavigationTargets(
  cohorts,
  subject = null,
  visitedKeys = [],
) {
  const visited = new Set(visitedKeys);
  const targets = [];
  for (const cohort of Array.isArray(cohorts) ? cohorts : []) {
    const layerId = cohort?.id;
    if (
      ![
        'flights',
        'military',
        'ais-live-vessels',
        'military-installations',
      ].includes(layerId)
    )
      continue;
    const sourceItems = Array.isArray(cohort?.summary?.navigationNearest)
      ? cohort.summary.navigationNearest
      : Array.isArray(cohort?.summary?.nearest)
        ? cohort.summary.nearest
        : [];
    for (const item of sourceItems) {
      const id = item?.icao24 || item?.id || item?.mmsi;
      if (!id) continue;
      const key = `${layerId}:${id}`;
      if (key === `${subject?.layerId}:${subject?.id}`) continue;
      targets.push({
        layerId,
        id: String(id),
        item,
        visited: visited.has(key),
      });
    }
  }
  targets.sort((a, b) => {
    // UNVISITED outranks layer affinity. Ordering subject-layer first put
    // already-visited same-layer contacts ahead of unvisited contacts in every
    // other layer, so NEXT ping-ponged inside the subject's own layer and never
    // reached vessels, installations, or the other flight layer at all.
    const visitedOrder = Number(a.visited) - Number(b.visited);
    if (visitedOrder) return visitedOrder;
    const subjectOrder =
      Number(a.layerId !== subject?.layerId) -
      Number(b.layerId !== subject?.layerId);
    if (subjectOrder) return subjectOrder;
    return (a.item.distanceM ?? Infinity) - (b.item.distanceM ?? Infinity);
  });
  return targets;
}
