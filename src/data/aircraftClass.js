// src/data/aircraftClass.js
/**
 * Type-aware aircraft classification. ICAO type-designator sets adapted from
 * skylight (https://github.com/cpaczek/skylight, MIT) web/src/display/
 * aircraftGlyph.ts, extended with a fast-jet set for the military layer and
 * C17/K35R in the widebody set. Category fallbacks cover the OpenSky extended
 * integer category (states index 17) and ADS-B emitter strings ("A1".."B1").
 */

import { msg } from '../i18n/marker.js';

const HELI = new Set([
  'EC20',
  'EC25',
  'EC30',
  'EC35',
  'EC45',
  'EC55',
  'AS50',
  'AS55',
  'AS65',
  'AS32',
  'A109',
  'A119',
  'A139',
  'A169',
  'A189',
  'B06',
  'B06T',
  'B407',
  'B412',
  'B427',
  'B429',
  'B430',
  'B505',
  'S76',
  'S92',
  'S61',
  'S64',
  'H60',
  'H500',
  'MD52',
  'MD60',
  'R22',
  'R44',
  'R66',
  'EXEC',
  'EXPL',
  'GAZL',
  'LYNX',
  'NH90',
  'PUMA',
  'SCAV',
  'UH1',
  'B105',
  'B212',
  'B214',
  'B222',
  'AC',
  'H47',
  'H64',
  'H269',
  'B206',
  'EC75',
  'EH10',
  'H1',
  'TIGR',
  'V22',
  'GYRO',
  'H160',
  'AW09',
]);
const QUAD = new Set([
  'B741',
  'B742',
  'B743',
  'B744',
  'B748',
  'B74S',
  'B74R',
  'B74D',
  'A388',
  'A342',
  'A343',
  'A345',
  'A346',
  'A124',
  'C5M',
  'A225',
  'IL96',
  'B52',
  'E3TF',
  'E3CF',
  'IL62',
  'IL76',
  'B703',
]);
const WIDE = new Set([
  'A306',
  'A30B',
  'A310',
  'A332',
  'A333',
  'A338',
  'A339',
  'A359',
  'A35K',
  'B762',
  'B763',
  'B764',
  'B772',
  'B77L',
  'B773',
  'B77W',
  'B778',
  'B779',
  'B788',
  'B789',
  'B78X',
  'MD11',
  'IL86',
  'DC10',
  'L101',
  'A337',
  'B767',
  'B777',
  'B787',
  'C17',
  'K35R', // military heavies that read as widebodies
]);
const TPROP = new Set([
  'DH8A',
  'DH8B',
  'DH8C',
  'DH8D',
  'AT43',
  'AT44',
  'AT45',
  'AT46',
  'AT72',
  'AT73',
  'AT75',
  'AT76',
  'SF34',
  'SB20',
  'SW3',
  'SW4',
  'E110',
  'E120',
  'C208',
  'C212',
  'C408',
  'PC12',
  'B190',
  'BE20',
  'B350',
  'B300',
  'JS31',
  'JS32',
  'JS41',
  'D228',
  'D328',
  'F50',
  'F27',
  'ATP',
  'TBM7',
  'TBM8',
  'TBM9',
  'TBM0',
  'PC6',
  'C441',
  'C425',
  'DHC6',
  'DHC7',
  'C130',
  'AN12',
  'AN26',
  'AN32',
  'SH36',
  'CVLT',
  'SAAB',
  'A400',
  'C30J',
  'F406',
  'SC7',
  'BE9L',
  'BE10',
  'C27J',
  'A140',
  'P46T',
  'BE30',
  'P180',
  'EPIC',
  'TEX2',
  'PC21',
  'PC9',
  'PC7',
  'T6',
  'BT7',
  'PC6T',
  'L410',
  'Y12',
  'AN24',
  'CN35',
  'C295',
]);
const GLIDER = new Set([
  'DISC',
  'DUOD',
  'VENT',
  'NIMB',
  'NIM3',
  'NIM4',
  'JANS',
  'ARCE',
  'DG40',
  'DG80',
  'DG1T',
  'DG30',
  'DG50',
  'LS3',
  'LS4',
  'LS6',
  'LS7',
  'LS8',
  'STD3',
  'G103',
  'G102',
  'G104',
  'PW5',
  'PW6',
  'L13',
  'L23',
  'L33',
  'PIK',
  'PEGA',
  'KEST',
  'TWIN',
  'AS33',
  'ASW',
  'ASG',
  'ASK',
  'VENS',
  'GLID',
  'MOSQ',
  'DIMO',
  'GLIM',
  'SLG2',
  'SLG4',
]);
const LIGHT = new Set([
  'C150',
  'C152',
  'C162',
  'C172',
  'C72R',
  'C175',
  'C177',
  'C180',
  'C182',
  'C185',
  'C188',
  'C206',
  'C207',
  'C210',
  'C310',
  'C337',
  'SR20',
  'SR22',
  'S22T',
  'PA18',
  'PA24',
  'PA28',
  'P28A',
  'P28B',
  'P28R',
  'PA32',
  'P32R',
  'PA34',
  'PA38',
  'PA44',
  'PA46',
  'DA20',
  'DA40',
  'DA42',
  'DA62',
  'BE33',
  'BE35',
  'BE36',
  'BE58',
  'BE76',
  'BE19',
  'BE23',
  'BE24',
  'M20P',
  'M20T',
  'AA1',
  'AA5',
  'GLAS',
  'COL4',
  'RV4',
  'RV6',
  'RV7',
  'RV8',
  'RV9',
  'RV10',
  'RV14',
  'GA8',
  'G115',
  'BL8',
  'CH7',
  'C140',
  'C402',
  'C77R',
  'T206',
  'T210',
  'PA11',
  'PA22',
  'PA30',
  'PA31',
  'BE55',
  'BE95',
  'TB20',
  'DV20',
  'M7',
  'ERCO',
  'RV12',
  'XL2',
  'WT9',
  'CH7A',
  'CH7B',
  'DHC1',
  'T34P',
  'LNP4',
  'PISI',
  'PIAT',
  'P06T',
  'P208',
  'P212',
  'P68',
  'BN2P',
  'C170',
  'C82R',
  'C82S',
  'C82T',
  'C414',
  'C421',
  'PA23',
  'BE50',
  'AC68',
  'GA7',
  'C320',
  'TB30',
  'PIVI',
  'ULAC',
  'DHC2',
  'DHC3',
]);
// GEV addition (2026-08-15 Hangar fleet): business jets — distinct class so the
// Citation II GLB + a slimmer glyph read apart from airliners.
const BIZJET = new Set([
  'C500',
  'C501',
  'C510',
  'C525',
  'C25A',
  'C25B',
  'C25C',
  'C25M',
  'C550',
  'C551',
  'C560',
  'C56X',
  'C650',
  'C680',
  'C68A',
  'C700',
  'C750',
  'CL30',
  'CL35',
  'CL60',
  'GLF2',
  'GLF3',
  'GLF4',
  'GLF5',
  'GLF6',
  'GA5C',
  'GA6C',
  'G150',
  'G280',
  'GL5T',
  'GL7T',
  'GLEX',
  'LJ23',
  'LJ24',
  'LJ25',
  'LJ31',
  'LJ35',
  'LJ40',
  'LJ45',
  'LJ55',
  'LJ60',
  'LJ70',
  'LJ75',
  'FA10',
  'FA20',
  'FA50',
  'FA7X',
  'FA8X',
  'F900',
  'F2TH',
  'H25A',
  'H25B',
  'H25C',
  'HDJT',
  'E50P',
  'E55P',
  'E545',
  'E550',
  'PC24',
  'PRM1',
  'BE40',
  'ASTR',
  'WW24',
  'SF50', // Cirrus Vision Jet — a JET (was mis-set in LIGHT before the bizjet class existed)
  'C55B',
  'E35L',
  'EA50',
  'GALX',
  'FA6X',
]);
// Narrow-body jets.
const AIRLINER = new Set([
  'A318',
  'A319',
  'A320',
  'A321',
  'A19N',
  'A20N',
  'A21N',
  'BCS1',
  'BCS3',
  'B712',
  'B721',
  'B722',
  'B731',
  'B732',
  'B733',
  'B734',
  'B735',
  'B736',
  'B737',
  'B738',
  'B739',
  'B37M',
  'B38M',
  'B39M',
  'B3XM',
  'B752',
  'B753',
  'DC85',
  'DC86',
  'DC87',
  'DC91',
  'DC92',
  'DC93',
  'DC94',
  'DC95',
  'MD81',
  'MD82',
  'MD83',
  'MD87',
  'MD88',
  'MD90',
  'C919',
  'MC23',
  'YK42',
  'T134',
  'T154',
  'T204',
  'P8',
]);
// Regional jets: their own class under Regional, drawn and named as airliners.
const REGIONAL_JET = new Set([
  'E135',
  'E145',
  'E45X',
  'E170',
  'E75L',
  'E75S',
  'E190',
  'E195',
  'E290',
  'E295',
  'CRJ1',
  'CRJ2',
  'CRJ7',
  'CRJ9',
  'CRJX',
  'F28',
  'F70',
  'F100',
  'B461',
  'B462',
  'B463',
  'RJ70',
  'RJ85',
  'RJ1H',
  'SU95',
  'AJ27',
  'J328',
  'A148',
  'A158',
  'YK40',
  'E275',
]);
// Lighter-than-air: balloons and airships.
const BALLOON = new Set(['BALL', 'SHIP']);
// GEV addition (2026-08-15 Hangar fleet): large UAVs — ICAO designators seen on
// ADS-B/adsb.lol for Predator/Reaper/Global Hawk-class airframes.
const UAV = new Set([
  'Q1',
  'Q4',
  'Q9',
  'MQ1',
  'MQ4',
  'MQ9',
  'RQ4',
  'TB2',
  'SHDW',
  'HERN',
  'DRON',
]);
// GEV addition: fast jets, for the military layer's adsb.lol `t` codes.
const FASTJET = new Set([
  'F16',
  'F15',
  'F18',
  'FA18',
  'F14',
  'F22',
  'F35',
  'F4',
  'F5',
  'A10',
  'AV8B',
  'TYPH',
  'EUFI',
  'RFAL',
  'RAFL',
  'GRIP',
  'JAS39',
  'TOR',
  'MIR2',
  'M2000',
  'SU27',
  'SU30',
  'SU33',
  'SU34',
  'SU35',
  'SU57',
  'MG29',
  'MIG29',
  'MG31',
  'J20',
  'T38',
  'HAWK',
  'L39',
  'M346',
  'T7A',
  'F18S',
  'T45',
]);

/** OpenSky extended-states integer category → class. */
const OPENSKY_CATEGORY = {
  2: 'light', // Light (< 15 500 lbs)
  3: 'airliner', // Small
  4: 'airliner', // Large
  5: 'airliner', // High-vortex large (B757)
  6: 'widebody', // Heavy
  7: 'fastjet', // High performance (>5g, >400 kt)
  8: 'helicopter', // Rotorcraft
  9: 'glider',
  10: 'balloon', // Lighter than air
  12: 'light', // Ultralight, hang glider, paraglider
  14: 'uav', // Unmanned aerial vehicle
  16: 'vehicle', // Surface vehicle, emergency
  17: 'vehicle', // Surface vehicle, service
  18: 'station', // Point obstacle
  19: 'station', // Cluster obstacle
  20: 'station', // Line obstacle
};

/** ADS-B emitter-category string → class. */
const EMITTER_CATEGORY = {
  A1: 'light',
  A2: 'light',
  A3: 'airliner',
  A4: 'airliner',
  A5: 'widebody',
  A6: 'fastjet',
  A7: 'helicopter',
  B1: 'glider',
  B2: 'balloon', // Lighter than air
  B4: 'light', // Ultralight, hang glider, paraglider
  B6: 'uav', // Unmanned aerial vehicle
  C1: 'vehicle', // Surface vehicle, emergency
  C2: 'vehicle', // Surface vehicle, service
  C3: 'station', // Point obstacle
  C4: 'station', // Cluster obstacle
  C5: 'station', // Line obstacle
};

/**
 * The type codes feeds give what is not an aircraft: an airport vehicle
 * (ZVEH) and a ground station (GRND, and the TWR and GND some feeds give a
 * fixed transmitter).
 */
const GROUND_TYPE_CLASS = {
  ZVEH: 'vehicle',
  GRND: 'station',
  TWR: 'station',
  GND: 'station',
};

/** The callsign of a fixed transmitter on an airfield (TXLU00, TXLU13). */
const TRANSMITTER_CALLSIGN = /^TXLU\d+$/;
/** The callsign of a test transmitter (ADSTEST, TEST, TEST1). */
const TEST_CALLSIGN = /^(?:ADS)?TEST\d*$/;

/**
 * Whether a contact is a fixed ground transmitter, whatever type a feed or a
 * lookup gives it: a TXLU transmitter by its callsign, a test transmitter
 * (callsign ADSTEST or TEST, alone or with digits) on the ground, or a contact
 * its feed reports as a ground transmitter (`transmitter`: readsb's emitter
 * category C0 and message type `adsb_icao_nt` on the ground).
 * @param {{callsign?: string|null, onGround?: boolean, transmitter?: boolean}} [contact]
 * @returns {boolean}
 */
export function isGroundTransmitter({ callsign, onGround, transmitter } = {}) {
  if (transmitter === true) return true;
  const sign = String(callsign || '')
    .trim()
    .toUpperCase();
  if (!sign) return false;
  return (
    TRANSMITTER_CALLSIGN.test(sign) ||
    (onGround === true && TEST_CALLSIGN.test(sign))
  );
}

/**
 * The class an aircraft draws and reads as. A test transmitter (callsign
 * ADSTEST or TEST, alone or with digits, on the ground) is a
 * `testtransmitter`, and any other ground transmitter
 * ({@link isGroundTransmitter}) a `station`, whatever its type. Otherwise its
 * ICAO type code decides, else its OpenSky integer or ADS-B emitter category.
 * Besides the aircraft classes, `vehicle` is an airport vehicle (type ZVEH,
 * emitter C1 or C2) and `station` a ground station or obstacle (type GRND,
 * TWR or GND, emitter C3 to C5). A type code in no set is `unknown`; only a
 * contact with no type falls back to its OpenSky or ADS-B emitter category,
 * and a contact with nothing to go on is `unknown` too.
 * @param {{typeCode?: string|null, category?: string|number|null,
 *   callsign?: string|null, onGround?: boolean, transmitter?: boolean}} [record]
 * @returns {string}
 */
export function classifyAircraft({
  typeCode,
  category,
  callsign,
  onGround,
  transmitter,
} = {}) {
  if (
    onGround === true &&
    TEST_CALLSIGN.test(
      String(callsign || '')
        .trim()
        .toUpperCase(),
    )
  )
    return 'testtransmitter';
  if (isGroundTransmitter({ callsign, onGround, transmitter }))
    return 'station';
  const code = String(typeCode || '')
    .trim()
    .toUpperCase();
  if (code) {
    if (GROUND_TYPE_CLASS[code]) return GROUND_TYPE_CLASS[code];
    if (FASTJET.has(code)) return 'fastjet';
    if (UAV.has(code)) return 'uav';
    if (HELI.has(code)) return 'helicopter';
    if (QUAD.has(code)) return 'quadjet';
    if (WIDE.has(code)) return 'widebody';
    if (AIRLINER.has(code)) return 'airliner';
    if (REGIONAL_JET.has(code)) return 'regionaljet';
    if (TPROP.has(code)) return 'turboprop';
    if (GLIDER.has(code)) return 'glider';
    if (BALLOON.has(code)) return 'balloon';
    if (BIZJET.has(code)) return 'bizjet';
    if (LIGHT.has(code)) return 'light';
    return 'unknown';
  }
  if (Number.isFinite(category) && OPENSKY_CATEGORY[category])
    return OPENSKY_CATEGORY[category];
  const cat = String(category || '')
    .trim()
    .toUpperCase();
  if (EMITTER_CATEGORY[cat]) return EMITTER_CATEGORY[cat];
  return 'unknown';
}

/**
 * A fixed ground station: drawn upright, never turned along a course.
 * @param {string|null|undefined} klass A {@link classifyAircraft} class.
 * @returns {boolean}
 */
export function isStationClass(klass) {
  return klass === 'station' || klass === 'testtransmitter';
}

/** Readable name of each class, for cards and readouts (English data). */
export const AIRCRAFT_CLASS_LABELS = Object.freeze({
  light: msg('Light aircraft'),
  glider: msg('Glider'),
  turboprop: msg('Turboprop'),
  airliner: msg('Airliner'),
  regionaljet: msg('Airliner'),
  widebody: msg('Widebody'),
  quadjet: msg('Four-engine jet'),
  helicopter: msg('Helicopter'),
  fastjet: msg('Fast jet'),
  bizjet: msg('Business jet'),
  uav: msg('Drone'),
  balloon: msg('Balloon'),
  vehicle: msg('Airport vehicle'),
  station: msg('Ground station / obstacle'),
  testtransmitter: msg('Test transmitter'),
  unknown: msg('Aircraft'),
});

/** The categories the Flights layer shows or hides, in row order. */
export const AIRCRAFT_CATEGORIES = Object.freeze([
  'airliners',
  'regional',
  'bizjets',
  'light',
  'helicopters',
  'ground',
  'other',
]);

/** The category of each class ({@link aircraftCategory}). */
const CLASS_CATEGORY = Object.freeze({
  airliner: 'airliners',
  widebody: 'airliners',
  quadjet: 'airliners',
  turboprop: 'regional',
  regionaljet: 'regional',
  bizjet: 'bizjets',
  light: 'light',
  helicopter: 'helicopters',
  vehicle: 'ground',
  station: 'ground',
  testtransmitter: 'ground',
  glider: 'other',
  balloon: 'other',
  fastjet: 'other',
  uav: 'other',
  unknown: 'other',
});

/**
 * The category a class belongs to; a class it does not know is `other`.
 * @param {string|null|undefined} klass A {@link classifyAircraft} class.
 * @returns {string} One of {@link AIRCRAFT_CATEGORIES}.
 */
export function aircraftCategory(klass) {
  return Object.hasOwn(CLASS_CATEGORY, klass) ? CLASS_CATEGORY[klass] : 'other';
}

/**
 * Each category's English name. The Flights row's chips show it through t()
 * with the `aircraft category` context (src/layers/flights/categories.js).
 */
export const AIRCRAFT_CATEGORY_LABELS = Object.freeze({
  airliners: 'Airliners',
  regional: 'Regional',
  bizjets: 'Business',
  light: 'Light',
  helicopters: 'Helicopters',
  ground: 'Ground',
  other: 'Other',
});

/**
 * The tint an airport vehicle's sprite draws with in Flights and Local
 * ADS-B: an orange amber, apart from aircraft white and the military layer's
 * yellow amber (#FFB800).
 */
export const VEHICLE_TINT_CSS = '#FF8F1F';
