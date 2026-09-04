'use strict';

/** Translate the widget's selected Web-API device ids into driver data ids. */
async function resolveSelection(homey, selJson) {
  if (!selJson) return null;
  let sel;
  try { sel = JSON.parse(selJson); } catch (e) { return null; }
  if (!Array.isArray(sel) || sel.length === 0) return null;
  try {
    const map = await homey.app.getWidgetDeviceMap();
    const dataIds = sel.map(id => map[id] && map[id].dataId).filter(Boolean);
    return dataIds.length ? dataIds : null;
  } catch (err) {
    homey.app.log('Widget device map failed:', err.message);
    return null;
  }
}

module.exports = {
  /** Last known location for the selected (or all) bikes. */
  async getLocations({ homey, query }) {
    const selected = await resolveSelection(homey, query && query.sel);
    const driver = homey.drivers.getDriver('ebike');
    let devices = driver.getDevices();
    if (selected) {
      const wanted = devices.filter(d => selected.includes(String((d.getData() || {}).id)));
      if (wanted.length) devices = wanted;
    }
    return devices
      .map(device => {
        try { return device.getLocationInfo(); } catch (err) { return null; }
      })
      .filter(info => info && info.hasLocation);
  },
};
