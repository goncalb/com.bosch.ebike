'use strict';

const Homey         = require('homey');
const BoschEBikeApi = require('../../lib/BoschEBikeApi');
const { CAP, POLL_INTERVAL_STATUS_MS, POLL_INTERVAL_ACTIVITIES_MS } = require('../../lib/constants');

const LOC_POLL_BASE_MS   = 5 * 60 * 1000;   // baseline vigilance
const LOC_POLL_FAST_MS   = 60 * 1000;       // escalated (possible theft)
const LOC_ALERT_WINDOW_MS = 15 * 60 * 1000; // how long to stay escalated after last idle change
const REG_RECHECK_MS     = 24 * 60 * 60 * 1000;

const ALL_CAPABILITIES = [
  'measure_battery',
  'ebike_charging',
  'ebike_battery_energy_remaining',
  'ebike_battery_capacity',
  'meter_distance',
  'ebike_charge_cycles',
  'ebike_charge_cycles_on_bike',
  'ebike_charge_cycles_off_bike',
  'ebike_lifetime_energy',
  'measure_range_eco',
  'measure_range_tour',
  'measure_range_sport',
  'measure_range_emtb',
  'measure_range_turbo',
  'meter_motor_hours',
  'ebike_motor_hours_assist',
  'ebike_max_assist_speed',
  'ebike_dist_off',
  'ebike_dist_eco',
  'ebike_dist_tour',
  'ebike_dist_sport',
  'ebike_dist_turbo',
  'ebike_energy_off',
  'ebike_energy_eco',
  'ebike_energy_tour',
  'ebike_energy_sport',
  'ebike_energy_turbo',
  'ebike_last_location',
];

// Google encoded polyline decoder -> [[lat, lng], ...]
function decodePolyline(str) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  try {
    while (index < str.length) {
      for (const which of [0, 1]) {
        let result = 0, shift = 0, b;
        do {
          b = str.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        const delta = (result & 1) ? ~(result >> 1) : (result >> 1);
        if (which === 0) lat += delta; else lng += delta;
      }
      points.push([lat / 1e5, lng / 1e5]);
    }
  } catch (e) { /* malformed tail - return what we have */ }
  return points;
}

// Depth-limited search for a string value under the given key name.
function findStringKeyDeep(obj, key, depth) {
  if (!obj || typeof obj !== 'object' || depth < 0) return null;
  if (typeof obj[key] === 'string' && obj[key].length > 0) return obj[key];
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const found = findStringKeyDeep(v, key, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

// Compact structural description of an object for diagnostics.
function describeShape(obj, depth) {
  if (obj === null || obj === undefined) return String(obj);
  if (Array.isArray(obj)) {
    return depth <= 0 || obj.length === 0
      ? `[${obj.length}]`
      : `[${obj.length}x ${describeShape(obj[0], depth - 1)}]`;
  }
  if (typeof obj !== 'object') return typeof obj;
  if (depth <= 0) return '{...}';
  return '{' + Object.entries(obj)
    .map(([k, v]) => `${k}:${describeShape(v, depth - 1)}`)
    .join(',') + '}';
}

// Pull [lat, lng] out of one activity sample, tolerating different key
// names and one level of nesting (e.g. { location: { latitude, longitude } }).
function extractLatLng(el, depth = 2) {
  if (!el || typeof el !== 'object' || depth < 0) return null;
  const lat = el.latitude ?? el.lat;
  const lng = el.longitude ?? el.lng ?? el.lon;
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    const la = Number(lat), lo = Number(lng);
    if (la !== 0 || lo !== 0) return [la, lo];
    return null;
  }
  for (const v of Object.values(el)) {
    if (v && typeof v === 'object') {
      const p = extractLatLng(v, depth - 1);
      if (p) return p;
    }
  }
  return null;
}

// Keep at most maxPoints evenly spaced points (always keeping first + last).
function downsampleTrack(pts, maxPoints) {
  if (pts.length <= maxPoints) return pts;
  const out = [];
  const step = (pts.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) out.push(pts[Math.round(i * step)]);
  return out;
}

class EBikeDevice extends Homey.Device {

  async onInit() {
    this.log(`Device init: ${this.getName()}`);

    // Add any capabilities missing on existing devices
    for (const cap of ALL_CAPABILITIES) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap);
        this.log('Added missing capability:', cap);
      }
    }

    // Initialize hardware settings for existing devices (added after initial pairing)
    const HW_SETTINGS_DEFAULTS = {
      hw_bike_brand: '', hw_bike_category: '', hw_bike_oem_id: '', hw_bike_gearing: '',
      hw_batt_name: '', hw_batt_serial: '', hw_batt_firmware: '', hw_batt_hardware: '',
      hw_batt_part: '', hw_batt_mfg_date: '',
      hw_motor_name: '', hw_motor_line: '', hw_motor_serial: '', hw_motor_firmware: '',
      hw_motor_hardware: '', hw_motor_part: '', hw_motor_mfg_date: '',
      hw_connect_name: '', hw_connect_serial: '', hw_connect_firmware: '', hw_connect_mfg_date: '',
      hw_remote_name: '', hw_remote_serial: '', hw_remote_firmware: '', hw_remote_mfg_date: '',
      hw_head_name: '', hw_head_serial: '', hw_head_firmware: '', hw_head_mfg_date: '',
    };
    const currentSettings = this.getSettings();
    const missingSettings = {};
    for (const [key, val] of Object.entries(HW_SETTINGS_DEFAULTS)) {
      if (!(key in currentSettings)) missingSettings[key] = val;
    }
    if (Object.keys(missingSettings).length > 0) {
      await this.setSettings(missingSettings);
      this.log('Initialized missing hardware settings:', Object.keys(missingSettings).join(', '));
    }

    // Remove old capabilities that are no longer supported
    const REMOVED_CAPS = [
      'ebike_next_service',
      'ebike_last_ride_distance', 'ebike_last_ride_duration',
      'ebike_last_ride_avg_speed', 'ebike_last_ride_max_speed',
      'ebike_last_ride_avg_cadence', 'ebike_last_ride_max_cadence',
      'ebike_last_ride_avg_power', 'ebike_last_ride_max_power',
      'ebike_last_ride_calories', 'ebike_last_ride_elevation_gain',
      'ebike_last_ride_elevation_loss', 'ebike_total_rides',
      'ebike_total_activity_distance', 'ebike_total_ride_time',
      'ebike_total_calories', 'ebike_total_elevation_gain',
    ];
    for (const cap of REMOVED_CAPS) {
      if (this.hasCapability(cap)) {
        await this.removeCapability(cap);
        this.log('Removed obsolete capability:', cap);
      }
    }

    this._initApi();

    // Create persistent image object for bike photo
    this._bikeImage = await this.homey.images.createImage();

    // Seed from last known capability values so threshold triggers still
    // work correctly across app restarts.
    this._lastChargingState = this.getCapabilityValue('ebike_charging');
    this._lastBatteryPct    = this.getCapabilityValue('measure_battery');
    this._failedPolls       = 0;

    await this._pollStatus();
    await this._pollActivities();

    this._statusInterval = this.homey.setInterval(
      () => this._pollStatus(),
      POLL_INTERVAL_STATUS_MS
    );

    this._activitiesInterval = this.homey.setInterval(
      () => this._pollActivities(),
      POLL_INTERVAL_ACTIVITIES_MS
    );

    // Adaptive location loop (first run shortly after startup)
    this._scheduleLocationPoll(10 * 1000);
  }

  // ── API client setup ────────────────────────────────────────────────────────

  _initApi() {
    const { id: bikeId } = this.getData();
    const { accessToken, refreshToken, expiresAt } = this.getStore();

    this._bikeId = bikeId;

    this._api = new BoschEBikeApi({
      accessToken,
      refreshToken,
      expiresAt,
      onTokenRefresh: (tokens) => {
        this._saveTokens(tokens);
        this.homey.app.saveAuthLog('Token refreshed for ' + this.getName()).catch(() => {});
      },
    });
  }

  async _saveTokens({ accessToken, refreshToken, expiresAt }) {
    await this.setStoreValue('accessToken',  accessToken);
    await this.setStoreValue('refreshToken', refreshToken);
    await this.setStoreValue('expiresAt',    expiresAt);
    this._api.accessToken  = accessToken;
    this._api.refreshToken = refreshToken;
    this._api.expiresAt    = expiresAt;
  }

  // ── Status polling (every 5 min) ────────────────────────────────────────────

  /**
   * Poll the theft-detection service for the last known location.
   * Best-effort: any error is logged and swallowed, so this never breaks
   * the main status poll. The response schema is an unofficial v0 API,
   * so parsing is defensive.
   */
  /** Adaptive location loop: 5 min baseline; 60 s for 15 min after an idle
   * location change; bikes without theft registration skipped (daily recheck). */
  _scheduleLocationPoll(delayMs) {
    if (this._locTimeout) this.homey.clearTimeout(this._locTimeout);
    this._locTimeout = this.homey.setTimeout(async () => {
      let next = LOC_POLL_BASE_MS;
      try {
        // Registration gating (checked at start, re-checked daily on 404)
        const now = Date.now();
        if (this._hasTheftReg === undefined || (this._hasTheftReg === false && now - this._regCheckedAt > REG_RECHECK_MS)) {
          try {
            const reg = await this._api.getTheftRegistrations(this._bikeId);
            this._hasTheftReg = !!(reg && Array.isArray(reg.registrations) && reg.registrations.length);
            this._regCheckedAt = now;
            this.log('Theft-detection registration:', this._hasTheftReg ? 'present' : 'absent');
          } catch (err) {
            this.log('Theft registration check failed:', err.message);
          }
        }

        if (this._hasTheftReg !== false) {
          await this._pollLocation();
        }

        if (this._locAlertUntil && Date.now() < this._locAlertUntil) {
          next = LOC_POLL_FAST_MS;
        } else if (this._locAlertUntil) {
          this._locAlertUntil = null;
          this.log('Location polling back to baseline');
        }
      } catch (err) {
        this.error('Location loop error:', err.message);
      }
      this._scheduleLocationPoll(next);
    }, delayMs);
  }

  async _pollLocation() {
    const suppressTrigger = this._inUse === true
      || (this._lastRidingAt && Date.now() - this._lastRidingAt < 10 * 60 * 1000);
    try {

      const data = await this._api.getLatestLocations(this._bikeId);
      if (!data) { this.log('Location poll: no data (service returned 404)'); return; }
      const list = data.locations || data.items || data.data || (Array.isArray(data) ? data : null);
      if (!Array.isArray(list)) {
        this.log('Location poll: unexpected response shape, keys:', Object.keys(data).join(','));
        return;
      }
      if (list.length === 0) {
        this.log('Location poll: no location reports yet');
        await this.setStoreValue('locCheckOkAt', new Date().toISOString());
        return;
      }

      const raw = list[0] || {};
      const loc = raw.attributes || raw;  // JSON:API resources wrap fields in attributes
      const lat = Number(loc.latitude ?? loc.lat);
      const lng = Number(loc.longitude ?? loc.lng ?? loc.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const accuracy = Number(loc.horizontalAccuracy ?? loc.accuracy ?? 0) || null;
      // Timestamp key is not documented; try common names.
      const ts = loc.timestamp ?? loc.recordedAt ?? loc.createdAt ?? loc.lastUpdate
              ?? loc.date ?? loc.time ?? null;

      const entry = { lat, lng, accuracy, ts, fetchedAt: new Date().toISOString() };
      const key   = `${lat.toFixed(6)},${lng.toFixed(6)},${ts ?? ''}`;
      const prevKey = this.getStoreValue('lastLocationKey');

      await this.setStoreValue('lastLocation', entry);
      await this.setStoreValue('lastLocationKey', key);
      await this.setStoreValue('locCheckOkAt', new Date().toISOString());
      await this._setCapSafe(CAP.LAST_LOCATION, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);

      // New report while idle => possible alarm (module only wakes for
      // power-on, charging, or its motion alarm).
      if (prevKey && prevKey !== key) {
        const tokens = {
          latitude:  lat,
          longitude: lng,
          accuracy:  accuracy ?? 0,
          maps_url:  `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`,
        };

        // Escalate polling while the bike moves without being in use.
        if (!suppressTrigger) {
          const wasAlert = !!this._locAlertUntil;
          this._locAlertUntil = Date.now() + LOC_ALERT_WINDOW_MS;
          if (!wasAlert) {
            this.log('Idle location change - escalating location polling to 60s');
            this._scheduleLocationPoll(LOC_POLL_FAST_MS);
          }
        }

        // Raw trigger: every new location report, no filtering.
        await this.driver.triggerLocationUpdated(this, tokens).catch(err =>
          this.error('Location updated trigger error:', err.message));

        // Filtered trigger: only when the bike is idle (not charging, not ridden).
        if (!suppressTrigger) {
          await this.driver.triggerMoved(this, tokens).catch(err =>
            this.error('Moved trigger error:', err.message));
        }
      }
    } catch (err) {
      this.log('Location poll skipped:', err.message);
    }
  }

  // ── Activity polling (every 30 min) ─────────────────────────────────────────

  /** Poll the rider-activity service for the most recent ride (best-effort). */
  async _pollActivities() {
    try {
      const data = await this._api.getLastActivities(10);
      if (!data) { this.log('Activity poll: no data (service returned 404)'); return; }
      const items = data && (data.items || data.content || data.data || (Array.isArray(data) ? data : null));
      if (!Array.isArray(items)) {
        this.log('Activity poll: unexpected response shape, keys:', Object.keys(data).join(','));
        return;
      }
      if (items.length === 0) { this.log('Activity poll: no rides in history'); return; }

      // Activity service uses its own bike id space: match all known ids.
      const settings = this.getSettings();
      const knownIds = new Set([
        this._bikeId,
        settings.hw_bike_oem_id,
        settings.hw_motor_serial,
        settings.hw_connect_serial,
      ].filter(Boolean).map(v => String(v).toLowerCase()));

      const deviceCount = this.driver.getDevices().length;
      let item = null;
      for (const it of items) {
        const attrs = it.attributes || it;
        const rideBike = attrs.bikeId ?? it.bikeId ?? null;
        if (!rideBike || knownIds.has(String(rideBike).toLowerCase())) { item = it; break; }
      }

      if (!item) {
        if (deviceCount === 1) {
          // Single bike: all rides are ours regardless of id format.
          item = items[0];
        } else {
          const seen = [...new Set(items.map(it => (it.attributes || it).bikeId).filter(Boolean))];
          this.log(`Activity poll: no ride matched this bike. Known ids: [${[...knownIds].join(', ')}], ride bikeIds seen: [${seen.join(', ')}]`);
          return;
        }
      }

      const a = item.attributes || item;

      const toEpochMs = (t) => {
        if (t === null || t === undefined) return null;
        if (typeof t === 'number') return t > 1e12 ? t : t * 1000;
        const p = Date.parse(t);
        return Number.isFinite(p) ? p : null;
      };

      const startMs = toEpochMs(a.startTime);
      const endMs   = toEpochMs(a.endTime);

      const ride = {
        id:            item.id ?? a.id ?? null,
        title:         a.title ?? null,
        distanceKm:    Number.isFinite(Number(a.distance)) ? Math.round(Number(a.distance) / 10) / 100 : null,
        durationMin:   Number.isFinite(Number(a.durationWithoutStops))
                         ? Math.round(Number(a.durationWithoutStops) / 60)
                         : (startMs && endMs ? Math.round((endMs - startMs) / 60000) : null),
        avgSpeed:      a.averageSpeed ?? null,
        avgPower:      a.averagePower ?? a.avgPower ?? null,
        avgCadence:    a.averageCadence ?? a.avgCadence ?? a.cadence ?? null,
        durationSec:   Number.isFinite(Number(a.durationWithoutStops))
                         ? Math.round(Number(a.durationWithoutStops))
                         : null,
        maxSpeed:      a.maximumSpeed ?? null,
        elevationGain: a.elevationGain ?? null,
        calories:      a.caloriesBurnt ?? null,
        co2SavedGrams: a.co2EmissionsCarEquivalentGrams ?? null,
        polyline:      typeof a.polyline === 'string' ? a.polyline : null,
        startTime:     startMs ? new Date(startMs).toISOString() : null,
        endTime:       endMs ? new Date(endMs).toISOString() : null,
        fetchedAt:     new Date().toISOString(),
      };

      // GPS track comes from the detail endpoint.
      if (!ride.polyline && ride.id) {
        try {
          const detail = await this._api.getActivityDetail(ride.id);
          const found = findStringKeyDeep(detail, 'polyline', 5);
          if (found) {
            ride.polyline = found;
          } else {
            // The detail returns a raw sample stream (activityData: [N]).
            const samples = detail && detail.data && detail.data.attributes
              && detail.data.attributes.activityData;
            if (Array.isArray(samples) && samples.length) {
              const pts = [];
              for (const el of samples) {
                const p = extractLatLng(el);
                if (p) pts.push(p);
              }
              if (pts.length >= 2) {
                ride.track = downsampleTrack(pts, 300);
              } else {
                this.log('Activity detail: could not extract coordinates. First sample:',
                  describeShape(samples[0], 3).slice(0, 500));
              }
            } else if (detail) {
              this.log('Activity detail: no polyline. Structure:', describeShape(detail, 3).slice(0, 600));
            }
          }
        } catch (err) {
          this.log('Activity detail fetch failed:', err.message);
        }
      }

      const key = `${ride.id ?? ''}|${ride.startTime ?? ''}|${ride.distanceKm ?? ''}`;
      const prevKey = this.getStoreValue('lastRideKey');

      await this.setStoreValue('lastRide', ride);
      await this.setStoreValue('lastRideKey', key);

      // Location fallback: end point of the last ride's track.
      if (!this.getStoreValue('lastLocation') && (ride.polyline || ride.track)) {
        const pts = ride.track || decodePolyline(ride.polyline);
        if (pts.length) {
          const end = pts[pts.length - 1];
          await this.setStoreValue('lastLocation', {
            lat: end[0], lng: end[1], accuracy: null,
            ts: ride.endTime, fetchedAt: new Date().toISOString(),
            source: 'ride',
          });
          await this._setCapSafe(CAP.LAST_LOCATION, `${end[0].toFixed(5)}, ${end[1].toFixed(5)}`);
        }
      }

      if (prevKey && prevKey !== key) {
        const tokens = {
          title:        ride.title ?? '',
          distance_km:  ride.distanceKm ?? 0,
          duration_min: ride.durationMin ?? 0,
          avg_speed:    Number(ride.avgSpeed) || 0,
          calories:     Number(ride.calories) || 0,
        };
        await this.driver.triggerNewRide(this, tokens).catch(err =>
          this.error('New ride trigger error:', err.message));
      }
    } catch (err) {
      this.log('Activity poll skipped:', err.message);
    }
  }

  /** Last ride info for the dashboard widget. */
  getLastRideInfo() {
    const ride = this.getStoreValue('lastRide');
    return {
      id:   this.getData().id ?? this._bikeId,
      name: this.getName(),
      ride: ride || null,
    };
  }

  /** Location info for the dashboard widget. */
  getLocationInfo() {
    const loc = this.getStoreValue('lastLocation');
    return {
      id:   this.getData().id ?? this._bikeId,
      name: this.getName(),
      ...(loc || {}),
      hasLocation: !!(loc && Number.isFinite(loc.lat)),
      checkOkAt:   this.getStoreValue('locCheckOkAt') || null,
      checkFailAt: this.getStoreValue('locCheckFailAt') || null,
    };
  }

  async _pollStatus() {
    try {
      this.log('Polling bike:', this._bikeId);

      const socRaw  = await this._api.getStateOfCharge(this._bikeId);
      const profRaw = await this._api.getBikeProfile(this._bikeId);

      const soc  = BoschEBikeApi.parseStateOfCharge(socRaw);
      const prof = BoschEBikeApi.parseProfile(profRaw);

      // Save debug data for settings page
      const debugData =
        '=== STATE OF CHARGE ===\n' + JSON.stringify(socRaw, null, 2) +
        '\n\n=== BIKE PROFILE ===\n' + JSON.stringify(profRaw, null, 2) +
        '\n\n=== PARSED SoC ===\n' + JSON.stringify(soc, null, 2) +
        '\n\n=== PARSED PROFILE ===\n' + JSON.stringify(prof, null, 2);
      await this.homey.app.saveDebugLog(debugData);

      const merged = { ...prof, ...soc };
      const prevOdometer = this.getCapabilityValue(CAP.ODOMETER);
      await this._applyStatus(merged);
      await this._applyProfile(prof);
      const newOdometer = this.getCapabilityValue(CAP.ODOMETER);

      // Track legitimate use (charging / odometer increased) for the location loop.
      const isRiding = prevOdometer !== null && newOdometer !== null && newOdometer > prevOdometer;
      this._inUse = merged.isCharging === true || isRiding;
      if (isRiding) this._lastRidingAt = Date.now();

      this.log('Poll complete');
      this._failedPolls = 0;
      this.setAvailable();
    } catch(err) {
      this.error('Poll error:', err.message);
      await this.homey.app.saveDebugLog('POLL ERROR: ' + err.message + '\n\n' + err.stack);
      // Don't grey out the device on a single transient cloud error;
      // only mark unavailable after 3 consecutive failures.
      this._failedPolls = (this._failedPolls || 0) + 1;
      if (this._failedPolls >= 3) {
        this.setUnavailable(err.message);
      }
    }
  }

  // ── Capability setters ──────────────────────────────────────────────────────

  async _setCapSafe(capId, value) {
    if (value === null || value === undefined) return;
    if (!this.hasCapability(capId)) {
      this.log(`Skipping ${capId} — capability not found on device`);
      return;
    }
    try {
      await this.setCapabilityValue(capId, value);
    } catch(err) {
      this.error(`Failed to set ${capId}:`, err.message);
    }
  }

  async _applyStatus(s) {
    // Battery level
    if (s.batteryPct !== null && s.batteryPct !== undefined) {
      const prevPct = this._lastBatteryPct;
      const nowPct  = s.batteryPct;
      await this._setCapSafe(CAP.BATTERY_PCT, nowPct);

      try {
        if (prevPct !== null && nowPct !== prevPct) {
          await this.driver.triggerBatteryChanged(this, prevPct, nowPct);
        }
      } catch(err) {
        this.error('Battery trigger error:', err.message);
      }
      this._lastBatteryPct = nowPct;
    }

    // Remaining energy & capacity
    await this._setCapSafe(CAP.BATT_ENERGY_REM, s.batteryWh);
    await this._setCapSafe(CAP.BATT_CAPACITY,   s.batteryCapWh);

    // Charging state
    if (s.isCharging !== null && s.isCharging !== undefined) {
      const prev = this._lastChargingState;
      const now  = !!s.isCharging;
      await this._setCapSafe(CAP.CHARGING, now);

      try {
        if (prev !== null && prev !== now) {
          if (now) {
            await this.driver.triggerChargingStarted(this);
          } else {
            await this.driver.triggerChargingStopped(this);
          }
        }
      } catch(err) {
        this.error('Charging trigger error:', err.message);
      }
      this._lastChargingState = now;
    }

    // Range estimates
    await this._setCapSafe(CAP.RANGE_ECO,   s.rangeEco);
    await this._setCapSafe(CAP.RANGE_TOUR,  s.rangeTour);
    await this._setCapSafe(CAP.RANGE_SPORT, s.rangeSport);
    await this._setCapSafe(CAP.RANGE_EMTB,  s.rangeEmtb);
    await this._setCapSafe(CAP.RANGE_TURBO, s.rangeTurbo);

    // Odometer from SoC (most up to date)
    await this._setCapSafe(CAP.ODOMETER, s.odometer);
  }

  async _applyProfile(p) {
    await this._setCapSafe(CAP.BATT_CAPACITY,     p.batteryCapWh);
    await this._setCapSafe(CAP.ODOMETER,          p.odometer);
    await this._setCapSafe(CAP.MOTOR_HRS_TOTAL,   p.motorTotalHours);
    await this._setCapSafe(CAP.MOTOR_HRS_ASSIST,  p.motorAssistHours);
    await this._setCapSafe(CAP.MAX_ASSIST_SPEED,  p.maxAssistSpeed);
    await this._setCapSafe(CAP.LIFETIME_ENERGY,   p.lifetimeEnergyWh);
    await this._setCapSafe(CAP.CHARGE_CYCLES,     p.chargeCycles);
    await this._setCapSafe(CAP.CHARGE_CYCLES_ON,  p.chargeCyclesOnBike);
    await this._setCapSafe(CAP.CHARGE_CYCLES_OFF, p.chargeCyclesOffBike);
    // Per-mode distance
    await this._setCapSafe(CAP.DIST_OFF,          p.distOff);
    await this._setCapSafe(CAP.DIST_ECO,          p.distEco);
    await this._setCapSafe(CAP.DIST_TOUR,         p.distTour);
    await this._setCapSafe(CAP.DIST_SPORT,        p.distSport);
    await this._setCapSafe(CAP.DIST_TURBO,        p.distTurbo);
    // Per-mode energy
    await this._setCapSafe(CAP.ENERGY_OFF,        p.energyOff);
    await this._setCapSafe(CAP.ENERGY_ECO,        p.energyEco);
    await this._setCapSafe(CAP.ENERGY_TOUR,       p.energyTour);
    await this._setCapSafe(CAP.ENERGY_SPORT,      p.energySport);
    await this._setCapSafe(CAP.ENERGY_TURBO,      p.energyTurbo);

    // Hardware info settings
    if (p.hardware) {
      const hw = p.hardware;
      const s = (v) => (v != null ? String(v) : '');
      try {
        const currentSettings = this.getSettings();
      } catch(e) { this.log('getSettings error:', e.message); }
      try {
      await this.setSettings({
        hw_bike_brand:      s(hw.bikeBrand),
        hw_bike_category:   s(hw.bikeCategory),
        hw_bike_oem_id:     s(hw.oemBikeId),
        hw_bike_gearing:    s(hw.gearingSystem),
        hw_batt_name:       s(hw.batteryName),
        hw_batt_serial:     s(hw.batterySerial),
        hw_batt_firmware:   s(hw.batteryFirmware),
        hw_batt_hardware:   s(hw.batteryHardware),
        hw_batt_part:       s(hw.batteryPartNumber),
        hw_batt_mfg_date:   s(hw.batteryMfgDate),
        hw_motor_name:      s(hw.motorName),
        hw_motor_line:      s(hw.motorProductLine),
        hw_motor_serial:    s(hw.motorSerial),
        hw_motor_firmware:  s(hw.motorFirmware),
        hw_motor_hardware:  s(hw.motorHardware),
        hw_motor_part:      s(hw.motorPartNumber),
        hw_motor_mfg_date:  s(hw.motorMfgDate),
        hw_connect_name:     s(hw.connectName),
        hw_connect_serial:   s(hw.connectSerial),
        hw_connect_firmware: s(hw.connectFirmware),
        hw_connect_mfg_date: s(hw.connectMfgDate),
        hw_remote_name:     s(hw.remoteName),
        hw_remote_serial:   s(hw.remoteSerial),
        hw_remote_firmware: s(hw.remoteFirmware),
        hw_remote_mfg_date: s(hw.remoteMfgDate),
        hw_head_name:       s(hw.headUnitName),
        hw_head_serial:     s(hw.headUnitSerial),
        hw_head_firmware:   s(hw.headUnitFirmware),
        hw_head_mfg_date:   s(hw.headUnitMfgDate),
      });

      // Bike photo as device camera image
      if (hw.bikeImageUrl && this._bikeImage) {
        try {
          this._bikeImage.setUrl(hw.bikeImageUrl);
          await this.setCameraImage('front', this.getName(), this._bikeImage);
        } catch (err) {
          this.log('Camera image error:', err.message);
        }
      }
      } catch(e) { this.log('setSettings hardware error:', e.message); }
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async onSettings({ newSettings, changedKeys }) {
    if (changedKeys.includes('auth_code')) {
      const code = (newSettings.auth_code || '').trim();
      if (!code) return;

      this.log('Re-authentication triggered');

      let finalCode = code;
      if (code.includes('code=')) {
        try {
          const urlObj = new URL(code.replace('onebikeapp-ios://', 'https://app/'));
          finalCode = urlObj.searchParams.get('code') || code;
        } catch(e) {
          const match = code.match(/[?&]code=([^&]+)/);
          if (match) finalCode = match[1];
        }
      }
      try { finalCode = decodeURIComponent(finalCode); } catch(e) {}

      const pkceVerifier = this.homey.settings.get('pkceVerifier');
      this.log('Verifier:', pkceVerifier ? 'found' : 'missing');

      const api = new BoschEBikeApi({});

      try {
        const tokens = await api.exchangeCodeForToken(finalCode, pkceVerifier || null);
        this.log('Re-authentication successful');

        await this._saveTokens(tokens);
        this._initApi();
        await this.setSettings({ auth_code: '' });

        if (pkceVerifier) await this.homey.settings.unset('pkceVerifier');

        await this._pollStatus();
        this.setAvailable();
      } catch(err) {
        this.error('Re-authentication failed:', err.message);
        throw new Error('Re-authentication failed: ' + err.message);
      }
    }
  }

  async onDeleted() {
    this.log(`Device deleted: ${this.getName()}`);
    if (this._statusInterval) this.homey.clearInterval(this._statusInterval);
    if (this._activitiesInterval) this.homey.clearInterval(this._activitiesInterval);
    if (this._locTimeout) this.homey.clearTimeout(this._locTimeout);
  }

}

module.exports = EBikeDevice;

