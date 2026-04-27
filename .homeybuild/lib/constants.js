'use strict';

// ─── OAuth2 ──────────────────────────────────────────────────────────────────
const OAUTH2_AUTH_URL  = 'https://p9.authz.bosch.com/auth/realms/obc/protocol/openid-connect/auth';
const OAUTH2_TOKEN_URL = 'https://p9.authz.bosch.com/auth/realms/obc/protocol/openid-connect/token';

const OAUTH2_REDIRECT_URI = 'onebikeapp-ios://com.bosch.ebike.onebikeapp/oauth2redirect';

const CLIENT_ID = 'one-bike-app';
const SCOPE     = 'openid offline_access';

// ─── API ─────────────────────────────────────────────────────────────────────
const API_BASE_URL = 'https://obc-rider-profile.prod.connected-biking.cloud';

const ENDPOINTS = {
  BIKE_PROFILE:    '/v1/bike-profile',
  BIKE_PROFILE_ID: (bikeId) => `/v1/bike-profile/${bikeId}`,
  STATE_OF_CHARGE: (bikeId) => `/v1/state-of-charge/${bikeId}`,
  PROFILE:         '/v1/profile',
};

// ─── Polling ──────────────────────────────────────────────────────────────────
const POLL_INTERVAL_STATUS_MS     = 5  * 60 * 1000;
const POLL_INTERVAL_ACTIVITIES_MS = 30 * 60 * 1000;

// ─── Homey Capability IDs ─────────────────────────────────────────────────────
const CAP = {
  BATTERY_PCT:       'measure_battery',
  CHARGING:          'ebike_charging',
  BATT_ENERGY_REM:   'ebike_battery_energy_remaining',
  BATT_CAPACITY:     'ebike_battery_capacity',
  ODOMETER:          'meter_distance',
  CHARGE_CYCLES:     'ebike_charge_cycles',
  CHARGE_CYCLES_ON:  'ebike_charge_cycles_on_bike',
  CHARGE_CYCLES_OFF: 'ebike_charge_cycles_off_bike',
  LIFETIME_ENERGY:   'ebike_lifetime_energy',
  RANGE_ECO:         'measure_range_eco',
  RANGE_TOUR:        'measure_range_tour',
  RANGE_SPORT:       'measure_range_sport',
  RANGE_EMTB:        'measure_range_emtb',
  RANGE_TURBO:       'measure_range_turbo',
  MOTOR_HRS_TOTAL:   'meter_motor_hours',
  MOTOR_HRS_ASSIST:  'ebike_motor_hours_assist',
  MAX_ASSIST_SPEED:  'ebike_max_assist_speed',
  // Per-mode distance (km)
  DIST_OFF:          'ebike_dist_off',
  DIST_ECO:          'ebike_dist_eco',
  DIST_TOUR:         'ebike_dist_tour',
  DIST_SPORT:        'ebike_dist_sport',
  DIST_TURBO:        'ebike_dist_turbo',
  // Per-mode energy consumed (Wh)
  ENERGY_OFF:        'ebike_energy_off',
  ENERGY_ECO:        'ebike_energy_eco',
  ENERGY_TOUR:       'ebike_energy_tour',
  ENERGY_SPORT:      'ebike_energy_sport',
  ENERGY_TURBO:      'ebike_energy_turbo',
};

module.exports = {
  OAUTH2_AUTH_URL,
  OAUTH2_TOKEN_URL,
  OAUTH2_REDIRECT_URI,
  CLIENT_ID,
  SCOPE,
  API_BASE_URL,
  ENDPOINTS,
  POLL_INTERVAL_STATUS_MS,
  POLL_INTERVAL_ACTIVITIES_MS,
  CAP,
};

