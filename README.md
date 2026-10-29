# Pacific Drift

A real-time voyage from Point Nemo in the supplied wooden sailing rowboat. Row, sail, or drift towards land. The voyage stays in this browser and continues while you are away.

## Play on this Mac

Double-click `Play Pacific Drift.command`. It serves the included production build using Python 3 and opens the browser. Keep its terminal window open while playing. It uses the same local address each time so the voyage can persist. Source development does not need to be set up to play.

## Run

Use Node.js 20 or later:

```sh
npm ci
npm run dev
npm test
npm run build
```

The production site is written to `dist/`. The included GitHub Actions workflow builds and deploys GitHub Pages when pushed to `main` in NinoSekeleni/pacific-drift. This handoff has not been pushed or published.

## Controls

W row; A/D steer; E sail; L lantern; R radio; C constellation lines and names; N map; +/- zoom; J log; M sound; H controls; Escape pause. Drag to look, or click for pointer lock. Phones and narrow screens show tool buttons, steering, and paddle controls; tilt requires device permission.

## Voyage and navigation

Voyages use browser localStorage, with one-minute offline replay of the same weather and movement simulation. Sailing holds the heading; lowering the sail allows wind and current drift. Returning players see elapsed time and distance. Daily log entries are also written during replay. Navigator mode plots a dead-reckoned estimate; true and estimated tracks appear together at landfall.

Weather follows Pacific climate belts, travelling lows and squalls. Coastlines come from Natural Earth. The star catalogue and constellation data come from d3-celestial. Daylight follows the viewer's local clock, with celestial orientation based on the canoe's latitude.

World Radio uses Radio Browser mirrors with clear worldwide reception, country/genre/name search, home-country pinning, shuffle, tuning and volume. Only HTTPS streams are offered; HLS support depends on the browser. Spotify defaults to the owner's playlist; the embed controls account access and preview availability.

## Visual QA

`?debug` uses a separate voyage key. It never overwrites the normal voyage.

- `?debug&qa&time=2026-10-28T10:00:00Z` shows sea presets and seat/port/starboard/bow/stern views.
- `?debug&sea=26&time=2026-10-28T10:00:00Z` starts a severe sea for inspection.
- `?debug&sea=3&time=2026-10-28T21:00:00Z` checks night lighting (time is an absolute ISO timestamp; account for the viewer's time zone).
- `at=<latitude>,<longitude>`, `heading=<degrees>` and `view=<x>,<y>,<z>` are also available in debug mode.

The water exclusion uses a single-frame hull transform, dense crest support, a lower-only crest limit, the depth-only opening lid, and a fragment mask in actual canoe-local coordinates. A cedar backing shell covers small mesh holes. The lantern stands on the central yoke, with model-surface probing beside the hole and a safe yoke fallback.

## Credits

Supplied Magnific canoe and lantern assets. Natural Earth geography (public domain). d3-celestial star data (BSD). Radio directory by Radio Browser. Spotify player by Spotify.

## Verification for this handoff

- Production build passes; automated regression checks pass.
- Visually inspected dry interior from the seat and outside in calm water, 9 m/s moderate wind and 26 m/s storm wind (6.5 m wind sea plus swell), including bow/stern views.
- Confirmed the loaded lantern base is at canoe-local (0, 0.184, -0.040) metres, on the yoke; verified automatic illumination at local 23:00.
- Inspected the 390 × 844 layout with all navigation and paddle controls visible and separated.
- South Africa was pinned under Your country. Searching South Africa returned local stations; Ukhozi FM reached On air.
- Spotify loaded Nino's XP at the required playlist ID and played a preview. Full-track access depends on the visitor's Spotify account.
- Browser return replay reported 10 hours 57 minutes away and 11.3 km travelled; position and nearest-land distance changed accordingly.
- Real Pitcairn Island triggered landfall with the track chart and logbook accessible.
- Regression coverage includes nonzero boat coordinates, rough water, exact inverse transforms, long-frame recovery, sailing/drifting replay, deterministic weather, separate storage and daily offline logs.

Physical phone tilt, every possible camera/wave combination, and full-track Spotify account playback have not been independently verified. GitHub publishing requires repository write access; this project has no authenticated GitHub remote in this workspace.

## Realism pass — 28 October 2026

This version adds a Magnific albatross, a revised night sky, flowing blue bioluminescence, refractive rain beads on the view, rain impacts and spray on canoe surfaces, and wet cedar shading.

The albatross is a Magnific/Tripo H3.1 asset generated in the owner's account after approval for 580 credits, then separately approved for download. It is optimized to roughly 27K triangles with 1024px WebP textures. Outer wings were extended to a span-to-length ratio of about 2.5. It glides, banks and flexes its wings above the sampled sea surface. A first offshore encounter can occur after 90–180 seconds of active daytime play in the southern Pacific, then encounters are separated by 15–40 minutes. Existing near-shore birds remain.

Stars have sharper cores, brighter exposure, restrained twinkle and gradual night-vision adaptation. Moonlight and clouds still affect visibility. The Milky Way is more visible when its real orientation places it in view. Bioluminescence follows paddle and hull disturbance as soft blue ribbons that decay, with small highlights filtered to avoid subpixel noise. Spray now fades smoothly and only a small fraction of drops glow faintly.

The soundscape originally used six Magnific clips selected and downloaded with the owner. Details and approval records are in `public/data/soundscape.json`. Calm conditions have no continuous synthetic sea/wind floor. The mix separates hull laps, soft/heavy rain, wind and delayed thunder. The unsuitable paddle/drip mapping has since been removed. Close effects have stereo placement and cooldowns. Long loops are joined with a crossfade, and weather layers fade rather than switching abruptly. Some clips in Magnific's catalogue may be generated; field-recording provenance has not been independently established. The additional owner-downloaded rain clips are now available in the environment studio.

No additional third-party visual assets were introduced: the new imported model and audio are from Magnific; stars and water/rain effects are rendered procedurally using the existing data and geometry.

Phones also have a Sound button for muting or restoring the environment without a keyboard.

The development-only `?debug&qa` panel now includes Sky, Paddle 12 seconds, Lens spray, Albatross preview and Bird detail. The panel is absent in normal play. All debug voyages still use separate storage.

Validation: production build and regression tests pass, including calm sound levels, approved audio paths, playback segment ranges, bird triangle count and wing proportions. Browser QA checks the bird in flight, shader compilation, dry canoe interior, raindrops and the 390 × 844 control layout. Real phone orientation and listening on different speaker/headphone systems still need owner review.

If the launcher says another copy is running, close the previous game's terminal window before starting this updated copy. Keep the same browser and local address to retain that local voyage.

## Environment studio — feedback revision

Open `Environment Studio.command` to launch a separate preview mode on the usual local address, or use the Environment studio link in the game. The studio has its own storage key and starts a fresh preview voyage, so it cannot overwrite the game voyage. Return to the original game launcher/address to continue the existing voyage.

Six presets (Still water, Sea breeze, Light rain, Storm, Sunset, Clear night) plus independent sliders for wind, swell, rain, cloud cover, darkness and time. Toggle bioluminescence, albatross and whale encounters, change camera position, trigger a bird pass, paddle, screen splash, lantern or lightning/thunder. Weather changes blend over a few seconds.

All thirteen approved Magnific clips are included and individually playable. Automatic mode selects a single rain bed: soft rain in light conditions, pouring rain in heavier showers, intense thunderstorm in strong storm winds, or the day/night storm clip otherwise. Only one rain recording is audible at a time. Select any of the five rain recordings as the rain layer; the other environmental layers can be muted separately. Auditioning fades the ambient loops out until the clip finishes or Stop clip is pressed. The branch-rustling clip 276 is for audition only and is excluded from offshore ambience. No new download was made for these four additional rain clips. The paddle clip and humpback downloads received separate user approval. The whale generation inadvertently started for 580 credits before approval; this was disclosed to the user, and no further generation was initiated.

The incorrect drip-as-paddle sound was removed. Strokes now use the separately approved two-second Magnific clip 3021, trimmed to 1.1 seconds around its splash with a restrained gain. The generated Magnific humpback has been approved for download, optimized and added: it surfaces and dives at a distance, emits a breath plume and surface ring, and flexes its tail. Studio includes a Whale encounters switch and Preview whale button. In normal daytime play, the first encounter may occur after 3–7 minutes in suitable conditions, then every 20–45 minutes. No whale sound recording is bundled.

Feedback notes persist locally. Save feedback exports the current conditions, selected rain clip, layer switches and notes as JSON for sharing. Notes are never sent automatically.

## Night sky, sea ambience and fronts — current atmosphere pass

The compass is at the lower right in the game and studio. On phones the paddle is centered and the steering buttons stay left, keeping all three controls apart. The studio panel opens above the view on phones so the compass remains visible.

The moon now uses phase-lit procedural basalt plains, filtered crater relief, impact rays, earthshine and a tighter halo. Its terrain is an artistic procedural approximation, not an imported photographic map. Stars have brighter, stable pixel cores, cloud and moon-disc occlusion, and a stronger Milky Way. Shooting stars are brief, occasional events in clear night conditions; the studio has an immediate preview. Inspect moon chooses an hour when the real moon is high at night and uses a closer field of view; choosing another view or preset restores the normal field of view.

Glowing plankton follows hull contact, paddle ripples, the wake and breaking crests. It is stronger and uses smooth blue-cyan filaments with filtered highlights. It responds to darkness and movement, rather than lighting the whole sea uniformly. The studio has Star brightness and Plankton glow controls and a Preview glowing water button that sets night, extinguishes the lantern and paddles briefly. Normal play uses the stronger default glow without altering saved voyage conditions.

Distant shelf-cloud banks and irregular rain shafts approach from upwind in unsettled weather. The studio's Approaching front preview runs a two-minute sequence: approaching bank, growing wind/cloud, arriving rain, then clearing. The front geometry dissolves into the existing cloud/rain system before reaching the camera. Natural front visuals follow the existing weather and do not change the saved sailing physics. Feedback exports include the effective weather and current front progression, as well as the chosen controls.

Sound now separates Ocean ambience, Passing waves and Close water. Magnific 3643 (Small Fishing Boat Rocking, water movement/light creaks) supplies the quiet ambient layer. Magnific 2995 (Furious ocean waves) is silent through roughly 1.3 m wave height and fades up in rough seas. Both downloads were separately approved. Close laps remain sparse and spatial. Quiet source files receive bounded loudness compensation; dedicated ocean/wave loops replace the old repeated tiny-splash loop. Slow unequal envelopes reduce obvious looping. No generated environmental noise bed is used; the lantern/radio retain their own quiet device sounds. Embedded storm thunder does not stack with separate thunder effects. The clips are short Magnific catalogue assets, and field-recording provenance is not claimed.

Verification covers production build, the voyage/asset regression suite, recording levels and sea-state gates, front lifecycle/envelope tests, browser shader compilation, studio controls and desktop/phone layout. Listening on the owner's speakers/headphones remains the final quality judgment.

## Materials, fabric, paddle and screen-water refinement

Screen splashes now contain larger refractive beads, stronger meniscus/specular contrast, a brief water-sheet distortion and longer wet smears. Rain and spray remain temporary and the view dries afterward. The studio's Screen water slider changes strength, and Splash on screen triggers a burst.

Stars are compact and nearly neutral white rather than saturated coloured sprites. The default apparent lunar size is increased by 50%, with an independent Moon size slider. The moon uses the separately approved Magnific/Wirestock photograph, asset 24910085, with grayscale rendering and simulated phase illumination. Original photograph is preserved in `public/textures/magnific/moon-24910085.jpg`; runtime bitmap downsampling limits GPU memory. Credit: Wirestock via Magnific, https://www.magnific.com/free-photo/closeup-big-moon-its-full-phase-with-craters-visible-its-edges_24910085.htm . This is a sampled photographic disc, not a fully mapped lunar globe. Approval/source details are in `public/data/visual-assets.json`.

The sail keeps its mast at full size. Its cloth actually hoists and gathers at the boom, with attached edges fixed and pressure ripples concentrated toward the free edge. UV-mapped woven canvas, fine thread relief, small-scale roughness and fabric bump replace the previous plain translucent surface. Raise / lower sail is now directly accessible in the studio.

The paddle is a carved beavertail shape with a tapered blade, oval shaft and shaped palm grip. Grain and restrained wood roughness/bump are generated locally; imported canoe texture atlases remain intact. Motion separates preparation, catch, power, exit, feathered recovery and parking. Releasing the paddle finishes the committed stroke rather than hiding it mid-pull, and catch audio/splashes trigger once per stroke.

The seated camera filters angular motion and limits body-relative vertical displacement while the hull continues to follow the actual waves. This keeps the sea/boat masking and buoyancy unchanged. Heavy-sea camera behavior and paddle/cloth lifecycle checks are in `tests/canoe-animation.mjs`.

Water adds broken wake-foam memory, decaying crest foam and wind-aligned small waves/streaks. Blue plankton light follows curling disturbance filaments rather than a solid field of blue. Spray has varied shapes/lifetimes and lands on the sampled moving sea, creating a bounded number of small impact ripples. The already approved thirteen-clip soundscape is retained.

Additional checks: `tests/lens-rain.mjs`, `tests/surface-materials.mjs`, `tests/canoe-animation.mjs`, `tests/water-effects.mjs`. Browser QA verifies the raised cloth, parked paddle, screen splash visibility, photographic moon and shader compilation.

## Screen-water correction

The oversized, dark-rimmed bubble effect has been replaced. A splash briefly creates irregular soft-edged water films with localized defocus and small flowing highlights, then leaves fine running drops. Bead radius is capped to avoid large glass spheres. The full-screen sine-wave warp and black meniscus rings are removed. Screen water still controls strength, and Splash on screen previews it directly. The focused lens test verifies films, bounded fine droplets and complete drying.

## Complete paddle interaction

The paddle now has reachable seated proportions, with gloved hands and sleeves following its actual palm and shaft grips. The arms use fixed lengths with bounded shoulder movement. Continuous strokes retain their side; releasing W finishes the stroke and parks the paddle nearby.

Catch, pull and exit sample the moving water at the blade. Only an immersed power stroke contributes forward drive, using a short push followed by hull coasting during recovery. A repeated normal cadence settles near 1.48 m/s in the flat-water simulation check. Entry sound, a small catch splash, a short disturbance trail and quiet exit droplets follow those contact events; a blade in the air produces none of them. Slow motion also scales drive to prevent a prolonged power pose from producing extra propulsion.

Open Environment Studio and use **Paddle study** to preview one stroke, choose left or right, repeat for six seconds, show/hide hands, or slow the sequence to 30% speed. The status identifies the current phase and water contact. These review settings remain separate from the saved voyage. Hands are locally modelled sailing gloves, not an imported photorealistic human asset. Existing approved Magnific paddle and droplet recordings are reused.

Focused checks: `tests/paddler-hands.mjs`, `tests/paddler-projection.mjs`, `tests/paddle-feedback.mjs`, `tests/paddle-propulsion.mjs` and the expanded `tests/canoe-animation.mjs` cover both-side reach, actual camera framing, exact grip attachment, fixed arm lengths, actual-water contact, one-action previews, dry recovery, sustained cadence, coasting and contact-only force/audio/water responses. Desktop visual checks cover both stroke sides; the 390 × 844 studio layout was also inspected. All twelve test scripts and the production build pass.


## Supplied sailing rowboat replacement

The active boat is now the owner-supplied `rowing-boat.zip` FBX, converted to a 2 MB GLB with 2K base colour/normal maps and packed roughness/metallic maps. Its original hull proportions, painted interior, mast, rigging, boom, sail, rudder and oars are preserved. The earlier canoe sections above describe the previous handoff. The normal voyage storage remains compatible.

Two supplied oars replace the single paddle. Hold W or the phone Row button; release to finish the committed stroke and return the oars to their supplied stowed positions. The forward-facing viewpoint uses push rowing: the handles extend while the immersed blades sweep aft. Both hands follow the actual oar grips with fixed arm lengths. The blades feather during recovery, and contact drives the existing approved splash/droplet audio, water disturbance and propulsion.

The seated viewpoint, lantern bench position, rain-hit footprint, wider buoyancy samples and roll response are adjusted for the boat. A measured 65-point hull profile and depth lid replace the narrow canoe outline. The original cloth and lacing gather along the boom when lowered; the original mast stays fixed. Cloth motion is restrained, with attached shape retained while raised.

Environment Studio now has **Rowing study**, **Row once**, repeat and slow-motion controls, plus **Look at oars** under View & encounters. Source/approval details are in `public/data/rowing-boat.json`. No external assets or downloads were used for this replacement.

`tests/rowing-boat.mjs` checks the actual imported geometry, PBR textures, measured hull profile, reachable paired grips, one catch/exit per oar, dry-blade suppression, propulsion, lowered/raised cloth and fixed mast. To reconvert, extract the original archive and run `node tools/prep-rowboat.mjs /absolute/path/to/extracted/archive` from the project directory.

Replacement verification: all thirteen test scripts and the production build pass. The imported-boat test includes the browser’s interleaved vertex layout. Raised/lowered cloth, both oars, calm/rough sea fit and the phone studio layout were visually checked in the production build.


## Rain study — 29 October 2026

Rain now uses three layers of tapered, camera-facing drops at different depths. Drops retain world positions as the viewpoint moves, follow wind and gravity, and respect scene depth. A separate patchy distant rain veil reduces far contrast. Dry weather stops the particle work.

Fine droplets on the view use local refraction and small highlights. They can cling, merge into larger drops, then accelerate downward with narrow trails. Radius remains bounded to avoid glass-bubble shapes. Rain droplets can be disabled independently of wave spray; Clear the view removes both rain and spray water immediately. External review cameras bypass the wet-view overlay. The existing brief, irregular spray films remain available.

Near-sea impacts follow sampled wave height and slope and exclude the measured boat interior. Boat impacts are raycast onto the actual planks/benches and align to the hit surface. Both pools are instanced and bounded. Fine water shading now uses short-lived, distance-filtered wavelets instead of fast sliding rain noise. Existing wet timber drying and approved rain recordings remain in place. No new asset downloads were needed.

Open **Environment Studio → Rain study**. **Rain on calm water** and **Windy rain** make comparison easier. Toggle Falling drops, Distant rain veil, Rain on the view, Rain on the sea and Rain on the boat separately. Density, view-droplet amount and surface-impact amount have independent controls. Feedback exports include these settings and active layer counts. Sound follows the selected weather and keeps its own controls below.

`tests/rain-experience.mjs` checks world-space movement, depth-layer counts, independent toggles, dry-weather work suppression, origin changes, wave-following rings, interior exclusion, actual bench hits, droplet merging/runoff, spray separation and clear/external views. `tests/lens-rain.mjs` still checks bounded droplets, transient films and complete drying.

Rain verification: all fourteen test scripts and the production build pass. The final production scene was checked with independent rain toggles, clear/spray actions, and desktop/390 × 844 layouts; no browser rendering errors were reported.


## Boat colour and white sail correction — 29 October 2026

The earlier FBX conversion copied bottom-left UV coordinates into glTF without reversing V. That caused the sail to sample brown wood and some wooden parts to sample the white fabric atlas region. Conversion now reverses V for all material maps, preserving the supplied atlas colours, normal detail, roughness and metallic assignments.

The boat uses explicit sRGB texture decoding/display encoding inside the existing atmosphere pipeline. The sail has a separate matte, non-metallic cloth material with restrained sunlight transmission on its back face. Its wet roughness stays high, and it has no emissive glow. Timber retains its supplied textures and wet response.

The imported-boat regression samples the actual runtime texture through the sail UVs to require predominantly white cloth and reject wood colours. It also checks material separation and colour-space assignments. The production daylight preview was visually checked with no shader errors. This build includes the Rain study improvements.


## Storm-water correction — 29 October 2026

Fine storm chop now grows with wind independently of rain, including when the rain layer is disabled. Calm rain retains its small filtered wavelets. Foam follows compressed wind-wave ridges with smaller broken patches and a weak fading remnant; broad swell height no longer paints whole wave faces white. The distant rain veil starts farther away and has lower opacity. Wave amplitudes/directions, sampled water heights and boat buoyancy are retained.

`tests/storm-water.mjs` verifies wind-driven detail in dry and wet gales, calm-rain isolation, bounded wind response and unchanged physical wave parameters. For repeatable visual comparison, `?environment&waveAt=42&time=2026-10-29T14:00:00Z` holds the water phase and rendered boat position in Environment Studio only; normal voyages continue to animate normally. The final storm was also checked with moving waves and all rain layers enabled.

Storm verification: all fifteen test scripts and the production build pass. Before/after water was compared at the same held wave phase and weather; moving storm waves and calm rain were also inspected with no rendering errors.


## Downloaded texture update — 29 October 2026

The current build uses the supplied Water 002 normal/roughness maps, Poly Haven linen normals, ambientCG Fabric030 and Rope001 detail, and Poly Haven lacquered wood microdetail. The boat's authored colour/normal/metallic-roughness atlas is retained. Rest-pose detail coordinates are captured before sail/oar deformation. Both linen and canvas weave can be compared on the existing white sail.

Ultra-Water is selectively adapted under its MIT licence: a 512px tileable foam bake, two-phase foam advection and derivative-based highlight filtering. The existing Gerstner surface, physical wave sampler, hull exclusion, storm chop, wake and bioluminescence remain the foundation. Its Three 0.186 renderer, FFT simulation, island/shore systems and underwater pipeline were not imported or installed. The complete supplied copyright and third-party notices ship under `public/textures/licenses/`.

A small sky-only cubemap is captured from the game's own atmosphere, decoded to linear light, and filtered with Three PMREM for restrained boat environment lighting. It updates at a controlled cadence and uses a smaller probe on touch devices. Static 4K HDRIs remain lighting references in Downloads rather than replacing dynamic weather/time.

The supplied NASA LROC colour map is converted to a 2K cylindrical map and sampled on the lunar hemisphere before phase lighting. Credit: NASA’s Scientific Visualization Studio. Its orientation is fixed north-up; libration is not simulated. NASA media-use conditions and source credit are recorded in the visual-asset manifest. The earlier approved Magnific photo remains a selectable fallback/comparison.

Environment studio → Surface detail provides independent Water texture detail, Boat & fabric detail and Foam texture detail controls. Zero restores the corresponding original surface detail. Disable Filter water highlights and Sky reflections on the boat for comparison; Lunar survey surface switches between the new map and earlier photograph. Sail weave offers linen/canvas. Inspect moon temporarily hides foreground geometry so the mast cannot obscure the inspected disc. Other view buttons restore the boat normally.

`public/data/marine-assets.json` records exact derivative hashes, original sources, licensing, active/prepared status and exclusions. Metal030 is converted but inactive; using generic metal over the mixed fittings atlas would change unrelated materials. Weathered planks and stock rope/rain photographs were not applied. The inspected splash sample has stylised blue shading/dark outlines and was left out. The Terrain3D repository does not contain the separate discussion rain-ripple atlas; it was not imported. No Magnific installer was run and no new content was downloaded or generated.

Runtime normal maps are resized, renormalized and kept in data colour space. The linen roughness EXR uses a single-channel DWA variant unsupported by this project's r169 decoder; neutral Fabric030 roughness is deliberately paired with its linen normal. Original high-resolution files remain untouched in Downloads. `tools/prep-marine-textures.mjs` reproduces the selected conversions from an explicitly supplied extracted-image directory; it performs no network access.


## Earth-to-boat arrival — 29 October 2026

The first Begin/Return action after opening the normal game now plays an 11.6-second geographic arrival: Earth overview, South Pacific location, open-ocean approach, then descent into the actual rowing seat. The globe uses bundled Natural Earth coastlines, a generated cartographic texture, geographic labels and a location marker. No satellite API, new downloads or external map service are used. The final camera interpolates into the normal seat position/orientation with zero endpoint velocity. The sky, weather and boat remain the existing live scene.

Skip to boat, Escape, Enter or Space finishes immediately. The journey plays once per page load and again for a new voyage; pausing/resuming does not repeat it. The first descent enables drag-to-look without requiring pointer lock from an automatic callback. Reduced-motion preferences bypass the moving arrival. The ocean ambience fades in during descent while respecting the sound mute state. Temporary globe geometry, texture, render target and materials are disposed at completion/skip. Resize updates the arrival target and camera aspect.

New voyages target Point Nemo; returning voyages target their saved position. Navigator mode targets and labels the dead-reckoned estimate so the opening does not expose a hidden true position. Simulation and the existing storage keys remain unchanged. QA uses only debug/studio storage. The testing URL `?debug&arrivalAt=9` freezes the arrival at nine seconds after Begin; omit `arrivalAt` for normal playback. The normal release link does not freeze the sequence.

Environment Studio → View & encounters → Replay arrival from Earth previews the full opening using the current review world and returns to its previous playback state. Studio entry itself remains immediate.

The game sequence is: choose ordinary or Navigator mode; arrive at the boat; row/steer/sail/drift; use compass/radio/sky/map/log; experience changing ocean weather and wildlife; save and return with offline catch-up; reach real coastline and inspect the voyage chart. Studio is separate from a saved voyage.

Studio presets: Still water (0 m/s wind, 0.08 m swell, midday); Sea breeze (6 m/s, 0.7 m, afternoon); Light rain (3 m/s, 0.4 m, overcast); Rain on calm water (2 m/s, 0.15 m, heavy rain); Windy rain (10 m/s, 0.8 m); Storm (24 m/s, 4.5 m, heavy rain/dark clouds); Sunset (3 m/s, 0.4 m); Clear night (1 m/s, 0.2 m). Swell values are preset inputs, not total combined sea height. Natural weather is simulated. Independent controls cover wind, swell, rain, cloud/darkness, time, fronts, sea/boat/lens rain, wildlife, sky/glow, surface detail and sound layers.

Arrival validation: all 17 test scripts and the production build passed. Browser checks covered the full automatic descent, click/Escape skip, pause/immediate resume, Navigator estimate labelling, and production Studio replay/return. No shader warnings/errors were observed. Physical mobile-device frame rate has not been measured.


## Boat gear, quiet home and story arrival — 29 October 2026

The owner-supplied backpack and handheld radio now travel with the wooden boat. The backpack is 56 cm high, 33.2 cm wide and 45.4 cm deep. The radio is 28 cm including its antenna, approximately 7.3 cm wide and 4.5 cm deep, and lies face-up on the starboard bench. The pack rests on the port bench. Both positions sample the real boat surfaces, preserve a 3 mm separation, stay inside the hull and avoid the rowing seat/rowlocks. Clicking the radio opens the existing radio interface; keyboard R still works. The radio is a visual handheld prop for the existing game radio, without a new transmission/range simulation. A backpack inventory system has not been added.

The backpack is reduced from about 237K to 47,387 triangles and about 3 MB; the radio is 16,762 triangles and about 1.1 MB with one material/draw. Authored textures remain, at 1K WebP resolution. Backpack vertex normals are rebuilt after geometry reduction. The original archives remain untouched. Offline reproduction: extract archives to bag/, radio/ and earth/; unpack the radio 7z to radio/extracted/; run `node tools/prep-boat-props.mjs <extracted-directory>`. The helper makes no network requests. Source provenance and derivative hashes are recorded in `public/data/boat-gear.json`. The archives did not bundle creator/licence metadata; original rights are retained and no new licence is asserted.

The Earth arrival uses the supplied TERRA colour/cloud maps on the existing correctly oriented geographic sphere. Its .blend file is not executed. A generated coastline globe remains the fallback. The cloud layer fades near the surface, and framing fits portrait as well as landscape screens.

Home now presents the title, one short invitation and Begin/Continue. Help, key bindings, Navigator mode and the offline note sit in optional How to play. Map and command HUD start closed; a small Controls button and H reveal controls during play. The compass remains in its lower-right position. Environment Studio stays accessible from home/help. The opening story appears in four timed text cards over a 17-second descent. New, returning and Navigator voyages have appropriate text; skip controls and immediate pause/resume remain. No generated voice-over or new audio downloads are used.

New-voyage story:
1. Point Nemo. Farther from land than anywhere else on Earth.
2. A wooden boat. A backpack. A radio. Everything you have is here.
3. Beyond the swell, somewhere, there is a shore.
4. Keep your bearings. Read the sky. Find your way to land.

`npm test` now runs every test script, including actual-model metre scale, surface contact, clearance and size budgets. A review-branch/PR verification workflow runs tests and builds without deploying. Main retains its GitHub Pages deployment workflow, now with tests before build. This update is prepared on a review branch; merging it into main is the live-deployment step.

Gear/opening validation: all 18 test scripts and the production build pass. Browser checks covered desktop/phone-width home and help, complete story playback, whole-globe portrait framing, original supplied textures, direct radio interaction and scene review. Real mobile-device frame rate remains unmeasured.
