- Add category toggles to the Live AIS Vessels row: Tankers, Cargo,
  Passenger, Fishing, Service (tugs, offshore and work vessels, government and
  safety), Leisure and Other (untyped ships, stations, platforms and
  navigation aids), all on by default. A shown chip carries its category's
  live count, and Context splits vessels by these categories before ship
  type. A vessel is classed by its detailed type, then its broad type, then
  its AIS code, so every tanker subtype is a tanker; the toggles are kept in
  share links. Vessel traffic service and coast stations, platforms and
  navigation aids are no longer drawn as ships: they get no ship model, are
  left out of vessel counts, and draw as a station mast, platform or buoy.
  MMSIs that AISStream sends as a number get their leading zeros back, so a
  `00` station is known; a `111` search-and-rescue aircraft draws as an
  aircraft and a `970`/`972`/`974` distress beacon as a red buoy (Denis
  Groshev, @ZloyS, #0).
- Draw offshore platforms, rigs and fixed offshore structures as platforms: an
  upright deck-on-legs icon and a jacket platform model (the special-mark buoy
  for the aid types that also mark wind farms), shown under Other.
  Lightships, light vessels and LANBYs are navigation aids. A distress
  beacon's buoy gets a flash ring and, under 3D, the red can model (Denis
  Groshev, @ZloyS, #0).
