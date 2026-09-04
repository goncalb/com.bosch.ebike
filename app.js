'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');

class BoschEBikeApp extends Homey.App {

  async onInit() {
    this.log('Bosch eBike app started');
  }

  /**
   * Maps Web-API device ids (what widgets' Homey.getDeviceIds() returns)
   * to driver data ids (what the SDK exposes). Cached for 5 minutes.
   */
  async getWidgetDeviceMap() {
    const now = Date.now();
    if (this._deviceMap && now - this._deviceMapTime < 5 * 60 * 1000) {
      return this._deviceMap;
    }
    if (!this._homeyApi) {
      this._homeyApi = await HomeyAPI.createAppAPI({ homey: this.homey });
    }
    const devices = await this._homeyApi.devices.getDevices();
    const map = {};
    for (const d of Object.values(devices)) {
      if (d.driverId && String(d.driverId).endsWith(':ebike')) {
        map[d.id] = { dataId: d.data && d.data.id, name: d.name };
      }
    }
    this._deviceMap = map;
    this._deviceMapTime = now;
    return map;
  }

  // Called by devices to save poll debug data (overwrites — only last poll kept)
  async saveDebugLog(data) {
    await this.homey.settings.set('debugLog', data);
  }

  // Called by devices to save auth/pair events (appends last 10)
  async saveAuthLog(message) {
    const existing = this.homey.settings.get('debugAuthLog') || '';
    const lines = existing ? existing.split('\n').filter(Boolean) : [];
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    lines.unshift('[' + ts + '] ' + message);
    const trimmed = lines.slice(0, 20).join('\n');
    await this.homey.settings.set('debugAuthLog', trimmed);
  }

}

module.exports = BoschEBikeApp;

