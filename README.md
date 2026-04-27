# Bosch eBike Smart System — Homey Pro App

A [Homey Pro](https://homey.app) app to monitor your **Bosch Smart System eBike** — battery, range, motor stats, per-mode riding statistics, and full hardware details — all inside Homey.

> ⚠️ This app uses a reverse-engineered private API and is not officially supported or endorsed by Bosch eBike Systems. Use at your own risk.

-----

## Screenshots

<!-- Add your screenshots to a /screenshots folder in this repo and they will show here -->

![Device overview](screenshots/device-overview.png)
*The eBike device tile showing battery, range and bike photo*

![Capabilities list](screenshots/capabilities.png)
*All available capabilities visible in the device page*

![Advanced settings](screenshots/advanced-settings.png)
*Advanced Settings showing full hardware component details*

![Settings page](screenshots/settings-setup.png)
*The Setup tab in app settings where you generate your login URL*

-----

## Features

- Battery state of charge (%) and remaining energy (Wh)
- Estimated range in all assist modes (Eco / Tour / eMTB / Sport / Turbo)
- Odometer, motor hours, and charge cycle tracking
- Per-assist-mode distance and energy consumption
- Charging status indicator
- **Bike photo** displayed on the device tile (from Bosch CDN)
- **Full hardware info** in Advanced Settings — battery, motor, connect module, remote, head unit (model, serial, firmware, manufacturing date)
- Automatic polling every 5 minutes
- Supports multiple bikes on one account
- Re-authenticate without removing the device

-----

## Requirements

- Homey Pro (SDK3 — tested on Homey Pro 2023)
- A Bosch Smart System eBike registered in the Bosch Flow / One Bike App
- A desktop computer or laptop browser (for the one-time login step)

-----

## Installation

### Step 1 — Install the app on Homey

> 📸 *Add screenshot: Homey app store listing*

At the moment this app is not yet on the official Homey App Store. To install it:

1. Download or clone this repository to your computer
1. Install the [Homey CLI](https://apps.developer.homey.app/the-basics/getting-started) (`npm install -g homey`)
1. Open a terminal in the downloaded folder
1. Run `homey app install` — this installs the app to your Homey Pro

Once the app is published to the App Store, you will be able to install it directly from the Homey app by searching for **Bosch eBike**.

-----

## Adding Your Bike — Step by Step

Authentication with Bosch requires a one-time login through a desktop browser. This is because Bosch uses a secure login system (OAuth2 PKCE) that cannot be done entirely inside Homey.

You only need to do this once, or if your login session expires.

-----

### Step 2 — Generate your login URL

1. Open the **Homey** app on your phone
1. Go to **More → Apps → Bosch eBike → Settings**

> 📸 *Add screenshot: Homey app → More → Apps*

> 📸 *Add screenshot: Bosch eBike app settings page — Setup tab*

1. On the **Setup** tab you will see a generated **Login URL**
1. Tap the **Copy** button to copy it to your clipboard

> 📸 *Add screenshot: Setup tab with Login URL and Copy button*

-----

### Step 3 — Sign in on your desktop browser

1. On your **desktop computer or laptop**, open a browser (Chrome or Firefox recommended)
1. Open the **Developer Tools**:
- Chrome: press `F12` or right-click anywhere on the page → **Inspect**
- Firefox: press `F12`
1. Click the **Network** tab inside Developer Tools

> 📸 *Add screenshot: Chrome DevTools open on Network tab*

1. Paste the Login URL into the browser address bar and press Enter
1. You will see the **Bosch account login page** — sign in with your Bosch / One Bike App email and password

> 📸 *Add screenshot: Bosch login page*

1. After signing in, the browser will try to open a link starting with `onebikeapp-ios://` — it **cannot** open this link, and that is completely normal and expected
1. In the **Network tab**, look for a request that starts with `onebikeapp-ios://` — click on it

> 📸 *Add screenshot: Network tab showing the onebikeapp-ios:// request*

1. The full URL will look something like:
   
   ```
   onebikeapp-ios://com.bosch.ebike.onebikeapp/oauth2redirect?code=XXXXXXXXXXXXXXXX&state=...
   ```
1. Copy everything after `code=` and before the next `&` — that is your **authorization code**

> 📸 *Add screenshot: The code= value highlighted in the URL*

-----

### Step 4 — Add your bike in Homey

1. Open the **Homey** app on your phone
1. Go to **Devices → + → Add Device → Bosch eBike**

> 📸 *Add screenshot: Add device screen showing Bosch eBike*

1. On the pairing screen, the top section shows a reminder of the instructions
1. In the **Authorization Code** field, paste the code you copied in Step 3

> 📸 *Add screenshot: Pairing screen with Authorization Code field*

1. Tap **Next** — Homey will connect to Bosch and retrieve your bike(s)
1. Select the bike(s) you want to add and tap **Add**

> 📸 *Add screenshot: Bike selection screen*

Your bike will now appear as a device in Homey and will start polling within 5 minutes. The device tile will show your bike’s photo automatically.

-----

## Re-Authentication

Tokens expire after a period of inactivity. If your bike stops updating, you need to re-authenticate.

**Option A — Via Advanced Settings (quickest, no re-pairing needed):**

1. Open the device page → tap **⚙️ Settings** → tap **Advanced Settings**
1. Generate a new login URL from **App Settings → Setup tab**
1. Follow Steps 2–3 again to get a fresh authorization code
1. Paste the new code into the **Authorization Code** field
1. Tap Save

> 📸 *Add screenshot: Advanced Settings showing Authorization Code field*

**Option B — Via Repair:**

1. Long-press the device tile → tap **⋮** → **Repair**
1. Follow the full pairing flow again (Steps 2–4)
1. The device stays in place — only the tokens are updated

-----

## Capabilities

### Battery

|Capability            |Description                                      |
|----------------------|-------------------------------------------------|
|Battery (%)           |State of charge                                  |
|Charging              |Whether the battery is currently charging        |
|Remaining Energy      |Remaining energy in Wh                           |
|Battery Capacity      |Total capacity in Wh                             |
|Charge Cycles         |Total charge cycles (on-bike + off-bike combined)|
|Charge Cycles On Bike |Charge cycles done with battery installed        |
|Charge Cycles Off Bike|Charge cycles done with battery removed          |
|Lifetime Energy       |Total Wh consumed over the battery’s lifetime    |

### Range Estimates

Estimated remaining range at current battery level, per assist mode:

|Capability |Assist Mode|
|-----------|-----------|
|Range Eco  |Eco        |
|Range Tour |Tour / eMTB|
|Range Sport|Sport      |
|Range Turbo|Turbo      |

### Odometer & Motor

|Capability          |Description                           |
|--------------------|--------------------------------------|
|Odometer            |Total distance ridden (km)            |
|Motor Hours         |Total motor operating hours           |
|Motor Hours (Assist)|Hours the motor was actively assisting|
|Max Assist Speed    |Speed limit for motor assist (km/h)   |

### Per-Mode Distance

Cumulative distance ridden in each assist mode: **Off / Eco / Tour / Sport / Turbo**

### Per-Mode Energy Consumption

Cumulative energy used in each assist mode: **Off / Eco / Tour / Sport / Turbo**

-----

## Advanced Settings (Hardware Info)

When you open a device and tap **Settings → Advanced Settings**, you will see full hardware information pulled automatically from the Bosch API:

**Connection**

- Authorization Code — paste here to re-authenticate without re-pairing

**Bike**

- Brand, Category, Frame ID, Gearing system

**Battery**

- Model, Serial Number, Firmware, Hardware version, Part Number, Manufacturing Date

**Motor**

- Model, Product Line, Serial Number, Firmware, Hardware version, Part Number, Manufacturing Date

**Connect Module**

- Model, Serial Number, Firmware, Manufacturing Date

**Remote / Controller**

- Model, Serial Number, Firmware, Manufacturing Date

**Head Unit** (if fitted)

- Model, Serial Number, Firmware, Manufacturing Date

All fields are populated automatically after the first poll and updated on every subsequent poll.

-----

## Using Flows

All numeric capabilities can be used in **Homey Flows** as triggers or conditions. Some examples:

**Get notified when battery is low:**

> When `Battery (%)` drops below `20` → Send notification “Charge your eBike!”

**Track when charging completes:**

> When `Charging` changes to `false` → Send notification “eBike fully charged”

**Daily range check:**

> Every morning at 08:00 → Read `Range Eco` → Announce on Homey speaker

**Log your riding:**

> When `Odometer` changes → Log to a Google Sheet

-----

## App Settings & Debug

Open **More → Apps → Bosch eBike → Settings** to access:

**Setup tab** — generate your login URL and find pairing instructions

**Debug tab** — shows a live log of the last API poll for each bike, useful for troubleshooting. Use **Refresh** to load the latest entries and **Clear** to reset the log.

> 📸 *Add screenshot: Debug tab with log entries*

-----

## Known Limitations

- **No ride history** — the Bosch cloud API does not expose individual ride data to third-party apps
- **5-minute polling** — data is not real-time; it reflects the state at the last poll
- **Desktop browser required** for initial login — the authorization code cannot be captured on a mobile browser
- **Unofficial API** — Bosch may change or restrict the API at any time without notice

-----

## Changelog

### v0.1.0 — Initial working version

- OAuth2 PKCE authentication via Bosch Flow app credentials
- Battery state of charge (%) polling
- Device pairing using Homey `login_credentials` template
- Two Canyon eBikes successfully added and polling

### v0.2.0 — Battery details

- Added remaining energy (Wh) from `remainingEnergyForRider` field
- Fixed unit conversion: `remainingEnergyForRider / 10` gives correct Wh value
- Added battery capacity, charge cycles (total / on-bike / off-bike), and lifetime energy

### v0.3.0 — Range & odometer

- Added per-mode range estimates (Eco, Tour/eMTB, Sport, Turbo) from `reachableRange` API array
- Added odometer in km (`odometer / 1000`)
- Added motor hours (total and assist-active)
- Added max assist speed
- Added charging status indicator

### v0.4.0 — Per-mode statistics

- Added cumulative per-assist-mode distance (Off / Eco / Tour / Sport / Turbo)
- Added cumulative per-assist-mode energy consumption
- Source: `driveUnitAssistModes[0–4]` from bike profile response (0=Off, 1=Eco, 2=Tour, 3=Sport, 4=Turbo)

### v0.5.0 — Capability cleanup & migration

- Removed unused last ride, total stats, and next service capabilities
- Added automatic capability migration on device init (`addCapability` / `removeCapability`)
- Fixed capability naming: underscores instead of dots (Homey SDK3 requirement)

### v0.6.0 — Pairing & repair improvements

- Added **Repair** option via device menu for re-authentication without removing the device
- Added **Authorization Code** field in Advanced Settings for quick token refresh
- Removed unreliable custom HTML pair step — reverted to standard Homey credentials template

### v0.7.0 — App settings page & debug logging

- Added tabbed settings page (Setup / Debug)
- Setup tab: PKCE login URL generator with one-tap Copy and step-by-step instructions
- Debug tab: live log viewer with Refresh, Copy, and Clear buttons
- Debug logging captures raw parsed API values per poll

### v0.8.0 — Icons & polish

- SVG icons added for all 27 capabilities
- App icons added (small / large / xlarge)
- Capability titles and units reviewed and corrected

### v0.9.0 — Hardware info & bike photo

- Added bike photo as device tile camera image (from Bosch CDN)
- Added full hardware details in Advanced Settings: battery, motor, connect module, remote, head unit
- Hardware fields: model, serial number, firmware, hardware version, part number, manufacturing date
- Migrated to Homey Compose structure (`driver.settings.compose.json`) for proper Advanced Settings support

-----

## Project Structure

```
com.bosch.ebike/
├── app.js                      # App entry point, debug logging
├── app.json                    # Generated app manifest (do not edit)
├── package.json
├── .homeycompose/
│   ├── app.json                # App manifest source (edit this)
│   └── capabilities/           # One JSON file per custom capability
├── settings/
│   └── index.html              # App settings UI (Setup + Debug tabs)
├── assets/
│   ├── icon.svg
│   ├── images/                 # App store icons
│   └── capabilities/           # SVG icon per capability
├── lib/
│   ├── BoschEBikeApi.js        # API client, PKCE token exchange, response parsing
│   └── constants.js            # Capability name constants
└── drivers/ebike/
    ├── driver.compose.json     # Driver manifest (Homey Compose)
    ├── driver.settings.compose.json  # Advanced Settings definition
    ├── driver.js               # Pairing wizard, repair, token exchange
    └── device.js               # Polling loop, capability updates, token refresh
```

-----

## Related Projects

This app would not exist without the prior work of others who reverse-engineered the Bosch eBike API:

- **[hass-bosch-ebike](https://github.com/Phil-Barker/hass-bosch-ebike)** by Phil Barker — Home Assistant integration for Bosch Smart System eBikes. This was the starting point that revealed the API endpoints, authentication flow, and data structure used in this app. If you use Home Assistant instead of (or alongside) Homey, check it out.

This app was designed and built in collaboration with **[Claude](https://claude.ai)** (Anthropic) — from API exploration and other bits here and there.

-----

## Contributing

Pull requests are welcome. If you own a Bosch Smart System eBike and want to help test, report bugs, or suggest features, please open an issue to discuss first.

Especially welcome:

- Testing with different battery models (PowerTube 400, 500, 625, 750)
- Testing with different motor generations (Performance Line, CX, Cargo Line)
- Translations (Homey supports `.json` locale files per language)

-----

## License

[MIT License](LICENSE) — free to use, copy, modify, and distribute. No warranty provided.
