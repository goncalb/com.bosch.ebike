'use strict';

const Homey = require('homey');

class BoschEBikeApp extends Homey.App {

  async onInit() {
    this.log('Bosch eBike app started');
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

