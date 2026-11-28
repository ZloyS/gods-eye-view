- Show or hide Flights by category: the layer row has a chip each for
  Airliners, Regional, Business, Light, Helicopters, Ground and Other
  (gliders and balloons among them), with live counts, kept in share links.
  Ground transmitters (`TXLU` callsigns, feed types `TWR` and
  `GND`, readsb `C0` non-transponder emitters on the ground) now read as
  ground stations, and test callsigns on
  the ground (`ADSTEST`, `TEST`) as test transmitters, even when a feed or a
  lookup types them `ZVEH`. An aircraft type the classifier does not know, or
  a contact with nothing to go on, reads as Aircraft in Other instead of
  Airliner, and more light, turboprop, business-jet and balloon types are
  known. Voice and Cockpit filters take a category word too: "next
  regional" takes regional jets and turboprops, while a class word such as
  "turboprop" or "unknown" takes that class only (Denis Groshev, @ZloyS,
  #0).
