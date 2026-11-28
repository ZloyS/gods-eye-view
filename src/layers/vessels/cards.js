import {
  NON_VESSEL_STYLES,
  accentForVesselType,
  displayVesselType,
  normalizeVesselType,
} from '../../data/vesselLabels.js';
import {
  nonVesselKind,
  normalizeMmsi,
  typeTextFitsMark,
} from '../../data/vesselTypes.js';
import { formatNumber, msg, t } from '../../i18n/index.js';
import { roundHeadingDegrees } from '../../data/headingDegrees.js';

/** A card's word for a record that is not a vessel and names no type. */
const MARK_WORDS = Object.freeze({
  aid: msg('AID TO NAVIGATION'),
  station: msg('COAST STATION'),
  platform: msg('PLATFORM'),
  aircraft: msg('SAR AIRCRAFT'),
  beacon: msg('DISTRESS BEACON'),
});

/** The device a distress beacon's MMSI prefix names (ITU-R M.585). */
const BEACON_DEVICES = Object.freeze({
  970: 'AIS-SART',
  972: 'MOB',
  974: 'EPIRB',
});

export function createCards({
  vesselState,
  services,
  parts: components,
  layer,
  options,
}) {
  function updateSelectedVesselHud(record) {
    // Pinned vessels missing from recent refreshes get a stale marker
    const stale = (record.missedRefreshes || 0) > 0;
    // A fixed mark (an aid, station, platform or beacon) has no speed or
    // heading to show; a search-and-rescue aircraft has both.
    const mark = nonVesselKind(record);
    // What is not a vessel reads as its own type text when that says what it
    // is (cut to fit), else its kind's word whole ("DISTRESS BEACON · AIS-SART").
    const own = mark ? markTypeText(record, mark) : '';
    const kind = own
      ? trimHudValue(own, 24)
      : mark
        ? markWord(record, mark)
        : '';
    services.readouts?.presentSelectedVessel({
      text: [
        t('AIS: {name}', { name: trimHudValue(record.name, 32) }),
        isFixed(mark)
          ? aidKind(kind, record)
          : t('{type}  SPD: {speed}  HDG: {heading}', {
              type: kind || trimHudValue(record.type || t('VESSEL'), 24),
              speed: formatSpeed(record.speed),
              heading: formatHeading(record.heading ?? record.course),
            }),
        `MMSI: ${record.mmsi || '--'}  ${formatPositionTime(record)}${stale ? `  · ${t('STALE')}` : ''}`,
      ].join('\n'),
    });
  }

  function resetSelectedVesselHud() {
    services.readouts?.presentSelectedVessel(null);
  }

  function trimHudValue(value, maxLength) {
    const text = String(value || '--').trim() || '--';
    return text.length > maxLength
      ? `${text.slice(0, maxLength - 3)}...`
      : text;
  }

  /**
   * Card model for an ambient (decluttered-in) vessel — name title plus one
   * compact type/speed/heading detail line, anchored at the record's current
   * rendered position (height-datum caveat: no datum work here). A fixed
   * mark's line (an aid, station, platform or beacon) is its kind alone.
   * Pure — exported for unit tests.
   * @param {Object} record - Vessel record.
   * @returns {Object} vesselLabels entry.
   */

  function buildVesselCard(record) {
    const parts = [];
    const mark = nonVesselKind(record);
    const fixed = isFixed(mark);
    // A station, platform, aircraft or beacon known only by its MMSI or
    // destination is named by its kind; an aid keeps a bare card, as a
    // harbour holds many.
    const type =
      vesselTypeShort(record) ||
      (mark && mark !== 'aid' ? markWord(record, mark) : '');
    if (type) parts.push(type);
    if (record.virtual === true) parts.push(t('VIRTUAL'));
    if (!fixed && record.speed !== null && record.speed !== undefined)
      parts.push(formatSpeed(record.speed));
    const direction = record.heading ?? record.course;
    if (!fixed && Number.isFinite(direction))
      parts.push(`${roundHeadingDegrees(direction)}°`);
    return {
      id: vesselOverlayEntryId(record),
      actionable: Boolean(record?.id),
      position: components.rendering.iconPosition(record),
      gapPx: 10,
      accent: vesselAccent(record, mark),
      title: trimHudValue(displayVesselName(record), 26),
      details: parts.length ? [parts.join(' · ')] : [],
      selected: false,
      priority: components.rendering.labelPriority(record, null),
    };
  }

  /**
   * Card model for the click-selected vessel — the full-detail card, drawn last
   * (on top) and never distance-faded by the overlay. Pinned-but-vanished
   * vessels carry a STALE marker (mirrors the HUD readout). A fixed mark
   * (an aid, station, platform or beacon) shows its kind with no speed or
   * heading. Pure — exported for unit tests.
   * @param {Object} record - Selected vessel record.
   * @returns {Object} vesselLabels entry.
   */

  function buildSelectedVesselCard(record) {
    const mark = nonVesselKind(record);
    const direction = record.heading ?? record.course;
    const details = [
      isFixed(mark)
        ? aidKind(vesselTypeShort(record) || markWord(record, mark), record)
        : [
            vesselTypeShort(record) ||
              (mark ? markWord(record, mark) : t('VESSEL')),
            formatSpeed(record.speed),
            Number.isFinite(direction)
              ? `${roundHeadingDegrees(direction)}°`
              : '--°',
          ].join(' · '),
    ];
    const destination = String(record.destination || '').trim();
    if (destination) details.push(`→ ${trimHudValue(destination, 24)}`);
    const stale = (record.missedRefreshes || 0) > 0;
    details.push(
      `MMSI ${record.mmsi || '--'} · ${formatPositionTime(record)}${stale ? ` · ${t('STALE')}` : ''}`,
    );
    return {
      id: vesselOverlayEntryId(record),
      actionable: Boolean(record?.id),
      position: components.rendering.iconPosition(record),
      gapPx: 12,
      accent: vesselAccent(record, mark),
      title: trimHudValue(displayVesselName(record), 32),
      details,
      selected: true,
      priority: 100000,
    };
  }

  /** An aid's kind, marked virtual when nothing physical stands there. */

  function aidKind(kind, record) {
    return record.virtual === true ? `${kind} · ${t('VIRTUAL')}` : kind;
  }

  /** Whether a non-vessel kind is a fixed mark: all but an aircraft. */

  function isFixed(mark) {
    return mark !== null && mark !== 'aircraft';
  }

  /**
   * The word for a record that is not a vessel when its type names nothing:
   * its kind ("COAST STATION"), and a distress beacon's device by its MMSI.
   */

  function markWord(record, mark) {
    const word = t(MARK_WORDS[mark] ?? MARK_WORDS.aid);
    const device =
      mark === 'beacon' &&
      BEACON_DEVICES[normalizeMmsi(record.mmsi).slice(0, 3)];
    return device ? `${word} · ${device}` : word;
  }

  /** A non-vessel's own type text when it says what it is, else ''. */

  function markTypeText(record, mark) {
    return typeTextFitsMark(record.type, mark)
      ? String(record.type).trim()
      : '';
  }

  /**
   * A card's accent: the colour of what it is when it is not a vessel (an
   * aid's disc colour), else its ship type's.
   */

  function vesselAccent(record, mark) {
    return mark
      ? NON_VESSEL_STYLES[mark].accent
      : accentForVesselType(record.type);
  }

  /** Stable overlay identity for keyed and source-retained unkeyed rows. */

  function vesselOverlayEntryId(record) {
    const id = String(record?.id || '').trim();
    if (id) return `vessel:${id}`;
    const name = String(record?.name || 'VESSEL').trim() || 'VESSEL';
    const lat = Number.isFinite(record?.lat) ? record.lat.toFixed(5) : 'x';
    const lon = Number.isFinite(record?.lon) ? record.lon.toFixed(5) : 'x';
    return `vessel:unkeyed:${name}:${lat}:${lon}`;
  }

  /**
   * Uppercased AIS type for the card (empty string when unknown). Free feed
   * text is bounded to the card width; a translated type token is a short
   * catalog word and shows whole, never cut mid-word ("AUXILIAR DE PUERTO").
   * What is not a vessel shows its own type text whole when that says what
   * it is ("MANNED VTS"): an aid's kind is the whole line, so it keeps the
   * room speed and heading would take ("CARDINAL MARK N", not "CARDINAL
   * MARK "). A numeric ship type, "unknown" or text that names a vessel or
   * another kind says nothing, so it shows nothing.
   */

  function vesselTypeShort(record) {
    const mark = nonVesselKind(record);
    if (mark) {
      const own = markTypeText(record, mark);
      return own ? trimHudValue(own.toUpperCase(), 26) : '';
    }
    const feedType = normalizeVesselType(record.type);
    const shown = displayVesselType(record.type);
    return shown === feedType
      ? feedType.toUpperCase().slice(0, 14)
      : shown.toUpperCase();
  }

  /**
   * True when `screen` is at least `minSepPx` away from every accepted screen
   * position (greedy card-declutter accept test, mirroring the FIRMS pass).
   * Exported for unit tests.
   * @param {Array<{x: number, y: number}>} accepted - Accepted card positions.
   * @param {{x: number, y: number}} screen - Candidate window coordinates.
   * @param {number} minSepPx - Minimum separation in pixels.
   * @returns {boolean}
   */

  function cardScreenSeparated(accepted, screen, minSepPx) {
    const minSq = minSepPx * minSepPx;
    for (let i = 0; i < accepted.length; i += 1) {
      const dx = screen.x - accepted[i].x;
      const dy = screen.y - accepted[i].y;
      if (dx * dx + dy * dy < minSq) return false;
    }
    return true;
  }

  function displayVesselName(record) {
    const name = String(record.name || '').trim();
    // A source may name a vessel by its id when it has no name.
    if (name && name !== 'VESSEL' && name !== record.mmsi && name !== record.id)
      return name;
    return record.mmsi ? `MMSI ${record.mmsi}` : t('VESSEL');
  }

  function formatSpeed(speed) {
    return t('{speed}KT', {
      speed:
        speed === null
          ? '--'
          : formatNumber(speed, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
              useGrouping: false,
            }),
    });
  }

  function formatHeading(heading) {
    return t('{heading}DEG', {
      heading: roundHeadingDegrees(heading) ?? '--',
    });
  }

  function formatPositionTime(record) {
    if (!record.lastPositionUtc) return t('POS: LIVE');
    const date = new Date(record.lastPositionUtc);
    if (Number.isNaN(date.getTime())) return t('POS: LIVE');
    return t('POS: {time}Z', { time: date.toISOString().slice(11, 19) });
  }
  return {
    updateSelectedVesselHud,
    resetSelectedVesselHud,
    trimHudValue,
    buildVesselCard,
    buildSelectedVesselCard,
    vesselOverlayEntryId,
    vesselTypeShort,
    cardScreenSeparated,
    displayVesselName,
    formatSpeed,
    formatHeading,
    formatPositionTime,
  };
}
