const puppeteer = require("puppeteer-core");
const { exec } = require("child_process");
const readline = require("readline");
const util = require("util");

globalThis.path = require("path");
globalThis.http = require("http");
globalThis.fs = require("fs");

const configSourcePath = "./assets/modloader-config.json";
const configTargetPath = "./modloader-config.json";
const modLoaderPath = "./assets/modloader.js";
const modsPath = "./mods";
const modConfigPath = "./mods/config"

globalThis.bundlePatches = [
  {
    "type": "regex",
    "pattern": "debug:{active:!1",
    "replace": "debug:{active:1",
    "expectedMatches": 1
  }
];

globalThis.intercepts = {
  "bundle.js": {
    requiresBaseResponse: true,
    getFinalResponse: async ({ baseResponse }) => {
      log(`Intercepted bundle.js and applying ${globalThis.bundlePatches.length} patch(es)...`);
      let body = Buffer.from(baseResponse.body, "base64").toString("utf8");
      body = applyBundlePatches(body);
      body = Buffer.from(body).toString("base64");
      setTimeout(() => { injectModloader(); }, 200);
      return { body, contentType: "text/javascript" };
    }
  },
  "modloader-api/modloader": {
    requiresBaseResponse: false,
    getFinalResponse: async (_) => {
      let body = globalThis.modloaderContent;
      body = Buffer.from(body).toString("base64");
      return { body, contentType: "text/javascript" };
    }
  },
  "modloader-api/active-mod-paths": {
    requiresBaseResponse: false,
    getFinalResponse: async (_) => {
      const modPaths = globalThis.loadedMods.map(({ path }) => path);
      let body = JSON.stringify(modPaths, null, 2);
      body = Buffer.from(body).toString("base64");
      return { body, contentType: "application/json" };
    }
  },
  "modloader-api/config": {
    requiresBaseResponse: false,
    getFinalResponse: async ({interceptionId, request, baseResponse, responseHeaders, resourceType}) => {
      var body = "";
      var jobject = JSON.parse(request.postData);
      jobject.modName = jobject.modName.replace(/(?:\\+|\/+)|(^|\/)\.+(\/|$)|[?"<>|:*]|(^\/+|\/+$)/g, (match, p1, p2, p3) => {
        if (p1 || p3) return ''; // Remove leading or trailing slashes or dot sequences
        if (p2) return '/';      // Remove directory traversal segments (e.g., `.` or `..`)
        return '/';              // Normalize slashes
      });

      if(request.method == "POST") {

        if(fs.existsSync(`${modConfigPath}/${jobject.modName}.json`)) {
          body = fs.readFileSync(`${modConfigPath}/${jobject.modName}.json`, "utf8");
        }else{
          body = "{}"
        }
      }
      if(request.method == "SET") {
        fs.writeFileSync(`${modConfigPath}/${jobject.modName}.json`, JSON.stringify(jobject.config), "utf8");
      }
      body = Buffer.from(body).toString("base64");
      return { body, contentType: "application/json" };
    }
  }
}

function applyBundlePatches(data) {
  for (const patch of globalThis.bundlePatches) {
    // Replace instances of "pattern" with "replace" in data and expect "expectedMatches" matches
    if (patch.type === "regex") {
      const regex = new RegExp(patch.pattern, "g");
      const matches = data.match(regex);
      if (matches && matches.length === patch.expectedMatches) {
        data = data.replace(regex, patch.replace);
        logDebug(`Applied regex patch: "${patch.pattern}" -> "${patch.replace}", ${matches.length} match(s).`);
      }
      else {
        logDebug(`Failed to apply regex patch: "${patch.pattern}" -> "${patch.replace}", ${matches ? matches.length : 0} / ${patch.expectedMatches} match(s).`);
      }
    }
    
    // Process data with "func" from the patch
    else if (patch.type === "process") {
      try {
        data = patch.func(data);
        logDebug(`Applied process patch.`);
      } catch (error) {
        logDebug(`Failed to apply process patch: ${error.message}`);
      }
    }
  }

  return data;
}

function canLogConsole(level) {
  if (!Object.hasOwn(globalThis, "config")) return false;
  if (!config.logging.logToConsole) return false;
  const levels = ["debug", "info", "error"];
  const levelIndex = levels.indexOf(level);
  const configIndex = levels.indexOf(config.logging.consoleLogLevel);
  return levelIndex >= configIndex;
}

function writeLog(message) {
  if (!Object.hasOwn(globalThis, "config")) return;
  if (!config.logging.logToFile) return;
  const timestamp = new Date().toISOString();
  fs.appendFileSync(config.paths.log, `[${timestamp}] ${message}\n`, "utf8");
};

function logDebug(...args) {
  if (!Object.hasOwn(globalThis, "config")) return;
  const message = args.join(" ");
  if (canLogConsole("debug")) console.log("[DEBUG]", message);
  writeLog("[DEBUG] " + message);
}

function logError(...args) {
  if (!Object.hasOwn(globalThis, "config")) return;
  const message = args.join(" ");
  if (canLogConsole("error")) console.log("[ERROR]", message);
  writeLog("[ERROR] " + message);
}

function log(...args) {
  if (!Object.hasOwn(globalThis, "config")) return;
  const message = args.join(" ");
  if (canLogConsole("info")) console.log("[LOG]", message);
  writeLog("[LOG] " + message);
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    logDebug(`Creating directory: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
    logDebug(`Directory created: ${dirPath}`);
  } else {
    logDebug(`Directory already exists: ${dirPath}`);
  }
}

function resolvePathToAsset(assetPath) {
  // When ran with exe this is C:/Snapshot/mod-loader/...
  // When ran with node this is relative to ./index.js
  return path.resolve(__dirname, assetPath);
}

globalThis.resolvePathRelativeToExecutable = function (executablePath) {
  // Resolve path relative to sandustrydemo.exe based on config
  return path.resolve(path.dirname(config.paths.executable), executablePath);
}

// It is very important to not do anything that needs globalThis.config before this function!!!
async function readAndVerifyConfig(sourcePath, targetPath) {
  try {
    ensureDirectoryExists(modConfigPath);
    sourcePath = resolvePathToAsset(sourcePath);
    let sourceContent = fs.readFileSync(sourcePath, "utf8");
    const sourceData = JSON.parse(sourceContent);

    if (!fs.existsSync(targetPath)) {
        fs.writeFileSync(targetPath, sourceContent, "utf8");
        globalThis.config = sourceData;
        return;
    }

    const targetContent = fs.readFileSync(targetPath, "utf8");
    const targetData = JSON.parse(targetContent);
    
    let modified = false;
    function traverse(source, target) {
      // If target doesn't have a property source has, then add it
      for (const key in source) {
        if (typeof source[key] === "object" && source[key] !== null) {
          if (!Object.hasOwn(target, key)) {
            target[key] = {};
            modified = true;
          }
          traverse(source[key], target[key]);
        } else {
          if (!Object.hasOwn(target, key)) {
            target[key] = source[key];
            modified = true;
          }
        }
      }

      // If target has a property source doesn't have, then remove it
      for (const key in target) {
        if (!Object.hasOwn(source, key)) {
          delete target[key];
          modified = true;
        }
      }
    }

    traverse(sourceData, targetData);
    globalThis.config = targetData;

    if (!modified) {
      logDebug(`Config file is up-to-date.`);
    } else {
      const targetContentUpdated = JSON.stringify(targetData, null, 2);
      fs.writeFileSync(targetPath, targetContentUpdated, "utf8");
      logDebug(`Config ${targetPath} updated successfully.`);
    }
  } catch (error) {
    logError(`Could not read / verify config file: ${error.message}`);
    throw error;
  }
}

async function loadModLoader(modloaderPath) {
  try {
    logDebug(`Loading modloader file at ${modloaderPath} from source...`);
    modloaderPath = resolvePathToAsset(modloaderPath);
    globalThis.modloaderContent = fs.readFileSync(modloaderPath, "utf8");
    logDebug(`Modloader file ${modloaderPath} read successfully.`);
  } catch (error) {
    logError(`Error reading modLoader file: ${error.message}`);
    throw error;
  }
}

async function loadMod(modPath) {
  try {
    logDebug(`Loading mod file: ${modPath}`);
    const modContent = fs.readFileSync(modPath, "utf8");
    const modExports = {};
    const modWrapper = new Function("exports", modContent);
    modWrapper(modExports);
    return modExports;
  } catch (err) {
    logDebug(`Error loading mod '${modPath}': `, err);
    return null;
  }
}

function validateMod(mod) {
  // Ensure mod has required modinfo
  if (!mod.modinfo || !mod.modinfo.name || !mod.modinfo.version) {
      console.error(`Invalid mod info for mod: ${mod.modinfo?.name || "unknown"}`);
      return false;
  }

  // Check that dependencies are met
  const dependencies = mod.modinfo?.dependencies || [];
  for (const dependency of dependencies) {
      const [depName, depVersion] = Object.entries(dependency)[0];
      const loadedMod = globalThis.loadedMods.find((m) => m.modinfo.name === depName);
      if (!loadedMod) {
          console.error(`Missing dependency '${depName}' for mod '${mod.modinfo.name}'.`);
          return false;
      }
      if (loadedMod.modinfo.version !== depVersion) {
          console.error(
              `Version mismatch for dependency '${depName}' in mod '${mod.modinfo.name}'. Expected: ${depVersion}, Found: ${loadedMod.modinfo.version}`
          );
          return false;
      }
  }
  return true;
}

async function loadAndValidateAllMods(modsPath) {
  try {
    modsPath = resolvePathRelativeToExecutable(modsPath);
    ensureDirectoryExists(modsPath);
  
    logDebug(`Checking for .js mods in folder: ${modsPath}`);
    const files = fs.readdirSync(modsPath).filter((file) => file.endsWith(".js"));
    const modNames = files.map((file) => path.basename(file, ".js"));
    
    globalThis.loadedMods = [];
    for (const modName of modNames) {
      const modPath = path.join(modsPath, `${modName}.js`);
      const modExports = await loadMod(modPath);
      if (modExports && validateMod(modExports)) {
        
        if (modExports.api) {
          Object.keys(modExports.api).forEach(key => {
            globalThis.intercepts[key] = modExports.api[key];
            log(`Mod "${modName}" added API endpoint: ${key}`);
          })
        }

        if(modExports.patches) {
          globalThis.bundlePatches = globalThis.bundlePatches.concat(modExports.patches);
          for (const patch of modExports.patches) {
            log(`Mod "${modName}" added patch: ${patch.type}`);
          }
        }

        globalThis.loadedMods.push({ path: modPath, exports: modExports });
      }
    }
  
    log(`Validated ${globalThis.loadedMods.length} mod(s): [ ${globalThis.loadedMods.map((m) => m.exports.modinfo.name).join(", ")} ]`);

  } catch (error) {
    logError(`Error loading and validating mods: ${error.message}`);
    throw error;
  }
}

function fetchJSON(url, silentError=false) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        logDebug(`Fetched JSON from ${url}:`, data);
        resolve(JSON.parse(data));
      });
    });
    req.on("error", (err) => {
      if (!silentError) logError(`Error fetching JSON from ${url}:`, err.message);
      reject(err);
    });
  });
}

async function fetchJSONWithRetry(url, retries = 200, delay = 100) {
  for (let i = 0; i < retries; i++) {
    logDebug(`Attempting to fetch ${url} (retry ${i + 1}/${retries})`);
    try {
      const res = await fetchJSON(url, silentError=true);
      logDebug(`Fetch attempt ${i + 1} successful.`);
      return res;
    } catch (err) {
      logDebug(`Fetch attempt ${i + 1} failed:`, err.message);
      if (i === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  logError(`Failed to fetch JSON from ${url} after ${retries} retries.`);
  throw new Error(`Failed to fetch JSON from ${url} after ${retries} retries.`);
}

async function initializeModloader() {
  await readAndVerifyConfig(configSourcePath, configTargetPath);

  if (config.logging.logToFile) {
    fs.writeFileSync(config.paths.log, "", "utf8");
  }
  
  if (!fs.existsSync(config.paths.executable)) {
    logError(`Game executable not found: ${config.paths.executable}`);
    process.exit(1);
  }

  log("Loading Mods...");
  await loadModLoader(modLoaderPath);
  await loadAndValidateAllMods(modsPath);

  log(`Starting sandustry: ${config.paths.executable}`)
  logDebug(`Starting sandustry: ${config.paths.executable} with debug port ${config.debug.exeDebugPort}`);
  const cmd = `"${config.paths.executable}" --remote-debugging-port=${config.debug.exeDebugPort} --enable-logging --enable-features=NetworkService`;
  globalThis.gameProcess = exec(cmd, (err) => {
    if (err) {
      logError(`Failed to start the game executable: ${err.message}`);
      return;
    }
  });
}

async function connectToGame() {
  globalThis.url = `http://127.0.0.1:${config.debug.exeDebugPort}/json/version`;

  logDebug(`Fetching WebSocket debugger URL from ${globalThis.url}`);
  const res = await fetchJSONWithRetry(globalThis.url);
  globalThis.webSocketDebuggerUrl = res.webSocketDebuggerUrl;

  logDebug("Connecting Puppeteer with disabled viewport constraints...");
  globalThis.browser = await puppeteer.connect({
    browserWSEndpoint: webSocketDebuggerUrl,
    defaultViewport: null,
  });

  globalThis.browser.on("disconnected", () => {
    process.exit(0);
  });

  globalThis.browser.on("*", (event) => {
    try{
      logDebug("Browser event:" + JSON.stringify(event));
    } catch(e) {
      logError(e);
    }
  })

  globalThis.pages = await browser.pages();
  logDebug(`Pages found: ${pages.length}`);
  if (pages.length === 0) throw new Error("No open pages found.");
  globalThis.mainPage = pages[0];

  mainPage.on("close", () =>{
    logDebug("Page closed");
  });

  mainPage.on("framenavigated", async (frame) => {
    logDebug(`Frame navigated to: ${frame.url()}`);
  });
  
  mainPage.on("load", async () => {
    logDebug("Page loaded");
    if (globalThis.config.debug.openWebDevTools) {
      globalThis.cdpClient.send("Runtime.evaluate", { expression: "electron.openDevTools();" });
    }
  });

  await initializeInterceptions();
  await mainPage.reload();
}

async function initializeInterceptions() {
  try{
    globalThis.cdpClient = await mainPage.target().createCDPSession();

    const interceptPatterns = Object.keys(globalThis.intercepts);

    var matchPatterns = []
    interceptPatterns.forEach(pattern => {
      if (globalThis.intercepts[pattern].requiresBaseResponse) {
        matchPatterns.push({urlPattern: "*" + pattern + "*", requestStage: "Response"})
      } else {
        matchPatterns.push({urlPattern: "*" + pattern + "*", requestStage: "Request"})
      }
    });

    await cdpClient.send("Fetch.enable", {
      patterns: matchPatterns
    });

    function getMatchingIntercept(url) {
      try {
        // We are explicitly only looking for simple includes() matches however the cdpClient patterns will perform a pseudo-regex match
        // Need to be careful with this with mods, the !matchingIntercept check below will throw an error if no match is found
        const matchingPattern = interceptPatterns.find(pattern => url.includes(pattern));
        return globalThis.intercepts[matchingPattern];
      } catch(e) {
        logError(e);
        return false;
      }
    }

    await cdpClient.on("Fetch.requestPaused", async ({ requestId, request, frameId, resourceType, responseErrorReason, responseStatusCode, responseStatusText, responseHeaders, networkId, redirectedRequestId }) => {
      var interceptionId = requestId;
      logDebug(`Intercepted ${request.url} {interception id: ${interceptionId}}`);

      var matchingIntercept = getMatchingIntercept(request.url.toLowerCase());

      if (!matchingIntercept) {
        logError(`No matching intercept found for ${request.url}, check your patterns dont include "*" or "?".`);
        process.exit(1);
      }

      let baseResponse = null;
      if (matchingIntercept.requiresBaseResponse) {
        baseResponse = await cdpClient.send("Fetch.getResponseBody", { requestId: interceptionId });
      }

      const response = await matchingIntercept.getFinalResponse({ interceptionId, request, baseResponse, responseHeaders, resourceType });
  
      try {
        if (!responseHeaders) {
          responseHeaders = [
            { name: "Content-Length", value: response.body.length.toString() },
            { name: "Content-Type", value: response.contentType }
          ];
        } else {
          responseHeaders = responseHeaders.map(({name, value}) => {
            if (name.toLowerCase() === "content-length") value = response.body.length.toString();
            else if (name.toLowerCase() === "content-type") value = response.contentType;
            return {name, value};
          });
        }
      } catch (e) {
        logDebug(JSON.stringify(responseHeaders))
        logError(e);
      }

      logDebug(`Fulfilling ${request.url} {interception id: ${interceptionId}}, ${response.body.length} bytes, ${response.contentType}`);

      await cdpClient.send("Fetch.fulfillRequest", {requestId: interceptionId, responseCode: 200, responseHeaders, body: response.body });
    });
  } catch(e) {
    logError(e);
  }
}

async function injectModloader() {
  logDebug("Starting Modloader Injection...");
  try {
    const url = "modloader-api/modloader";
    await globalThis.mainPage.addScriptTag({ url });
    log(`Modloader script injected successfully at ${url}`);
  } catch(e) {
    logError(e);
    logError("Modloader injection failed. send error log to modding channel. Exiting...");
    setTimeout(() => {
      process.exit(0);
    }, 5000);
  }
}

function evaluateCommand(command) {
  try {
    const result = eval(command);
    console.log("[RESULT]:", util.inspect(result, { depth: 3, colors: true }));
  } catch (error) {
    console.log("[ERROR]:", error.message);
  }
}

function startDebugConsole() {
  if (!config.debug.interactiveConsole) return;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "DEBUG> ",
  });

  log("Interactive Debugger started. Type commands to interact with the app.");
  rl.prompt();

  rl.on("line", (line) => {
    const command = line.trim();
    if (command === "exit") {
      log("Exiting debugger...");
      rl.close();
    } else {
      evaluateCommand(command);
    }
    rl.prompt();
  });

  rl.on("close", () => {
    log("Debugger closed.");
  });
}

function unexpectedClose() {
  logError("Unexpected close. Exiting...");
  if (Object.hasOwn(globalThis, "browser")) browser.close();
  if (Object.hasOwn(globalThis, "gameProcess")) gameProcess.kill();
  process.exit(1);
}

(async () => {
  process.on("uncaughtException", (e) => {
    logError("Uncaught Exception:", e.message);
    unexpectedClose();
  });
  process.on("unhandledRejection", (e) => {
    logError("Unhandled Rejection:", e.message);
    unexpectedClose();
  });
  process.on("SIGINT", () => {
    logError("SIGINT received.");
    unexpectedClose();
  });
  process.on("SIGTERM", () => {
    logError("SIGTERM received.");
    unexpectedClose();
  });
  process.on("SIGHUP", () => {
    logError("SIGHUP received.");
    unexpectedClose();
  });

  await initializeModloader();
  await connectToGame();
  startDebugConsole();
})();
