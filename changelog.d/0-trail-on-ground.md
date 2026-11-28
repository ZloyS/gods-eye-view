- Keep a selected flight's history trail out of the ground at its airports.
  The track history sends 0 for a waypoint with no altitude, including the
  take-off roll and the end of an approach, and the trail drew those points
  at sea level, under the field. Taxi, roll and the last of an approach now
  run along the ground floor in one line with the climb or descent, a dropout
  in mid-flight breaks the line instead of diving to the ground, and while
  the floor is still unknown those points are left out. The floor is the
  rendered 3D surface where the flights layer has sampled it, as for the live
  aircraft, so a runway deck that bare-earth terrain puts metres lower lifts
  the history onto it. A floor that arrives after the trail's 1.2 s wait, a
  failed lookup that succeeds on a later poll, or new surface readings
  redraw the history once on it (Denis Groshev, @ZloyS, #0).
