'use strict';

const Homey         = require('homey');
const BoschEBikeApi = require('../../lib/BoschEBikeApi');

class EBikeDriver extends Homey.Driver {

  async onInit() {
    this.log('EBike driver initialized');

    this._chargingStartedTrigger = this.homey.flow.getDeviceTriggerCard('ebike_charging_started');
    this._chargingStoppedTrigger = this.homey.flow.getDeviceTriggerCard('ebike_charging_stopped');
    this._batteryBelowTrigger    = this.homey.flow.getDeviceTriggerCard('ebike_battery_below');

    this.homey.flow.getConditionCard('ebike_is_charging')
      .registerRunListener(async (args) => {
        return args.device.getCapabilityValue('ebike_charging') === true;
      });

    this.homey.flow.getConditionCard('ebike_battery_level_condition')
      .registerRunListener(async (args) => {
        const pct = args.device.getCapabilityValue('measure_battery');
        return args.invert ? pct < args.percentage : pct >= args.percentage;
      });
  }

  async triggerChargingStarted(device) {
    return this._chargingStartedTrigger.trigger(device);
  }

  async triggerChargingStopped(device) {
    return this._chargingStoppedTrigger.trigger(device);
  }

  async triggerBatteryBelow(device, pct) {
    return this._batteryBelowTrigger.trigger(device, {}, { percentage: pct });
  }

  async onPair(session) {
    let api    = null;
    let tokens = null;

    api = new BoschEBikeApi({});

    session.setHandler('login', async ({ username, password }) => {
      const code = (password || '').trim();

      if (!code) {
        throw new Error('Go to the Bosch eBike app settings, copy the login URL, sign in, then paste the code here.');
      }

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
      this.log('Code length:', finalCode.length);
      this.log('Verifier:', pkceVerifier ? 'found' : 'missing');

      try {
        tokens = await api.exchangeCodeForToken(finalCode, pkceVerifier || null);
        this.log('Token exchange successful');
        if (pkceVerifier) await this.homey.settings.unset('pkceVerifier');
        return true;
      } catch(err) {
        this.log('Token exchange failed:', err.message);
        throw new Error(err.message);
      }
    });

    session.setHandler('list_devices', async () => {
      if (!tokens) throw new Error('Not authenticated yet.');

      const bikes = await api.listBikes();
      this.log('Bikes found:', bikes ? bikes.length : 0);

      if (!bikes || bikes.length === 0) {
        throw new Error('No eBikes found. Make sure your bike is registered in the Bosch Flow app.');
      }

      return bikes.map((bike) => ({
        name: BoschEBikeApi.parseBikeName(bike),
        data: { id: bike.id || bike.bikeId },
        store: {
          accessToken:  tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt:    tokens.expiresAt,
        },
      }));
    });
  }

  async onRepair(session, device) {
    this.log('onRepair called for:', device.getName());

    session.setHandler('login', async ({ username, password }) => {
      const code = (password || '').trim();

      if (!code) {
        throw new Error('Go to the Bosch eBike app settings, copy the login URL, sign in, then paste the code here.');
      }

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
      this.log('Repair code length:', finalCode.length);

      const api = new BoschEBikeApi({});

      try {
        const tokens = await api.exchangeCodeForToken(finalCode, pkceVerifier || null);
        this.log('Repair: token exchange successful');

        await device.setStoreValue('accessToken',  tokens.accessToken);
        await device.setStoreValue('refreshToken', tokens.refreshToken);
        await device.setStoreValue('expiresAt',    tokens.expiresAt);

        if (pkceVerifier) await this.homey.settings.unset('pkceVerifier');

        device._initApi();
        await device._pollStatus();
        device.setAvailable();

        return true;
      } catch(err) {
        this.log('Repair failed:', err.message);
        throw new Error('Authentication failed: ' + err.message);
      }
    });
  }

}

module.exports = EBikeDriver;

