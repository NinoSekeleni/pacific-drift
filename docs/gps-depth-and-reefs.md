# Depth and reef chart proposal

Source review, 29 October 2026. No new source dataset has been downloaded.

- GEBCO 2026: global elevation/bathymetry in metres on a 15 arc-second grid (roughly 460 m north–south). https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid . Use an attributed coarse global overview plus requested regional tiles and TID source-quality information. This is a terrain model, not a harbour survey or a live depth sounder. GEBCO explicitly excludes safety-at-sea navigation use.
- Allen Coral Atlas: mapped shallow reef habitat and reef extent, with regional bathymetry where available. Maps and bathymetry are licensed CC BY 4.0 according to https://allencoralatlas.org/resources/ ; methods and coverage: https://www.allencoralatlas.org/methods/ . Preserve attribution/version and unmapped areas. Confirm the exact tile/region and download before acquiring it, as requested by the owner.
- Do not bundle UNEP-WCMC's global reef polygons by default: its general licence restricts redistribution. Atlas is the preferred candidate for this public game.

Implementation: separate chart layers, lazy regional downloads around the boat, selected destination and passage corridor; no global raster on the startup path. Cache a bounded number of versioned tiles. Show charted depth with its source/resolution/date, blue depth bands, contours, reef polygons and shoal warnings. Missing coverage remains unknown, never 'safe water'. Distinguish a chart estimate from measured under-keel clearance; tide/draft/hazard coverage would be needed for that. Feed mapped shallow/reef exclusions into the route worker only where coverage exists, and reroute after the required corridor tiles load. An unavailable source must not prevent entering the game.
