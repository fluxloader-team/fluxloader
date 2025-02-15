exports.modinfo = {
  name: "custom-map-mod",
  version: "1.0.0",
  dependencies: [],
  modauthor: "tomster12",
};

function checkMapsValid() {
  if (globalThis.customMapsValid) return true;
  let valid = true;
  valid &= globalThis.fs.existsSync(globalThis.resolvePathRelativeToExecutable("mods/custom-map/map_blueprint_playtest.png"));
  valid &= globalThis.fs.existsSync(globalThis.resolvePathRelativeToExecutable("mods/custom-map/map_blueprint_playtest_authorization.png"));
  valid &= globalThis.fs.existsSync(globalThis.resolvePathRelativeToExecutable("mods/custom-map/map_blueprint_playtest_lights.png"));
  valid &= globalThis.fs.existsSync(globalThis.resolvePathRelativeToExecutable("mods/custom-map/map_blueprint_playtest_sensors.png"));
  valid &= globalThis.fs.existsSync(globalThis.resolvePathRelativeToExecutable("mods/custom-map/fog_playtest.png"));
  if (!valid) throw new Error("Custom map files are missing from mods/custom-map/. Please make sure to place the custom map files in the correct location.");
  globalThis.customMapsValid = valid;
}

function redirect(url) {
  checkMapsValid();
  let fileName = url.split("/").pop();
  fileName = fileName.split(".")[0];
  const newPath = globalThis.resolvePathRelativeToExecutable(`mods/custom-map/${fileName}.png`);
  return { body: globalThis.fs.readFileSync(newPath).toString("base64"), contentType: "image/png" };
}

const fileHandler = {
  requiresBaseResponse: false,
  getFinalResponse: async ({ request }) => redirect(request.url)
};

exports.api = {
  "map_blueprint_playtest": fileHandler,
  "fog_playtest": fileHandler
};
