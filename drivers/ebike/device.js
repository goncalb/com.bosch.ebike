'use strict';

const Homey         = require('homey');
const BoschEBikeApi = require('../../lib/BoschEBikeApi');
const { CAP, POLL_INTERVAL_STATUS_MS, POLL_INTERVAL_ACTIVITIES_MS } = require('../../lib/constants');

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
];

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

    this._lastChargingState = null;
    this._lastBatteryPct    = null;
    this._batteryBelowFired = false;

    await this._pollStatus();

    this._statusInterval = this.homey.setInterval(
      () => this._pollStatus(),
      POLL_INTERVAL_STATUS_MS
    );
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
      await this._applyStatus(merged);
      await this._applyProfile(prof);

      this.log('Poll complete');
      this.setAvailable();
    } catch(err) {
      this.error('Poll error:', err.message);
      this.error('Poll stack:', err.stack);
      await this.homey.app.saveDebugLog('POLL ERROR: ' + err.message + '\n\n' + err.stack);
      this.setUnavailable(err.message);
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
        if (prevPct !== null && nowPct < prevPct) {
          this._batteryBelowFired = false;
          await this.driver.triggerBatteryBelow(this, nowPct);
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
        this.log('Current settings keys:', Object.keys(currentSettings).filter(k => k.startsWith('hw_')).join(', ') || 'none');
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
  }

}

module.exports = EBikeDevice;

