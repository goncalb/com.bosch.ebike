'use strict';

const {
  OAUTH2_AUTH_URL,
  OAUTH2_TOKEN_URL,
  OAUTH2_REDIRECT_URI,
  CLIENT_ID,
  SCOPE,
  API_BASE_URL,
  THEFT_DETECTION_BASE_URL,
  ACTIVITY_BASE_URL,
  ENDPOINTS,
} = require('./constants');

const nodeCrypto = require('crypto');

// Prefer IPv4: avoids undici 'fetch failed' errors on networks where IPv6
// is advertised but not routable (common in Docker / some ISPs).
try { require('dns').setDefaultResultOrder('ipv4first'); } catch (e) { /* ignore */ }

// Unwrap undici's generic 'fetch failed' to expose the real network cause.
function describeFetchError(err) {
  const cause = err && err.cause;
  if (!cause) return err.message;
  const detail = cause.code || cause.message || String(cause);
  return `${err.message} (${detail})`;
}

// Node 18+ (Homey Pro SDK3) ships a global fetch — no dependency needed.
async function getFetch() {
  return fetch;
}

function generateCodeVerifier(length = 64) {
  // RFC 7636 unreserved characters, generated from a CSPRNG.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = nodeCrypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(bytes[i] % chars.length);
  }
  return result;
}

async function generateCodeChallenge(verifier) {
  return nodeCrypto.createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

class BoschEBikeApi {
  constructor({ accessToken, refreshToken, expiresAt, onTokenRefresh } = {}) {
    this.accessToken     = accessToken   || null;
    this.refreshToken    = refreshToken  || null;
    this.expiresAt       = expiresAt     || 0;
    this.onTokenRefresh  = onTokenRefresh || null;
    this._pkceVerifier   = null;
  }

  // ── Auth URL ──────────────────────────────────────────────────────────────

  async buildAuthorizationUrl() {
    const state     = nodeCrypto.randomBytes(16).toString('hex');
    const verifier  = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    this._pkceVerifier = verifier;

    const url = new URL(OAUTH2_AUTH_URL);
    url.searchParams.set('client_id',             CLIENT_ID);
    url.searchParams.set('redirect_uri',          OAUTH2_REDIRECT_URI);
    url.searchParams.set('response_type',         'code');
    url.searchParams.set('scope',                 SCOPE);
    url.searchParams.set('state',                 state);
    url.searchParams.set('code_challenge',        challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('kc_idp_hint',           'skid');
    url.searchParams.set('prompt',                'login');

    return { url: url.toString(), state, verifier };
  }

  // ── Token exchange ────────────────────────────────────────────────────────

  async exchangeCodeForToken(code, verifier) {
    const fetch = await getFetch();

    const resp = await fetch(OAUTH2_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     CLIENT_ID,
        redirect_uri:  OAUTH2_REDIRECT_URI,
        code,
        code_verifier: verifier || this._pkceVerifier || '',
      }).toString(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Token exchange failed (${resp.status}): ${text}`);
    }

    const json = await resp.json();
    this._applyTokenResponse(json);
    return this._tokenData();
  }

  // ── Token refresh ─────────────────────────────────────────────────────────

  async refreshAccessToken() {
    if (!this.refreshToken) throw new Error('No refresh token stored');

    const fetch = await getFetch();

    const resp = await fetch(OAUTH2_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     CLIENT_ID,
        refresh_token: this.refreshToken,
      }).toString(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Token refresh failed (${resp.status}): ${text}`);
    }

    const json = await resp.json();
    this._applyTokenResponse(json);
    if (this.onTokenRefresh) this.onTokenRefresh(this._tokenData());
    return this._tokenData();
  }

  _applyTokenResponse(json) {
    this.accessToken  = json.access_token;
    this.refreshToken = json.refresh_token || this.refreshToken;
    this.expiresAt    = Date.now() + ((json.expires_in || 7200) - 60) * 1000;
  }

  _tokenData() {
    return {
      accessToken:  this.accessToken,
      refreshToken: this.refreshToken,
      expiresAt:    this.expiresAt,
    };
  }

  async _getValidToken() {
    if (!this.accessToken) throw new Error('Not authenticated');
    if (Date.now() >= this.expiresAt) await this.refreshAccessToken();
    return this.accessToken;
  }

  // ── HTTP ──────────────────────────────────────────────────────────────────

  async _request(method, path, baseUrl = API_BASE_URL) {
    const fetch = await getFetch();
    const token = await this._getValidToken();

    let resp;
    try {
      resp = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept:        'application/json',
        'Content-Type': 'application/json',
      },
    });
    } catch (err) {
      throw new Error(`Network error calling ${baseUrl}: ${describeFetchError(err)}`);
    }

    if (resp.status === 204) return null;

    const text = await resp.text();

    if (!resp.ok) {
      throw new Error(`API error ${resp.status} for ${path}: ${text}`);
    }

    try { return JSON.parse(text); } catch { return text; }
  }

  // ── API methods ───────────────────────────────────────────────────────────

  async listBikes() {
    const data = await this._request('GET', ENDPOINTS.BIKE_PROFILE);
    if (data && Array.isArray(data.data)) return data.data;
    if (Array.isArray(data)) return data;
    return [];
  }

  async getBikeProfile(bikeId) {
    return this._request('GET', ENDPOINTS.BIKE_PROFILE_ID(bikeId));
  }

  async getStateOfCharge(bikeId) {
    try {
      return await this._request('GET', ENDPOINTS.STATE_OF_CHARGE(bikeId));
    } catch(err) {
      if (err.message.includes('404')) return null;
      throw err;
    }
  }

  // ── Parsers ───────────────────────────────────────────────────────────────

  static parseBikeName(bike) {
    const attrs  = bike.attributes || {};
    const brand  = attrs.brandName || 'eBike';
    const model  = (attrs.driveUnit && attrs.driveUnit.productName) || '';
    const frame  = attrs.frameNumber || '';
    if (model)              return `${brand} (${model})`;
    if (frame.length >= 4)  return `${brand} (...${frame.slice(-4)})`;
    return brand;
  }

  static parseStateOfCharge(soc) {
    if (!soc) return {};

    const r = Array.isArray(soc.reachableRange) ? soc.reachableRange : [];

    return {
      batteryPct:  soc.stateOfCharge          ?? null,
      batteryWh:   soc.remainingEnergyForRider != null ? Math.round(soc.remainingEnergyForRider / 10) : null,
      isCharging:  soc.chargingActive         ?? null,
      chargerConn: soc.chargerConnected        ?? null,
      odometer:    soc.odometer != null ? soc.odometer / 1000 : null,
      lastUpdate:  soc.stateOfChargeLatestUpdate || null,
      rangeEco:    r[0] ?? null,
      rangeTour:   r[1] ?? null,
      rangeEmtb:   r[1] ?? null,
      rangeSport:  r[2] ?? null,
      rangeTurbo:  r[3] ?? null,
    };
  }

  static parseProfile(profile) {
    if (!profile) return {};
    const attrs   = (profile.data && profile.data.attributes) || profile.attributes || profile;
    const battery = (attrs.batteries && attrs.batteries[0]) || {};
    const drive   = attrs.driveUnit || {};
    const cycles  = battery.numberOfFullChargeCycles || {};
    const power   = drive.powerOnTime || {};
    const modes   = Array.isArray(drive.driveUnitAssistModes) ? drive.driveUnitAssistModes : [];

    // Per-mode stats — indexed 0=off, 1=eco, 2=tour, 3=sport, 4=turbo
    const modeStats = (idx) => {
      const m = modes[idx];
      if (!m || !m.statistics) return { distKm: null, energyWh: null };
      return {
        distKm:   m.statistics.distance   != null ? Math.round(m.statistics.distance / 1000 * 10) / 10 : null,
        energyWh: m.statistics.consumedEnergy != null ? m.statistics.consumedEnergy : null,
      };
    };

    const m0 = modeStats(0);
    const m1 = modeStats(1);
    const m2 = modeStats(2);
    const m3 = modeStats(3);
    const m4 = modeStats(4);

    return {
      batteryPct:          battery.batteryLevel              ?? null,
      batteryWh:           battery.remainingEnergy           ?? null,
      batteryCapWh:        battery.totalEnergy               ?? null,
      isCharging:          battery.isCharging                ?? null,
      chargeCycles:        cycles.total                      ?? null,
      chargeCyclesOnBike:  cycles.onBike                     ?? null,
      chargeCyclesOffBike: cycles.offBike                    ?? null,
      lifetimeEnergyWh:    battery.deliveredWhOverLifetime   ?? null,
      odometer:            drive.totalDistanceTraveled != null ? drive.totalDistanceTraveled / 1000 : null,
      motorTotalHours:     power.total                       ?? null,
      motorAssistHours:    power.withMotorSupport            ?? null,
      maxAssistSpeed:      drive.maxAssistanceSpeed          ?? null,
      // Per-mode distance
      distOff:             m0.distKm,
      distEco:             m1.distKm,
      distTour:            m2.distKm,
      distSport:           m3.distKm,
      distTurbo:           m4.distKm,
      // Per-mode energy
      energyOff:           m0.energyWh,
      energyEco:           m1.energyWh,
      energyTour:          m2.energyWh,
      energySport:         m3.energyWh,
      energyTurbo:         m4.energyWh,
      // Hardware info
      hardware: {
        bikeBrand:           attrs.brandName                                              ?? null,
        bikeCategory:        drive.bikeCategory                                           ?? null,
        oemBikeId:           drive.oemBikeId                                              ?? null,
        gearingSystem:       drive.gearingSystem                                          ?? null,
        bikeImageUrl:        (attrs.mediaAssets && attrs.mediaAssets.bike_picture_url)    ?? null,
        batteryName:         battery.productName                                          ?? null,
        batterySerial:       battery.serialNumber                                         ?? null,
        batteryFirmware:     battery.softwareVersion                                      ?? null,
        batteryHardware:     battery.hardwareVersion                                      ?? null,
        batteryMfgDate:      battery.manufacturingDate                                    ?? null,
        batteryPartNumber:   battery.partNumber                                           ?? null,
        motorName:           drive.productName                                            ?? null,
        motorSerial:         drive.serialNumber                                           ?? null,
        motorFirmware:       drive.softwareVersion                                        ?? null,
        motorHardware:       drive.hardwareVersion                                        ?? null,
        motorMfgDate:        drive.manufacturingDate                                      ?? null,
        motorPartNumber:     drive.partNumber                                             ?? null,
        motorProductLine:    drive.productLine                                            ?? null,
        connectName:         (attrs.connectedModule && attrs.connectedModule.productName)       ?? null,
        connectSerial:       (attrs.connectedModule && attrs.connectedModule.serialNumber)      ?? null,
        connectFirmware:     (attrs.connectedModule && attrs.connectedModule.softwareVersion)   ?? null,
        connectMfgDate:      (attrs.connectedModule && attrs.connectedModule.manufacturingDate) ?? null,
        remoteName:          (attrs.remoteControl && attrs.remoteControl.productName)       ?? null,
        remoteSerial:        (attrs.remoteControl && attrs.remoteControl.serialNumber)      ?? null,
        remoteFirmware:      (attrs.remoteControl && attrs.remoteControl.softwareVersion)   ?? null,
        remoteMfgDate:       (attrs.remoteControl && attrs.remoteControl.manufacturingDate) ?? null,
        headUnitName:        (attrs.headUnit && attrs.headUnit.productName)       ?? null,
        headUnitSerial:      (attrs.headUnit && attrs.headUnit.serialNumber)      ?? null,
        headUnitFirmware:    (attrs.headUnit && attrs.headUnit.softwareVersion)   ?? null,
        headUnitMfgDate:     (attrs.headUnit && attrs.headUnit.manufacturingDate) ?? null,
      },
    };
  }


  /**
   * Last known location(s) from the theft-detection service.
   * Requires a ConnectModule registered for the eBike Alarm feature.
   * Returns null when the service has no data for this bike (404).
   */
  async getLatestLocations(bikeId) {
    try {
      return await this._request('GET', ENDPOINTS.LATEST_LOCATIONS(bikeId), THEFT_DETECTION_BASE_URL);
    } catch (err) {
      if (/API error 40[34]/.test(err.message)) return null;
      throw err;
    }
  }

  /**
   * Most recent ride(s) from the rider-activity service, newest first.
   * Returns null when the service has no data (404).
   */
  async getLastActivities(size = 1) {
    try {
      return await this._request('GET', ENDPOINTS.ACTIVITIES(size), ACTIVITY_BASE_URL);
    } catch (err) {
      if (/API error 40[34]/.test(err.message)) return null;
      throw err;
    }
  }

  /** Theft-detection registration status (payload undocumented; used for discovery). */
  async getTheftRegistrations(bikeId) {
    try {
      return await this._request('GET', `/v0/registrations?bikeId=${encodeURIComponent(bikeId)}`, THEFT_DETECTION_BASE_URL);
    } catch (err) {
      if (/API error 40[34]/.test(err.message)) return null;
      throw err;
    }
  }

  /** Full detail of one activity (includes the GPS polyline). */
  async getActivityDetail(activityId) {
    try {
      return await this._request('GET', `/v1/activity/${encodeURIComponent(activityId)}/detail`, ACTIVITY_BASE_URL);
    } catch (err) {
      if (/API error 40[34]/.test(err.message)) return null;
      throw err;
    }
  }
}

module.exports = BoschEBikeApi;

