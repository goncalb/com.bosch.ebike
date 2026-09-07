'use strict';

/** Filter the driver's devices to the widget's selection (Web-API ids). */
function selectDevices(driver, selJson) {
  let devices = driver.getDevices();
  if (!selJson) return devices;
  let sel;
  try { sel = JSON.parse(selJson); } catch (e) { return devices; }
  if (!Array.isArray(sel) || sel.length === 0) return devices;
  const wanted = devices.filter(d => sel.includes(String(d.__id)));
  return wanted.length ? wanted : devices;
}

module.exports = {
  /** Last known location for the selected (or all) bikes. */
  async getLocations({ homey, query }) {
    const driver = homey.drivers.getDriver('ebike');
    return selectDevices(driver, query && query.sel)
      .map(device => {
        try { return device.getLocationInfo(); } catch (err) { return null; }
      })
      .filter(info => info && info.hasLocation);
  },
};
