# Pacific Drift

You are alone in an outrigger canoe at Point Nemo, the place in the ocean farthest from any land. You have a compass, a radio and the sky, and somewhere out there is a shore.

The voyage runs in real time and keeps going while you are away. Leave the sail up and the lashed steering oar holds your heading; lower it and the canoe drifts with the wind and current. When you come back, the game replays the hours you missed.

## What is real

- **Sky.** The sun, moon and its phase, about 5,000 naked-eye stars, the 88 constellations and the Milky Way, placed for the canoe's position and the current moment.
- **Geography.** Coastlines and islands from Natural Earth, with the real heights of Pacific islands, rising over a curved horizon with atmospheric refraction.
- **Wind and currents.** Modelled on the Pacific's real belts and currents (westerlies, trade winds, doldrums, the South Equatorial Current and its neighbours), with travelling lows and squalls generated deterministically so offline drift replays exactly.
- **Radio.** Live stations from the [Radio Browser](https://www.radio-browser.info) directory, received by range (FM by line of sight, AM further at night, shortwave from anywhere), a turnable antenna for direction finding, the WWVH time signal, and Taupo Maritime Radio's high-seas forecast. The tape deck plays a Spotify playlist through Spotify's embedded player, and players can load their own.

## Controls

`W` paddle · `A`/`D` steer · `E` raise or lower the sail · `R` radio · `C` star chart · `M` sound · `Esc` pause. On the radio, `,` and `.` tune and `Z`/`X` turn the antenna.

## Develop

```bash
npm install
npm run dev          # local server
npm run build        # production build into dist/
npm run build:data   # rebuild land and sky data from world-atlas and d3-celestial
```

Pushing to `main` builds and publishes the site to GitHub Pages through `.github/workflows/deploy.yml`.

Map data © Natural Earth (public domain). Star data from d3-celestial (BSD). Station directory by Radio Browser.
