'use strict';

const Homey = require('homey');

class BoschEBikeApp extends Homey.App {

  async onInit() {
    this.log('Bosch eBike app started');
  }

  // Called by devices to save debug data
  async saveDebugLog(data) {
    const existing = this.homey.settings.get('debugLog') || '';
    await this.homey.settings.set('debugLog', data + '\n\n' + existing);
  }

}

module.exports = BoschEBikeApp;

