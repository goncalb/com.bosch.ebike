# Changelog

All notable changes to the Bosch eBike app for Homey Pro.

## [1.1.2] — 2026-09

### Added
- Adaptive location polling: baseline check every 5 minutes; escalates to every
  60 seconds for 15 minutes when the bike reports a new position while idle
  (not charging, not being ridden). Each further movement extends the tracking
  window and fires the location/alarm Flow cards with fresh coordinates.
- eBike Location widget footer: per-bike name, when the position was last
  reported and when it was last checked ("from last ride" for bikes located
  via ride history).
- Multiple bikes are color-coded on the map: matching pin, accuracy circle and
  footer row per bike.

### Changed
- Widgets use 24-hour times.
- Layout refinements: framed (passe-partout) map on the location widget,
  larger footer text, tighter margins on the Last Ride widget.
- Bikes without a theft-detection registration skip location polling
  (re-checked daily).
- Refreshed device image on the App Store page; code cleanup.

## [1.1.1] — 2026-09

Test-channel release of the 1.1.0 feature set (changelog correction only).

## [1.1.0] — 2026-09

### Added
- Last known bike location via the Bosch theft-detection service (requires a
  ConnectModule with the eBike Alarm feature).
- **eBike Location** dashboard widget: map with marker, accuracy circle and a
  pan/zoom lock; select one, several or all bikes when adding the widget.
- **eBike Last Ride** dashboard widget: GPS track (toggleable in widget
  settings), distance, riding time, avg. speed, avg. power, cadence, ascent
  and calories; per-bike selection.
- Bikes without a ConnectModule are located from the end point of their last
  ride's GPS track.
- Flow trigger: "eBike battery rises above X%" (e.g. switch a charger plug
  off at 80%).
- Flow trigger: "eBike location changed (possible alarm)" — suppressed while
  charging or riding.
- Flow trigger: "eBike location updated" — unfiltered, with latitude /
  longitude / accuracy / map-link tags.
- Flow trigger: "A new ride was recorded" — with distance / duration / speed /
  calorie tags.

### Changed
- Requires Homey Pro (Early 2023) or newer — firmware v12.3+ for widgets.
- New permission `homey:manager:api`, used only to link widget bike selection
  to the app's devices.

## [1.0.3] — 2026-09

First Live (stable) App Store release. 🎉

### Changed
- App Store review fixes: tagline-style description, unique driver icon
  (battery), driver image on a white background.

## [1.0.2] — 2026-08 (unreleased, merged into 1.0.3)

### Added
- Flow trigger "eBike battery rises above X%".

### Fixed
- Battery threshold triggers only fire when crossing the configured level and
  survive app restarts.
- Device only becomes unavailable after 3 consecutive failed polls.
- PKCE verifier and OAuth state generated with a CSPRNG.

### Changed
- Native `fetch` (dropped the node-fetch dependency); removed unused
  password-grant code; store metadata (community topic, support links).

## [1.0.1] — 2026-04

- Added source code URL to app.json.

## [1.0.0] — 2026-04

First public Test release: battery state and details, per-mode range
estimates, odometer and motor statistics, per-mode distance/energy, charging
indicator and Flow cards, hardware details in Advanced Settings, bike photo,
multi-bike support, debug logging.

## Pre-release history (0.1.0 – 0.9.0)

- **0.9.0** — Bike photo on the device tile; full hardware details; Homey
  Compose migration.
- **0.8.0** — SVG icons for all capabilities; Bosch red brand color.
- **0.7.0** — Tabbed app settings (Setup / Debug) with PKCE URL generator and
  live debug log.
- **0.6.0** — Repair flow; re-authentication without removing the device.
- **0.5.0** — Capability cleanup and automatic migration on device init.
- **0.4.0** — Cumulative distance and energy per assist mode.
- **0.3.0** — Range estimates, odometer, motor hours, charging status.
- **0.2.0** — Battery details (Wh, capacity, cycles, lifetime energy).
- **0.1.0** — Initial version: OAuth2 PKCE authentication and battery
  percentage polling.
