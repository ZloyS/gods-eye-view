/** A readsb rate field: a finite JSON number, else null. */
function rateField(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Vertical rate in ft/min from a readsb-style aircraft row (readsb, tar1090,
 * adsb.lol): the barometric `baro_rate`, else the GNSS-sourced `geom_rate`
 * readsb sends instead when it has no barometric rate. A barometric 0 is kept.
 * Only a finite number counts; null when neither field has one.
 * @param {object|null|undefined} row
 * @returns {number|null}
 */
export function readAdsbVerticalRateFpm(row) {
  return rateField(row?.baro_rate) ?? rateField(row?.geom_rate);
}

/** Faster than this (knots), a C0 ground row is moving: a vehicle, not a fixed transmitter. */
const GROUND_TRANSMITTER_MAX_GS_KT = 2;

/**
 * Whether a readsb-style aircraft row (readsb, tar1090, adsb.lol) is a ground
 * transmitter: a non-transponder emitter (message type `adsb_icao_nt`) of
 * emitter category C0 (no information), reported on the ground and standing
 * still (no ground speed, or at most 2 kt).
 * @param {object|null|undefined} row
 * @returns {boolean}
 */
export function isReadsbGroundTransmitter(row) {
  return (
    row?.type === 'adsb_icao_nt' &&
    typeof row.category === 'string' &&
    row.category.trim().toUpperCase() === 'C0' &&
    row.alt_baro === 'ground' &&
    !(
      typeof row.gs === 'number' &&
      Number.isFinite(row.gs) &&
      row.gs > GROUND_TRANSMITTER_MAX_GS_KT
    )
  );
}

/** OpenSky's ICAO address, including contacts that have no current fix. */
export function openSkyAircraftId(row) {
  return Array.isArray(row) && typeof row[0] === 'string'
    ? row[0].trim().toLowerCase()
    : '';
}

/** The ICAO address of a state vector with a plottable position. */
export function positionedOpenSkyAircraftId(row) {
  if (!Array.isArray(row)) return '';
  const lon = row[5];
  const lat = row[6];
  if (!Number.isFinite(lon) || Math.abs(lon) > 180) return '';
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return '';
  return openSkyAircraftId(row);
}
