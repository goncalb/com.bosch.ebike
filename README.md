# Bosch eBike Smart System — Homey Pro App

A [Homey Pro](https://homey.app) app to monitor your **Bosch Smart System eBike** — battery, range, motor stats, per-mode riding statistics, and full hardware details — all inside Homey.

-----

## ⚠️ Important Disclaimer
> 
> This integration requires:
>
> - **ConnectModule** hardware installed on your bike (sold separately, ~€100-150)
> - **Bosch eBike Flow+** subscription (~€30-50/year)
> - **Bosch eBike Flow** app (Gen 4 and up)
>
> **This will NOT work with older Bosch eBike Connect app (Gen 3 and below).**
> 
> **This app is not officially supported, endorsed, or affiliated with Bosch eBike Systems in any way.**
> 
> The Bosch Smart System does not currently offer a public API for third-party integrations. This app works by using the same private API used by the official **Bosch Flow / One Bike App** (also known as One Bike App). This approach was reverse-engineered by the community and is used here as a workaround until an official API becomes available.
> 
> **What this means for you:**
> 
> - Bosch may change or disable this API at any time without notice, which could break the app
> - Your Bosch account credentials are used only for authentication — no data is stored outside of your Homey
> - Use at your own risk
> 
> If Bosch ever releases an official public API, this app will be updated to use it.

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
- A Bosch Smart System eBike registered in the **Bosch Flow / One Bike App**
- A **desktop computer or laptop** with Chrome or Firefox (required for the one-time login step — a mobile browser will not work)
- Your Bosch account login credentials

-----

## Screenshots

<!-- Add your screenshots to a /screenshots folder in this repo -->

![Device overview](screenshots/device-overview.png)
*The eBike device tile showing battery, range and bike photo*

![Capabilities list](screenshots/capabilities.png)
*All available capabilities visible in the device page*

![Advanced settings](screenshots/advanced-settings.png)
*Advanced Settings showing full hardware component details*

![Settings page](screenshots/settings-setup.png)
*The Setup tab in app settings where you generate your login URL*

-----

## Adding Your Bike — Step by Step

Because Bosch does not offer a public API, authentication requires a **one-time manual step** through a desktop browser. This is a workaround to obtain the authorization token that Homey needs to communicate with the Bosch cloud on your behalf.

> ⚠️ **This step cannot be completed on a mobile phone.** You need a desktop or laptop browser with Developer Tools (Chrome or Firefox). This is a known limitation of the workaround approach.

You only need to do this once per Homey installation, or when your session expires (which is rare with the `offline_access` token scope).

-----

### Step 1 — Generate your Login URL

The app generates a unique, secure login URL for your Bosch account using PKCE (a secure OAuth2 method). You need to copy this URL to your desktop browser.

1. Open the **Homey** app on your phone
1. Go to **More → Apps → Bosch eBike → Settings**

> 📸 *Add screenshot: Homey app → More → Apps*

1. You will see the **Setup** tab with a generated **Login URL**
1. Tap **Copy** to copy the URL to your clipboard

> 📸 *Add screenshot: Setup tab with Login URL and Copy button*

-----

### Step 2 — Sign in and capture the authorization code

This is the trickiest step. Because the Bosch login redirects to a mobile deep link (`onebikeapp-ios://`) that desktop browsers cannot open, you need to intercept the redirect using Developer Tools.

1. On your **desktop computer**, open **Chrome** or **Firefox**
1. Open **Developer Tools**:
- **Chrome**: press `F12`, or right-click anywhere → **Inspect**
- **Firefox**: press `F12`
1. Click the **Network** tab in Developer Tools
1. Make sure recording is active (red dot in Chrome, or pause button not active in Firefox)

> 📸 *Add screenshot: Chrome DevTools open on Network tab*

1. Paste the Login URL into the browser address bar and press **Enter**
1. The Bosch account login page will appear — sign in with your Bosch / One Bike App email and password

> 📸 *Add screenshot: Bosch login page*

1. After a successful login, the browser will **attempt to open** a link starting with `onebikeapp-ios://` — this will fail with an error in the browser, which is **completely normal and expected**
1. In the **Network tab**, look for a request that starts with `onebikeapp-ios://` — it will appear in the list. Click on it.

> 📸 *Add screenshot: Network tab showing the onebikeapp-ios:// request*

1. The full URL in the request will look like this:
   
   ```
   onebikeapp-ios://com.bosch.ebike.onebikeapp/oauth2redirect?code=XXXXXXXXXXXXXXXX&state=...
   ```
1. Copy the value after `code=` and before the next `&` — that is your **authorization code**

> 📸 *Add screenshot: The code= value highlighted in the URL*

> 💡 **Tip:** The code is a long string of random characters. Copy only the code itself, not the `code=` prefix or anything after the `&`.

-----

### Step 3 — Add your bike in Homey

1. Open the **Homey** app on your phone
1. Go to **Devices → +** → search for **Bosch eBike** → tap it

> 📸 *Add screenshot: Add device screen showing Bosch eBike*

1. On the pairing screen you will see a reminder of the instructions
1. In the **Authorization Code** field, paste the code you copied in Step 3

> 📸 *Add screenshot: Pairing screen with Authorization Code field*

1. Tap **Next** — Homey will connect to Bosch and retrieve your registered bike(s)
1. Select the bike(s) you want to add and tap **Add**

> 📸 *Add screenshot: Bike selection screen*

Your bike will now appear as a device in Homey. The bike photo and all data will appear within 5 minutes on the first poll.

-----

## Re-Authentication

Tokens use `offline_access` scope and last a long time. However if your bike stops updating, re-authentication is needed.

**Option A — Via Advanced Settings (quickest, no re-pairing needed):**

1. Follow Steps 2–3 above to get a new authorization code
1. Open the device → **Settings → Advanced Settings → Connection**
1. Paste the new code into the **Authorization Code** field
1. Tap **Save**

> 📸 *Add screenshot: Advanced Settings showing Authorization Code field*

**Option B — Via Repair (full re-pairing):**

1. Long-press the device tile → **⋮** → **Repair**
1. Follow the full pairing flow (Steps 2–4)
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

### Per-Mode Distance & Energy

Cumulative distance and energy consumption per assist mode: **Off / Eco / Tour / Sport / Turbo**

-----

## Advanced Settings

Open device → **Settings → Advanced Settings** to see:

**Connection** — paste a new Authorization Code to re-authenticate

**Bike** — Brand, Category, Frame ID, Gearing system

**Battery** — Model, Serial, Firmware, Hardware, Part Number, Manufacturing Date

**Motor** — Model, Product Line, Serial, Firmware, Hardware, Part Number, Manufacturing Date

**Connect Module** — Model, Serial, Firmware, Manufacturing Date

**Remote / Controller** — Model, Serial, Firmware, Manufacturing Date

**Head Unit** *(if fitted)* — Model, Serial, Firmware, Manufacturing Date

All fields populate automatically on the first poll.

-----

## Flows

**Custom trigger cards:**

- eBike charging started
- eBike charging stopped
- eBike battery drops below X%

**Custom condition cards:**

- eBike is / is not charging
- eBike battery is above / below X%

All numeric capabilities also automatically generate “becomes greater/less than” flow cards.

-----

## App Settings & Debug

Open **More → Apps → Bosch eBike → Settings**:

**Setup tab** — login URL generator with Copy button and step-by-step instructions

**Debug tab** — live log of the last API poll per bike. Use **Refresh** to reload and **Clear** to reset.

-----

## Known Limitations

- **Unofficial API** — Bosch may change or disable access at any time. This is the fundamental limitation of this approach.
- **No ride history** — the Bosch API does not expose individual ride data to third-party clients
- **5-minute polling** — data reflects the state at the last poll, not real-time
- **Desktop browser required** for initial authentication — the authorization code cannot be captured on mobile
- **One Bike App must be set up** — your bike must already be registered in the official Bosch Flow / One Bike App before pairing with Homey

-----

## Changelog

### v0.1.0 — Initial working version

- OAuth2 PKCE authentication via Bosch Flow app credentials
- Battery state of charge (%) polling
- Device pairing using Homey `login_credentials` template

### v0.2.0 — Battery details

- Remaining energy (Wh), battery capacity, charge cycles, lifetime energy
- Fixed unit conversion: `remainingEnergyForRider / 10` = correct Wh value

### v0.3.0 — Range & odometer

- Per-mode range estimates (Eco, Tour/eMTB, Sport, Turbo)
- Odometer, motor hours (total and assist), max assist speed
- Charging status indicator

### v0.4.0 — Per-mode statistics

- Cumulative distance and energy per assist mode (Off / Eco / Tour / Sport / Turbo)
- Source: `driveUnitAssistModes[0–4]` from bike profile API

### v0.5.0 — Capability cleanup & migration

- Removed unused capabilities, added automatic migration on device init
- Fixed capability naming convention (underscores, no dots)

### v0.6.0 — Pairing & repair improvements

- Repair option via device menu
- Re-authentication without removing device

### v0.7.0 — App settings & debug logging

- Tabbed settings page (Setup / Debug)
- PKCE URL generator with Copy button
- Live debug log viewer

### v0.8.0 — Icons & polish

- SVG icons for all 27 capabilities
- App brand color set to Bosch red (#E20015)

### v0.9.0 — Hardware info & bike photo

- Bike photo as device tile camera image
- Full hardware details in Advanced Settings
- Migrated to Homey Compose (`driver.settings.compose.json`)

### v1.0.0 — Debug improvements & polish

- Split debug log into two sections: poll data (overwrites each poll) and auth events (last 20)
- Updated setup instructions — corrected re-auth path to Advanced Settings → Connection
- Added 60-second code expiry warning to setup page
- Brand color set to Bosch red (#E20015) throughout UI
- Migrated to Homey Compose structure for proper Advanced Settings support

### v1.0.1 — Metadata update, no code changes

- Added source code into app.json
- Simple version bump

-----

## Project Structure

```
com.bosch.ebike/
├── app.js                          # App entry point, debug logging
├── app.json                        # Generated manifest (do not edit directly)
├── package.json
├── .homeycompose/
│   ├── app.json                    # App manifest source (edit this)
│   ├── capabilities/               # One JSON file per custom capability
│   └── flow/                       # Flow triggers and conditions
├── settings/
│   └── index.html                  # App settings UI (Setup + Debug tabs)
├── assets/
│   ├── icon.svg
│   ├── images/                     # App store icons
│   └── capabilities/               # SVG icon per capability
├── lib/
│   ├── BoschEBikeApi.js            # API client, PKCE, token exchange, parsing
│   └── constants.js                # Capability name constants
└── drivers/ebike/
    ├── driver.compose.json         # Driver manifest (Homey Compose)
    ├── driver.settings.compose.json # Advanced Settings definition
    ├── driver.js                   # Pairing, repair, token exchange
    └── device.js                   # Polling, capability updates, token refresh
```

-----

## Related Projects

- **[hass-bosch-ebike](https://github.com/Phil-Barker/hass-bosch-ebike)** by Phil Barker — Home Assistant integration for Bosch Smart System eBikes. The starting point that revealed the API endpoints, authentication flow, and data structure used in this app. If you use Home Assistant, check it out.

This app was designed and built in collaboration with **[Claude](https://claude.ai)** (Anthropic).

-----

## Contributing

Pull requests welcome. Especially:

- Testing with different battery models (PowerTube 400, 500, 625, 750)
- Testing with different motor generations (Performance Line, CX, Cargo Line)
- Translations

Please open an issue to discuss before submitting a pull request.

-----

## License

[MIT License](LICENSE) — free to use, copy, modify, distribute. No warranty provided.
