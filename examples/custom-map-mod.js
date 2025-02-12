exports.modinfo = {
  name: "custom-map-mod",
  version: "1.0.0",
  dependencies: [],
  modauthor: "tomster12",
};

function redirect(path) {
  console.log(`Redirecting map image file request: ${path}`);
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
