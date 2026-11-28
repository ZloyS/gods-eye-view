/**
 * @module vesselTypes
 * @description AIS ship-type codes (ITU-R M.1371) to family names, with no
 * browser or i18n dependencies so the server-side query tools can use it.
 */

const NUMERIC_TYPE_SPECIALS = {
  30: 'FISHING',
  31: 'TOWING',
  32: 'TOWING',
  33: 'DREDGER',
  34: 'DIVE OPS',
  35: 'MILITARY',
  36: 'SAILING',
  37: 'PLEASURE',
  50: 'PILOT',
  51: 'SAR',
  52: 'TUG',
  53: 'PORT TENDER',
  54: 'ANTI-POLLUTION',
  55: 'LAW ENFORCE',
  58: 'MEDICAL',
};
const NUMERIC_TYPE_FAMILIES = {
  4: 'HIGH-SPEED',
  6: 'PASSENGER',
  7: 'CARGO',
  8: 'TANKER',
  9: 'OTHER',
};

/**
 * Resolve an AIS type to display text: bare numeric ship-type codes map to
 * family names ("71" → "CARGO"); text types pass through unchanged. Code 0
 * ("not available") and the reserved codes 100 to 255 name no type and
 * resolve to "".
 * @param {string} type Raw AIS type.
 * @returns {string}
 */
export function normalizeVesselType(type) {
  const text = String(type || '').trim();
  if (!text || !/^\d+$/.test(text)) return text;
  const code = Number(text);
  if (code <= 0 || code >= 100) return '';
  if (NUMERIC_TYPE_SPECIALS[code]) return NUMERIC_TYPE_SPECIALS[code];
  return NUMERIC_TYPE_FAMILIES[Math.floor(code / 10)] || 'OTHER';
}

/**
 * The vessel kinds a ship is drawn as, each with its own hull sprite and
 * colour (`vesselSprites.js`), by the type family its AIS type resolves to
 * ({@link normalizeVesselType}), in order: the first that matches.
 */
const VESSEL_KIND_RULES = [
  ['tanker', /tanker|\blng\b|\blpg\b|gas carrier/i],
  ['highspeed', /high[- ]?speed|\bhsc\b/i],
  ['passenger', /passenger|ferry|cruise/i],
  ['cargo', /cargo|container|bulk|carrier|freighter|ro-?ro/i],
  ['fishing', /fishing|trawler/i],
  [
    'military',
    /military|naval|navy|warship|law enforce|police|patrol|coast ?guard|\bsar\b|search and rescue/i,
  ],
  ['tug', /tug|tow|pilot|tender|supply|service|anti-pollution/i],
  ['sailing', /sail/i],
  ['pleasure', /pleasure|yacht/i],
];

/** Every vessel kind {@link vesselKind} names, `other` last. */
export const VESSEL_KINDS = Object.freeze([
  ...VESSEL_KIND_RULES.map(([kind]) => kind),
  'other',
]);

/**
 * Each vessel kind's colour on the map and on its card, as CSS and as the
 * card's "r, g, b" accent. Every one reads on dark water and differs from
 * the rest; cargo and other share the default cyan.
 */
export const VESSEL_KIND_STYLES = Object.freeze({
  cargo: Object.freeze({ css: '#39d5ff', accent: '57, 213, 255' }),
  tanker: Object.freeze({ css: '#ffb347', accent: '255, 179, 71' }),
  passenger: Object.freeze({ css: '#ff7adf', accent: '255, 122, 223' }),
  highspeed: Object.freeze({ css: '#c6ff3d', accent: '198, 255, 61' }),
  fishing: Object.freeze({ css: '#7cff9b', accent: '124, 255, 155' }),
  tug: Object.freeze({ css: '#f7f0a3', accent: '247, 240, 163' }),
  sailing: Object.freeze({ css: '#b49cff', accent: '180, 156, 255' }),
  pleasure: Object.freeze({ css: '#ff6f61', accent: '255, 111, 97' }),
  military: Object.freeze({ css: '#a9bccb', accent: '169, 188, 203' }),
  other: Object.freeze({ css: '#39d5ff', accent: '57, 213, 255' }),
});

/** Kind by type text: a feed uses few distinct type texts. */
const KIND_MEMO = new Map();
const KIND_MEMO_MAX = 1024;

/**
 * The kind of vessel an AIS type names, a numeric ship-type code (ITU-R
 * M.1371) or a text type: `cargo` (70 to 79), `tanker` (80 to 89),
 * `passenger` (60 to 69), `highspeed` (40 to 49), `fishing` (30), `tug`
 * (tugs, towing, pilots, tenders, anti-pollution: 31, 32, 50, 52 to 54),
 * `sailing` (36), `pleasure` (37), `military` (military, law enforcement,
 * search and rescue: 35, 55, 51) or `other` (anything else, unknown types
 * included).
 * @param {string|number|null|undefined} type
 * @returns {string} One of {@link VESSEL_KINDS}.
 */
export function vesselKind(type) {
  const text = normalizeVesselType(type);
  let kind = KIND_MEMO.get(text);
  if (kind !== undefined) return kind;
  kind = VESSEL_KIND_RULES.find(([, pattern]) => pattern.test(text))?.[0];
  kind ??= 'other';
  if (KIND_MEMO.size >= KIND_MEMO_MAX) KIND_MEMO.clear();
  KIND_MEMO.set(text, kind);
  return kind;
}

/**
 * The kind of aid to navigation an AIS aid-to-navigation report (message 21)
 * names by its type code, 0 to 31 (ITU-R M.1371, IALA marks): beacons and
 * floating marks by their cardinal quadrant, lateral side, safe water,
 * isolated danger or special mark, and the lights, RACONs and reference
 * points around them. Code 0 names no kind.
 */
const AID_TYPE_NAMES = Object.freeze([
  'Navigation aid',
  'Reference point',
  'RACON',
  'Fixed structure off shore',
  'Emergency wreck marking buoy',
  'Light, without sectors',
  'Light, with sectors',
  'Leading light front',
  'Leading light rear',
  'Beacon, Cardinal N',
  'Beacon, Cardinal E',
  'Beacon, Cardinal S',
  'Beacon, Cardinal W',
  'Beacon, Port hand',
  'Beacon, Starboard hand',
  'Beacon, Preferred channel port hand',
  'Beacon, Preferred channel starboard hand',
  'Beacon, Isolated danger',
  'Beacon, Safe water',
  'Beacon, Special mark',
  'Cardinal Mark N',
  'Cardinal Mark E',
  'Cardinal Mark S',
  'Cardinal Mark W',
  'Port hand Mark',
  'Starboard hand Mark',
  'Preferred Channel Port hand',
  'Preferred Channel Starboard hand',
  'Isolated danger',
  'Safe Water',
  'Special Mark',
  'Light Vessel / LANBY / Rigs',
]);

/**
 * The kind an AIS aid-to-navigation type code names ("19" → "Beacon, Special
 * mark"); "Navigation aid" for code 0 and for a code outside 0 to 31.
 * @param {string|number|null|undefined} code
 * @returns {string}
 */
export function aidToNavigationTypeName(code) {
  const text = String(code ?? '').trim();
  const index = /^\d+$/.test(text) ? Number(text) : -1;
  return AID_TYPE_NAMES[index] ?? AID_TYPE_NAMES[0];
}

/**
 * Every kind {@link aidToNavigationTypeName} names, lowercased with its
 * punctuation and spacing folded: feeds spell them several ways ("Light
 * without sectors", "Light Vessel/LANBY/Rigs").
 */
const AID_TYPE_NAME_SET = new Set(AID_TYPE_NAMES.map(aidNameKey));

function aidNameKey(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Words a vessel type uses for an aid to navigation, a lightship, light vessel
 * or LANBY among them. A vessel that works on one ("Buoy Tender",
 * "Lightship Tender", "Buoy-Laying Vessel", "Buoy Layer") is a ship underway,
 * not a mark on the water.
 */
const AID_TYPE_TEXT =
  /navaid|\baton\b|aids? to nav|nav(igation)? aid|racon|lighthouse|lightship|light[- ]?vessel|\blanby\b|reference point|hand mark|cardinal|safe water|preferred channel|isolated danger|special mark|beacon|buoy/i;
const AID_WORKER_TEXT = /tender|lay(ing|er)\b/i;

/**
 * Words a type uses for a station that is not a vessel: a vessel traffic
 * service, an AIS base or coast station, a fixed station, or a helicopter
 * landing platform.
 */
const STATION_TYPE_TEXT =
  /\bvts\b|vessel traffic serv|base station|coast(al)? station|shore station|fixed station|helicopter landing platform|helipad|heliport/i;

/**
 * Words a type uses for an offshore platform: a platform or rig, a jack-up,
 * a fixed offshore structure. A vessel that serves or moves one ("Platform
 * Supply Vessel", "Rig Supply Ship", "Jack Up Barge", "Rig Mover", "Anchor
 * Handling Rig") is a ship, and so is a landing platform dock.
 */
const PLATFORM_TEXT =
  /\b(platforms?|rigs?|jack[- ]?up|off ?shore structure|fixed structure|steady object)\b/i;
const PLATFORM_WORKER_TEXT =
  /supply|support|vessel|ship|boat|tender|tug|crew|landing|dock|barge|mover|anchor|handling|installation/i;

/**
 * The aid kinds an aid-to-navigation report names for a platform: type code
 * 3 ("Fixed structure off shore") and 31 ("Light Vessel / LANBY / Rigs").
 * Either also marks a wind-farm turbine or substation.
 */
const PLATFORM_AID_NAMES = new Set(
  [AID_TYPE_NAMES[3], AID_TYPE_NAMES[31]].map(aidNameKey),
);

/**
 * Whether a type is the aid kind of a platform ({@link PLATFORM_AID_NAMES}).
 * @param {string|number|null|undefined} type
 * @returns {boolean}
 */
export function isPlatformAid(type) {
  return PLATFORM_AID_NAMES.has(aidNameKey(typeText(type)));
}

/**
 * MMSI prefixes of what is not a vessel (ITU-R M.585), read on the
 * nine-digit MMSI ({@link normalizeMmsi}); MIDs run from 201 to 775:
 * 00MIDxxxx a coast or AIS base station, 99MIDxxxx an aid to navigation,
 * 111MIDxxx a search-and-rescue aircraft, and 970xxyyyy, 972xxyyyy and
 * 974xxyyyy an AIS-SART, a man-overboard device and an EPIRB.
 */
const NON_VESSEL_MMSI = Object.freeze([
  ['station', /^00[2-7]\d{6}$/],
  ['aid', /^99\d{7}$/],
  ['aircraft', /^111[2-7]\d{5}$/],
  ['beacon', /^97[024]\d{6}$/],
]);

/**
 * An MMSI as its nine digits. A feed that passes the MMSI on as a number
 * drops its leading zeros: a coast station's 00MIDxxxx arrives with seven
 * digits and a group's 0MIDxxxxx with eight, so those are padded back.
 * Anything else comes back trimmed.
 * @param {string|number|null|undefined} mmsi
 * @returns {string}
 */
export function normalizeMmsi(mmsi) {
  const text = mmsi === null || mmsi === undefined ? '' : String(mmsi).trim();
  return /^\d{7,8}$/.test(text) ? text.padStart(9, '0') : text;
}

/**
 * The non-vessel kind each type text seen names, or null. Vessel layers ask
 * per vessel on their draw passes, and a feed uses few distinct type texts,
 * so each is matched once; the memo is bounded against a feed of free-form
 * types.
 */
const MARK_TYPE_MEMO = new Map();
const MARK_TYPE_MEMO_MAX = 1024;

function typeNamesMark(text) {
  let kind = MARK_TYPE_MEMO.get(text);
  if (kind !== undefined) return kind;
  kind = null;
  if (STATION_TYPE_TEXT.test(text)) kind = 'station';
  else if (
    PLATFORM_AID_NAMES.has(aidNameKey(text)) ||
    (PLATFORM_TEXT.test(text) && !PLATFORM_WORKER_TEXT.test(text))
  )
    kind = 'platform';
  else if (
    AID_TYPE_NAME_SET.has(aidNameKey(text)) ||
    (AID_TYPE_TEXT.test(text) && !AID_WORKER_TEXT.test(text))
  )
    kind = 'aid';
  if (MARK_TYPE_MEMO.size >= MARK_TYPE_MEMO_MAX) MARK_TYPE_MEMO.clear();
  MARK_TYPE_MEMO.set(text, kind);
  return kind;
}

const typeText = (type) =>
  typeof type === 'string' ? type.trim() : String(type ?? '').trim();

/** "STEADY OBJECT" given as the whole destination: what a fixed platform sends. */
const STEADY_OBJECT_DESTINATION = /^steady object$/i;

/** The AIS ship-type code (1 to 99) in `type` or `typeBroad`, else null. */
function shipTypeCode(type, typeBroad) {
  for (const value of [type, typeBroad]) {
    const text = typeText(value);
    if (!/^\d+$/.test(text)) continue;
    const code = Number(text);
    if (code > 0 && code < 100) return code;
  }
  return null;
}

/** Whether `type` or `typeBroad` is text that names a type ("unknown" does not). */
function namesTypeText(type, typeBroad) {
  return [type, typeBroad].some((value) => {
    const text = typeText(value);
    return text !== '' && !/^\d+$/.test(text) && !UNKNOWN_TYPE_TEXT.test(text);
  });
}

/**
 * Whether a text type names a vessel: a category rule places it (`other`, which
 * also holds "reserved" and "spare", does not count), or it is a vessel that
 * works on a platform or an aid ("Platform Supply Vessel", "Buoy Tender").
 */
function typeNamesVessel(text) {
  const category = textCategory(text);
  return (
    (Boolean(category) && category !== 'other') ||
    (PLATFORM_TEXT.test(text) && PLATFORM_WORKER_TEXT.test(text)) ||
    (AID_TYPE_TEXT.test(text) && AID_WORKER_TEXT.test(text))
  );
}

/**
 * What a vessel record is when it is not a vessel, else null: `aid` (an aid
 * to navigation: a buoy, beacon, mark, RACON, light, lightship or LANBY),
 * `station` (a vessel traffic service, an AIS base or coast station, or a
 * helicopter landing platform), `platform` (an offshore platform or rig, or
 * a fixed offshore structure), `aircraft` (a search-and-rescue
 * aircraft) or `beacon` (a distress beacon: an AIS-SART, man-overboard device
 * or EPIRB). In order: a distress beacon's MMSI prefix; a station's, aid's or
 * SAR aircraft's MMSI prefix, unless the row carries an AIS ship-type code (1
 * to 99), which only a ship's own reports carry; a virtual aid; the words of
 * the detailed type (`type`), then the broad type (`typeBroad`), where a type
 * that names a vessel ends the search; on a row that names no type, a
 * destination of exactly "STEADY OBJECT", which a platform sends. An aid
 * whose type is a platform's aid kind (codes 3 and 31) is a platform, and
 * platform words never overrule a ship-type code. SAR aircraft and distress
 * beacons are known by their MMSI only. A numeric AIS ship type never names
 * one.
 * @param {{type?: string|number|null, typeBroad?: string|null,
 *   mmsi?: string|number|null, destination?: string|null,
 *   virtual?: boolean}} [vessel]
 * @returns {'aid'|'station'|'platform'|'aircraft'|'beacon'|null}
 */
export function nonVesselKind({
  type,
  typeBroad,
  mmsi,
  destination,
  virtual,
} = {}) {
  const number = normalizeMmsi(mmsi);
  const prefix = number
    ? (NON_VESSEL_MMSI.find(([, pattern]) => pattern.test(number))?.[0] ?? null)
    : null;
  if (prefix === 'beacon') return prefix;
  const code = shipTypeCode(type, typeBroad);
  if (prefix && code === null)
    return prefix === 'aid' && isPlatformAid(type) ? 'platform' : prefix;
  if (virtual === true) return isPlatformAid(type) ? 'platform' : 'aid';
  for (const value of [type, typeBroad]) {
    const text = typeText(value);
    if (!text || /^\d+$/.test(text)) continue;
    const kind = typeNamesMark(text);
    if (kind === 'platform' && code !== null) return null;
    if (kind) return kind;
    // A type that names a vessel is not overruled by a broader one.
    if (typeNamesVessel(text)) return null;
  }
  if (
    code === null &&
    !namesTypeText(type, typeBroad) &&
    STEADY_OBJECT_DESTINATION.test(String(destination ?? '').trim())
  )
    return 'platform';
  return null;
}

/**
 * Whether a vessel record is an aid to navigation (a buoy, beacon, mark,
 * RACON or light) rather than a vessel or a station: its MMSI is an
 * aid-to-navigation station's, it is a virtual aid, or its type is one of
 * the kinds an aid report names or uses a word for one
 * ({@link nonVesselKind}).
 * @param {{type?: string|number|null, mmsi?: string|number|null,
 *   virtual?: boolean}} vessel
 * @returns {boolean}
 */
export function isAidToNavigation(vessel = {}) {
  return nonVesselKind(vessel) === 'aid';
}

/**
 * Whether a record is a vessel: not an aid, station, platform, aircraft or
 * beacon ({@link nonVesselKind}). Vessel counts and ship models take only these.
 * @param {object} [vessel]
 * @returns {boolean}
 */
export function isVessel(vessel = {}) {
  return nonVesselKind(vessel) === null;
}

/**
 * Whether a non-vessel's type text says what it is: text, not a ship-type
 * code or "unknown", that names its kind `mark` or nothing else. A card
 * shows such text ("MANNED VTS", "EPIRB") in place of the kind's word, and
 * not text that names a vessel or another kind ("Cargo" on a beacon).
 * @param {string|number|null|undefined} type
 * @param {'aid'|'station'|'platform'|'aircraft'|'beacon'} mark
 * @returns {boolean}
 */
export function typeTextFitsMark(type, mark) {
  const text = typeText(type);
  if (!text || /^\d+$/.test(text) || UNKNOWN_TYPE_TEXT.test(text)) return false;
  const named = typeNamesMark(text);
  if (named) return named === mark;
  return textCategory(text) === null;
}

/**
 * The functional categories a vessel layer shows or hides, in panel order.
 * `service` holds tugs and port service, offshore and work vessels, and
 * government and safety (with search-and-rescue aircraft and distress
 * beacons); `other` holds types no rule places, no type at all, and what is
 * not a vessel and stays put (aids to navigation, stations and platforms).
 */
export const VESSEL_CATEGORIES = Object.freeze([
  'tankers',
  'cargo',
  'passenger',
  'fishing',
  'service',
  'leisure',
  'other',
]);

/** Each category shown or not when nothing chose: every one shown. */
export const DEFAULT_VESSEL_CATEGORY_VISIBILITY = Object.freeze(
  Object.fromEntries(VESSEL_CATEGORIES.map((category) => [category, true])),
);

const NON_VESSEL_CATEGORIES = Object.freeze({
  aid: 'other',
  station: 'other',
  platform: 'other',
  aircraft: 'service',
  beacon: 'service',
});

/**
 * Category by the words of a text type, the first that matches. Datalastic
 * publishes no fixed list of detailed types, so these are word rules, not
 * names. Every tanker (crude, products, chemical, gas, bunkering, asphalt,
 * FSO and FPSO) is a tanker, ahead of the cargo words a broad type carries.
 */
const CATEGORY_TEXT_RULES = [
  [
    'tankers',
    /tanker|tank[- ]?barge|\bcrude\b|\blng\b|\blpg\b|gas carrier|bunker|\bfso\b|\bfpso\b|floating (storage|production)|oil (products|carrier)|chemical carrier|\boiler\b/i,
  ],
  [
    'service',
    /military|naval|navy|warship|aircraft carrier|frigate|corvette|destroyer|submarine|mine ?(sweeper|hunter)|law enforce|police|patrol|coast ?guard|customs|\bsar\b|search (and|&) rescue|rescue|medical|hospital|fire ?fight|non-?combatant/i,
  ],
  ['passenger', /passenger|ferry|cruise|high[- ]?speed|\bhsc\b/i],
  ['fishing', /fish|trawler|seiner|longliner/i],
  [
    'service',
    /dredg|hopper|diving|dive ops|pollution|oil recovery|supply|offshore|cable|pipe ?lay|crane|research|survey|drill|anchor handl|well stim|jack[- ]?up|work ?(boat|vessel|ship)|crew boat|buoy[- ](tender|lay)|salvage/i,
  ],
  ['service', /tug|tow|pilot|tender|ice ?breaker|pusher|port service|mooring/i],
  // A carrier of yachts is cargo: it goes on to the cargo words.
  ['leisure', /^(?!.*carrier).*(sail|pleasure|yacht|leisure|recreation)/i],
  [
    'other',
    /training|accommodation|wing in ground|\bwig\b|reserved|\blocal\b|spare|\bother\b/i,
  ],
  [
    'cargo',
    /cargo|container|bulk|carrier|freighter|ro-?ro|reefer|vehicle|heavy (lift|load)|timber|cement|livestock|barge|\bore\b/i,
  ],
];
/** A text type that names no type at all. */
const UNKNOWN_TYPE_TEXT =
  /^(unknown|unspecified|not available|n\/?a|none|undefined|-+|\?+)$/i;

/** Category by text type: a category, '' for no type, null for unplaced. */
const CATEGORY_MEMO = new Map();
const CATEGORY_MEMO_MAX = 1024;

function textCategory(text) {
  let category = CATEGORY_MEMO.get(text);
  if (category !== undefined) return category;
  category = UNKNOWN_TYPE_TEXT.test(text)
    ? ''
    : (CATEGORY_TEXT_RULES.find(([, pattern]) => pattern.test(text))?.[0] ??
      null);
  if (CATEGORY_MEMO.size >= CATEGORY_MEMO_MAX) CATEGORY_MEMO.clear();
  CATEGORY_MEMO.set(text, category);
  return category;
}

/**
 * Category by AIS ship-type code (ITU-R M.1371), 1 to 99. Wing-in-ground,
 * reserved and local codes, and 90 to 99, are `other`.
 */
function codeCategory(code) {
  if (code === 30) return 'fishing';
  if ([31, 32, 33, 34, 35, 50, 51, 52, 53, 54, 55, 58, 59].includes(code))
    return 'service';
  if (code === 36 || code === 37) return 'leisure';
  if ((code >= 40 && code < 50) || (code >= 60 && code < 70))
    return 'passenger';
  if (code >= 70 && code < 80) return 'cargo';
  if (code >= 80 && code < 90) return 'tankers';
  return 'other';
}

/**
 * The functional category of a vessel record, one of
 * {@link VESSEL_CATEGORIES}. Checked in order, the first that answers: what
 * it is when it is not a vessel ({@link nonVesselKind}: `other`, or
 * `service` for a search-and-rescue aircraft or a distress beacon); the
 * words of its detailed type (`type`, such as "Oil Products Tanker"); the
 * words of its broad type (`typeBroad`, such as "Cargo"); its AIS ship-type
 * code. A type no rule places, and no type at all, is `other`.
 * @param {{type?: string|number|null, typeBroad?: string|null,
 *   mmsi?: string|number|null, destination?: string|null,
 *   virtual?: boolean}} [vessel]
 * @returns {string}
 */
export function vesselCategory(vessel = {}) {
  const mark = nonVesselKind(vessel);
  if (mark) return NON_VESSEL_CATEGORIES[mark];
  let code = null;
  for (const value of [vessel.type, vessel.typeBroad]) {
    const text = typeText(value);
    if (!text) continue;
    if (/^\d+$/.test(text)) {
      code ??= Number(text);
      continue;
    }
    const category = textCategory(text);
    if (category) return category;
  }
  if (code !== null && code > 0 && code < 100) return codeCategory(code);
  return 'other';
}
