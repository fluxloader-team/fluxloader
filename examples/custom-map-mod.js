exports.modinfo = {
  name: "custom-map-mod",
  version: "1.0.0",
  dependencies: [],
  modauthor: "tomster12",
};

function checkMapsValid() {
  if (globalThis.customMapsValid) return true;
  let valid = true;
  valid &= globalThis.fs.existsSync(mapPath = globalThis.resolvePathRelativeToExecutable("mods/custom-map/map_blueprint_playtest.png"));
  valid &= globalThis.fs.existsSync(mapPath = globalThis.resolvePathRelativeToExecutable("mods/custom-map/map_blueprint_playtest_authorization.png"));
  valid &= globalThis.fs.existsSync(mapPath = globalThis.resolvePathRelativeToExecutable("mods/custom-map/map_blueprint_playtest_lights.png"));
  valid &= globalThis.fs.existsSync(mapPath = globalThis.resolvePathRelativeToExecutable("mods/custom-map/map_blueprint_playtest_sensors.png"));
  valid &= globalThis.fs.existsSync(mapPath = globalThis.resolvePathRelativeToExecutable("mods/custom-map/fog_playtest.png"));
  if (!valid) throw new Error("Custom map files are missing from mods/custom-map/. Please make sure to place the custom map files in the correct location.");
  globalThis.customMapsValid = valid;
}

function redirect(path) {
  checkMapsValid();
  const newPath = globalThis.resolvePathRelativeToExecutable(`mods/custom-map/${path}.png`);
  return { body: globalThis.fs.readFileSync(newPath).toString("base64"), contentType: "image/png" };
}

exports.api = {
  "map_blueprint_playtest.png": {
    requiresBaseResponse: false,
    getFinalResponse: async (_) => redirect("map_blueprint_playtest")
  },
  "map_blueprint_playtest_authorization.png": {
    requiresBaseResponse: false,
    getFinalResponse: async (_) => redirect("map_blueprint_playtest_authorization")
  },
  "map_blueprint_playtest_lights.png": {
    requiresBaseResponse: false,
    getFinalResponse: async (_) => redirect("map_blueprint_playtest_lights")
  },
  "map_blueprint_playtest_sensors.png": {
    requiresBaseResponse: false,
    getFinalResponse: async (_) => redirect("map_blueprint_playtest_sensors")
  },
  "fog_playtest.png": {
    requiresBaseResponse: false,
    getFinalResponse: async (_) => redirect("fog_playtest")
  }
}
