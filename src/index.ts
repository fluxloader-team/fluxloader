import * as puppeteer from "puppeteer-core";
import { exec, ExecException } from "child_process";
import * as readline from "readline";
import * as util from "util";
import * as crypto from "crypto";
import * as path from "path";
import * as http from "http";
import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  watch,
} from "fs";

interface Patch {
  type: "regex" | "process" | "stringReplace" | "classInterception";
  pattern?: string;
  replace?: string;
  find?: string;
  file?: string;
  expectedMatches?: number;
  func?: (data: string) => string;
}

interface Intercept {
  requiresBaseResponse: boolean;
  getFinalResponse: (params: {
    interceptionId?: string;
    request?: any;
    baseResponse?: any;
    responseHeaders?: any;
    resourceType?: any;
  }) => Promise<{ body: string; contentType: string }>;
}

interface ModInfo {
  name: string;
  version: string;
  dependencies?: Record<string, string>[];
}

interface Mod {
  modinfo: ModInfo;
  api?: Record<string, Intercept>;
  patches?: Patch[];
}

interface Config {
  logging: {
    logToConsole: boolean;
    consoleLogLevel: string;
    logToFile: boolean;
  };
  paths: {
    log: string;
    executable: string;
  };
  debug: {
    watch: boolean;
    exeDebugPort: number;
    openWebDevTools: boolean;
    interactiveConsole: boolean;
  };
}

function findClosingBracketPosition(code: string, className: string) {
  const classPattern = new RegExp(
    `class\\s+${className}\\s*(extends\\s+\\w+\\s*)?(implements\\s+[\\w\\s,]+\\s*)?{`
  );
  const match = classPattern.exec(code);

  if (!match) {
    console.log("Class not found");
    return {
      startIndex: -1,
      endIndex: -1,
    };
  }

  let startIndex = match.index + match[0].length; // Start after "class pr {"
  let stack = 1; // Track opening `{`

  for (let i = startIndex; i < code.length; i++) {
    if (code[i] === "{") stack++; // Opening brace, increase count
    if (code[i] === "}") stack--; // Closing brace, decrease count

    if (stack === 0)
      return {
        startIndex,
        endIndex: i,
      }; // Found the matching closing brace
  }

  console.log("Closing bracket not found");
  return {
    startIndex: -1,
    endIndex: -1,
  };
}

function extractOutClassText(text: string, className: string) {
  const { startIndex, endIndex } = findClosingBracketPosition(text, className);
  if (startIndex === -1 || endIndex === -1) {
    return null;
  }
  return {
    startIndex: startIndex,
    endIndex: endIndex,
    content: text.substring(startIndex, endIndex),
  };
}
declare global {
  var bundlePatches: Patch[];
  var intercepts: Record<string, Intercept>;
  var modloaderContent: string;
  var loadedMods: { path: string; exports: Mod }[];
  var modStates: Record<string, string>;
  var config: Config;
  var gameProcess: ReturnType<typeof exec>;
  var url: string;
  var webSocketDebuggerUrl: string;
  var browser: puppeteer.Browser;
  var pages: puppeteer.Page[];
  var mainPage: puppeteer.Page;
  var cdpClient: puppeteer.CDPSession;
  var fs: {
    existsSync: typeof existsSync;
    mkdirSync: typeof mkdirSync;
    appendFileSync: typeof appendFileSync;
    readFileSync: typeof readFileSync;
    writeFileSync: typeof writeFileSync;
    readdirSync: typeof readdirSync;
    watch: typeof watch;
  };
  function resolvePathRelativeToExecutable(executablePath: string): string;
}
globalThis.modStates = {};

const configSourcePath = "./assets/modloader-config.json";
const configTargetPath = "./modloader-config.json";
const modLoaderPath = "./assets/modloader.js";
const modsPath = "./mods";

const interceptionsPath = "./assets/interceptions";

(globalThis as any).path = path;
(globalThis as any).http = http;
globalThis.fs = {
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  watch,
};

globalThis.bundlePatches = [
  {
    type: "regex",
    pattern: "debug:{active:!1",
    replace: "debug:{active:1",
    expectedMatches: 1,
  },
  {
    type: "stringReplace",
    find: "function ym(t){",
    replace:
      "function ym(t) { if(globalThis.stateInterceptor != null) {t = globalThis.stateInterceptor(t)}",
  },
  {
    type: "stringReplace",
    find: "else t.store.player.velocity.x<=a&&t.store.player.velocity.x>=-a&&(t.store.player.velocity.x=0)",
    replace:
      "else {t.store.player.velocity.x <= a && t.store.player.velocity.x >= -a && (t.store.player.velocity.x = 0)} globalThis.interceptors?.postMove?.(t)",
  },

  {
    type: "classInterception",
    find: "pr",
    replace: "PrInterception",
    file: "pr.js",
  },
];

globalThis.intercepts = {
  "bundle.js": {
    requiresBaseResponse: true,
    getFinalResponse: async ({ baseResponse }) => {
      log(
        `Intercepted bundle.js and applying ${globalThis.bundlePatches.length} patch(es)...`
      );
      let body = Buffer.from(baseResponse.body, "base64").toString("utf8");
      body = applyBundlePatches(body);
      body = Buffer.from(body).toString("base64");
      setTimeout(() => {
        injectModloader();
      }, 200);
      return { body, contentType: "text/javascript" };
    },
  },
  "modloader-api/modloader": {
    requiresBaseResponse: false,
    getFinalResponse: async (_) => {
      let body = globalThis.modloaderContent;
      body = Buffer.from(body).toString("base64");
      return { body, contentType: "text/javascript" };
    },
  },
  "modloader-api/active-mods": {
    requiresBaseResponse: false,
    getFinalResponse: async (_) => {
      const mods = globalThis.loadedMods.map(({ path, exports }) => {
        const name = exports.modinfo.name;
        const id = globalThis.modStates[name];
        return { name, path, id };
      });
      let body = JSON.stringify(mods, null, 2);
      body = Buffer.from(body).toString("base64");
      return { body, contentType: "application/json" };
    },
  },
};

function applyBundlePatches(data: string): string {
  data = `window.electron.openDevTools(); ${data}`;
  for (const patch of globalThis.bundlePatches) {
    if (patch.type === "regex") {
      const regex = new RegExp(patch.pattern!, "g");
      const matches = data.match(regex);
      if (matches && matches.length === patch.expectedMatches) {
        data = data.replace(regex, patch.replace!);
        logDebug(
          `Applied regex patch: "${patch.pattern}" -> "${patch.replace}", ${matches.length} match(s).`
        );
      } else {
        logDebug(
          `Failed to apply regex patch: "${patch.pattern}" -> "${
            patch.replace
          }", ${matches ? matches.length : 0} / ${
            patch.expectedMatches
          } match(s).`
        );
      }
    } else if (patch.type === "process") {
      try {
        data = patch.func!(data);
        logDebug(`Applied process patch.`);
      } catch (error: any) {
        logDebug(`Failed to apply process patch: ${error.message}`);
      }
    } else if (patch.type === "stringReplace") {
      const isFound = data.includes(patch.find ?? "");
      logDebug("isFound", isFound, patch.find);
      data = data.replaceAll(patch.find ?? "", patch.replace ?? "");
      logDebug(
        `Applied stringReplace patch: "${patch.find}" -> "${patch.replace}".`
      );
    } else if (patch.type === "classInterception") {
      const className = patch.find!;
      const newClassName = patch.replace!;
      const classPattern = new RegExp(`class\\s+${className}\\s*{`);
      const match = classPattern.exec(data);

      if (match === null) {
        logDebug(`Class ${className} not found.`);
        continue;
      }

      if (false as any) {
        continue;
      }
      data = data.replaceAll(
        `class ${className}`,
        `class ${className} extends ${newClassName}`
      );

      const interceptionPath = resolvePathToAsset(
        interceptionsPath + "/" + patch.file
      );
      const interceptionContent = readFileSync(interceptionPath, "utf8");
      let beforeString = data.substring(0, match.index);
      let afterString = data.substring(match.index);
      data =
        beforeString +
        `/* Interception \n${interceptionPath}\n */` +
        interceptionContent +
        afterString;

      const classInfo = extractOutClassText(data, className);
      if (classInfo != null) {
        let newContent = classInfo.content.replace(
          "constructor(",
          "constructor(...args){super(...args);this.oldConstructor(...args);}oldConstructor("
        );
        data = data.replaceAll(classInfo.content, newContent);
      }

      logDebug(
        `Applied classInterception patch: for class "${className}" -> "${patch.replace}".`
      );
    }
  }

  const bundlePath = resolvePathToAsset("./temp");
  if (!existsSync(bundlePath)) mkdirSync(bundlePath, { recursive: true });
  writeFileSync(`${bundlePath}/bundle.js`, data, "utf8");
  writeFileSync(`${bundlePath}/bundletemp.js`, data, "utf8");

  return data;
}

function canLogConsole(level: string): boolean {
  if (!Object.hasOwn(globalThis, "config")) return false;
  if (!globalThis.config.logging.logToConsole) return false;
  const levels = ["debug", "info", "error"];
  const levelIndex = levels.indexOf(level);
  const configIndex = levels.indexOf(globalThis.config.logging.consoleLogLevel);
  return levelIndex >= configIndex;
}

function writeLog(message: string): void {
  if (!Object.hasOwn(globalThis, "config")) return;
  if (!globalThis.config.logging.logToFile) return;
  const timestamp = new Date().toISOString();
  appendFileSync(
    globalThis.config.paths.log,
    `[${timestamp}] ${message}\n`,
    "utf8"
  );
}

function logDebug(...args: any[]): void {
  if (!Object.hasOwn(globalThis, "config")) return;
  const message = args.join(" ");
  if (canLogConsole("debug")) console.log("[DEBUG]", message);
  writeLog("[DEBUG] " + message);
}

function logError(...args: any[]): void {
  if (!Object.hasOwn(globalThis, "config")) return;
  const message = args
    .map((item) => {
      if (item instanceof Error) {
        return item.stack || item.message;
      }
      return item;
    })
    .join(" ");
  if (canLogConsole("error")) console.log("[ERROR]", message);
  writeLog("[ERROR] " + message);
}

function log(...args: any[]): void {
  if (!Object.hasOwn(globalThis, "config")) return;
  const message = args.join(" ");
  if (canLogConsole("info")) console.log("[LOG]", message);
  writeLog("[LOG] " + message);
}

function ensureDirectoryExists(dirPath: string): void {
  if (!existsSync(dirPath)) {
    logDebug(`Creating directory: ${dirPath}`);
    mkdirSync(dirPath, { recursive: true });
    logDebug(`Directory created: ${dirPath}`);
  } else {
    logDebug(`Directory already exists: ${dirPath}`);
  }
}

function resolvePathToAsset(assetPath: string): string {
  return path.resolve(__dirname, assetPath);
}

globalThis.resolvePathRelativeToExecutable = function (
  executablePath: string
): string {
  return path.resolve(
    path.dirname(globalThis.config.paths.executable),
    executablePath
  );
};

async function readAndVerifyConfig(
  sourcePath: string,
  targetPath: string
): Promise<void> {
  try {
    sourcePath = resolvePathToAsset(sourcePath);
    let sourceContent = readFileSync(sourcePath, "utf8");
    const sourceData = JSON.parse(sourceContent);

    if (!existsSync(targetPath)) {
      writeFileSync(targetPath, sourceContent, "utf8");
      globalThis.config = sourceData;
      return;
    }

    const targetContent = readFileSync(targetPath, "utf8");
    const targetData = JSON.parse(targetContent);

    let modified = false;
    function traverse(source: any, target: any): void {
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
      writeFileSync(targetPath, targetContentUpdated, "utf8");
      logDebug(`Config ${targetPath} updated successfully.`);
    }
  } catch (error: any) {
    logError(`Could not read / verify config file: ${error.message}`);
    throw error;
  }
}

var isWatching = false;
function watchMoadLoaderFile(modloaderPath: string): void {
  if (config.debug.watch !== true || isWatching) return;
  isWatching = true;
  watch(modloaderPath, (eventType, filename) => {
    if (filename) {
      logDebug(`Modloader file ${filename} changed. Reloading...`);
      loadModLoader(modloaderPath);
    } else {
      logDebug("Filename not provided");
    }
  });
}

async function loadModLoader(modloaderPath: string): Promise<void> {
  try {
    logDebug(`Loading modloader file at ${modloaderPath} from source...`);
    modloaderPath = resolvePathToAsset(modloaderPath);
    globalThis.modloaderContent = readFileSync(modloaderPath, "utf8");
    logDebug(`Modloader file ${modloaderPath} read successfully.`);
  } catch (error: any) {
    logError(`Error reading modLoader file: ${error.message}`);
    throw error;
  }
  watchMoadLoaderFile(modloaderPath);
}

const modsCache: Record<string, string> = {};

var modUniqueId = 0;
function generateModUniqueId(): string {
  return `mod-${modUniqueId++}`;
}

async function loadMod(
  modPath: string,
  reload: boolean = false
): Promise<Mod | null> {
  try {
    logDebug(`Loading mod file: ${modPath}`);
    let modContent = readFileSync(modPath, "utf8");
    const modHash = crypto
      .createHash("sha256")
      .update(modContent)
      .digest("hex");
    if (modsCache[modPath] === modHash) {
      console.log(`Mod file ${modPath} has not changed. Skipping reload.`);
      logDebug(`Mod file ${modPath} has not changed. Skipping reload.`);
      return null;
    }
    if (reload) {
      await unpatchMod(modPath);
    }
    modsCache[modPath] = modHash;
    let modExports: Mod = {} as Mod;
    if (modContent.includes("module.exports = ")) {
      const module: any = { exports: {} };
      const modWrapper = new Function("exports", "module", modContent);
      modWrapper(modExports, module);
      if (module.exports.default) {
        if (module.exports.default instanceof Function) {
          modExports = module.exports.default();
        } else {
          modExports = module.exports.default;
        }
      }
    } else {
      const modWrapper = new Function("exports", modContent);
      modWrapper(modExports);
    }
    modExports.modinfo = modExports.modinfo || {};
    const modName = path.basename(modPath, ".js");
    modExports.modinfo.name = modName;
    return modExports;
  } catch (err) {
    console.error(err);
    logDebug(`Error loading mod '${modPath}': `, err);
    return null;
  }
}

function validateMod(mod: Mod): boolean {
  if (!mod.modinfo || !mod.modinfo.name || !mod.modinfo.version) {
    console.error(
      `Invalid mod info for mod: ${mod.modinfo?.name || "unknown"}`
    );
    return false;
  }

  const dependencies = mod.modinfo?.dependencies || [];
  for (const dependency of dependencies) {
    const [depName, depVersion] = Object.entries(dependency)[0];
    const loadedMod = globalThis.loadedMods.find(
      (m) => m.exports.modinfo.name === depName
    );
    if (!loadedMod) {
      console.error(
        `Missing dependency '${depName}' for mod '${mod.modinfo.name}'.`
      );
      return false;
    }
    if (loadedMod.exports.modinfo.version !== depVersion) {
      console.error(
        `Version mismatch for dependency '${depName}' in mod '${mod.modinfo.name}'. Expected: ${depVersion}, Found: ${loadedMod.exports.modinfo.version}`
      );
      return false;
    }
  }
  return true;
}

function patchMod(modName: string, modPath: string, modExports: Mod) {
  if (modExports && validateMod(modExports)) {
    if (modExports.api) {
      Object.keys(modExports.api).forEach((key) => {
        globalThis.intercepts[key] = modExports.api![key];
        log(`Mod "${modName}" added API endpoint: ${key}`);
      });
    }

    if (modExports.patches) {
      globalThis.bundlePatches = globalThis.bundlePatches.concat(
        modExports.patches
      );
      for (const patch of modExports.patches) {
        log(`Mod "${modName}" added patch: ${patch.type}`);
      }
    }

    globalThis.loadedMods.push({ path: modPath, exports: modExports });
    globalThis.modStates[modName] = generateModUniqueId();
  }
}

async function unpatchMod(modPath: string) {
  const modIndex = globalThis.loadedMods.findIndex(
    (mod) => mod.path === modPath
  );
  if (modIndex === -1) {
    logError(`Mod at path ${modPath} not found.`);
    return;
  }

  const modExports = globalThis.loadedMods[modIndex].exports;

  if (modExports.api) {
    Object.keys(modExports.api).forEach((key) => {
      delete globalThis.intercepts[key];
      log(`Removed API endpoint: ${key}`);
    });
  }

  if (modExports.patches) {
    globalThis.bundlePatches = globalThis.bundlePatches.filter(
      (patch) => !modExports.patches!.includes(patch)
    );
    for (const patch of modExports.patches) {
      log(`Removed patch: ${patch.type}`);
    }
  }

  globalThis.loadedMods.splice(modIndex, 1);
}

async function loadAndPatchMod(modPath: string) {
  const existingMod = globalThis.loadedMods.find((mod) => mod.path == modPath);
  if (existingMod) {
    await unpatchMod(modPath);
  }
  const modName = path.basename(modPath, ".js");
  const modExports = await loadMod(modPath);
  if (modExports != null) {
    patchMod(modName, modPath, modExports);
  }
}

async function loadAndValidateAllMods(modsPath: string): Promise<void> {
  try {
    modsPath = globalThis.resolvePathRelativeToExecutable(modsPath);
    ensureDirectoryExists(modsPath);

    logDebug(`Checking for .js mods in folder: ${modsPath}`);
    const files = readdirSync(modsPath).filter((file) => file.endsWith(".js"));
    const modNames = files.map((file) => path.basename(file, ".js"));

    globalThis.loadedMods = [];
    for (const modName of modNames) {
      const modPath = path.join(modsPath, `${modName}.js`);
      await loadAndPatchMod(modPath);
    }

    log(
      `Validated ${
        globalThis.loadedMods.length
      } mod(s): [ ${globalThis.loadedMods
        .map((m) => m.exports.modinfo.name)
        .join(", ")} ]`
    );
  } catch (error: any) {
    logError(`Error loading and validating mods: ${error.message}`);
    throw error;
  }
}

const debounceFunctions: Record<string, NodeJS.Timeout> = {};

async function debounce(id: string, fn: () => void, delay: number) {
  if (debounceFunctions[id]) {
    clearTimeout(debounceFunctions[id]);
  }
  debounceFunctions[id] = setTimeout(fn, delay);
}

function watchModsDirectory(modsPath: string): void {
  modsPath = globalThis.resolvePathRelativeToExecutable(modsPath);
  if (globalThis.config.debug.watch !== true) return;
  watch(modsPath, (eventType, filename) => {
    if (filename) {
      const modPath = path.join(modsPath, filename);
      debounce(
        `watch-mods-${modPath}`,
        () => {
          logDebug("Mods directory changed. Reloading mods...");
          loadAndPatchMod(path.join(modsPath, filename));
        },
        250
      );
    } else {
      logDebug("Filename not provided");
    }
  });
}

function fetchJSON(url: string, silentError = false): Promise<any> {
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
      if (!silentError)
        logError(`Error fetching JSON from ${url}:`, err.message);
      reject(err);
    });
  });
}

async function fetchJSONWithRetry(
  url: string,
  retries = 200,
  delay = 100
): Promise<any> {
  for (let i = 0; i < retries; i++) {
    logDebug(`Attempting to fetch ${url} (retry ${i + 1}/${retries})`);
    try {
      const res = await fetchJSON(url, true);
      logDebug(`Fetch attempt ${i + 1} successful.`);
      return res;
    } catch (err: any) {
      logDebug(`Fetch attempt ${i + 1} failed:`, err.message);
      if (i === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  logError(`Failed to fetch JSON from ${url} after ${retries} retries.`);
  throw new Error(`Failed to fetch JSON from ${url} after ${retries} retries.`);
}

async function initializeModloader(): Promise<void> {
  await readAndVerifyConfig(configSourcePath, configTargetPath);

  if (globalThis.config.logging.logToFile) {
    writeFileSync(globalThis.config.paths.log, "", "utf8");
  }

  if (!existsSync(globalThis.config.paths.executable)) {
    logError(
      `Game executable not found: ${globalThis.config.paths.executable}`
    );
    process.exit(1);
  }

  log("Loading Mods...");
  await loadModLoader(modLoaderPath);
  await loadAndValidateAllMods(modsPath);
  watchModsDirectory(modsPath);

  log(`Starting sandustry: ${globalThis.config.paths.executable}`);
  logDebug(
    `Starting sandustry: ${globalThis.config.paths.executable} with debug port ${globalThis.config.debug.exeDebugPort}`
  );
  const cmd = `"${globalThis.config.paths.executable}" --remote-debugging-port=${globalThis.config.debug.exeDebugPort} --enable-logging --enable-features=NetworkService`;
  globalThis.gameProcess = exec(cmd, (err: ExecException | null) => {
    if (err) {
      logError(`Failed to start the game executable: ${err.message}`);
      return;
    }
  });
}

async function connectToGame(): Promise<void> {
  globalThis.url = `http://127.0.0.1:${globalThis.config.debug.exeDebugPort}/json/version`;

  logDebug(`Fetching WebSocket debugger URL from ${globalThis.url}`);
  const res = await fetchJSONWithRetry(globalThis.url);
  globalThis.webSocketDebuggerUrl = res.webSocketDebuggerUrl;

  logDebug("Connecting Puppeteer with disabled viewport constraints...");
  globalThis.browser = await puppeteer.connect({
    browserWSEndpoint: globalThis.webSocketDebuggerUrl,
    defaultViewport: null,
  });

  globalThis.browser.on("disconnected", () => {
    process.exit(0);
  });

  globalThis.browser.on("*", (event) => {
    try {
      logDebug("Browser event:" + JSON.stringify(event));
    } catch (e) {
      logError(e);
    }
  });

  globalThis.pages = await globalThis.browser.pages();
  logDebug(`Pages found: ${globalThis.pages.length}`);
  if (globalThis.pages.length === 0) throw new Error("No open pages found.");
  globalThis.mainPage = globalThis.pages[0];

  globalThis.mainPage.on("close", () => {
    logDebug("Page closed");
  });

  globalThis.mainPage.on("framenavigated", async (frame) => {
    logDebug(`Frame navigated to: ${frame.url()}`);
  });

  globalThis.mainPage.on("load", async () => {
    logDebug("Page loaded");
    if (globalThis.config.debug.openWebDevTools) {
      globalThis.cdpClient.send("Runtime.evaluate", {
        expression: "electron.openDevTools();",
      });
    }
  });

  await initializeInterceptions();
  await globalThis.mainPage.reload();
}
async function initializeInterceptions() {
  try {
    globalThis.cdpClient = await globalThis.mainPage
      .target()
      .createCDPSession();

    const interceptPatterns = Object.keys(globalThis.intercepts);

    const matchPatterns = interceptPatterns.map((pattern) => ({
      urlPattern: "*" + pattern + "*",
      requestStage: globalThis.intercepts[pattern].requiresBaseResponse
        ? "Response"
        : "Request",
    }));

    await globalThis.cdpClient.send("Fetch.enable", {
      patterns: matchPatterns as any,
    });

    function getMatchingIntercept(url: string) {
      try {
        const matchingPattern = interceptPatterns.find((pattern) =>
          url.includes(pattern)
        );
        return globalThis.intercepts[matchingPattern!];
      } catch (e) {
        logError(e);
        return false;
      }
    }

    globalThis.cdpClient.on(
      "Fetch.requestPaused",
      async ({
        requestId,
        request,
        responseHeaders,
      }: {
        requestId: string;
        request: any;
        responseHeaders: any;
      }) => {
        const interceptionId = requestId;
        logDebug(
          `Intercepted ${request.url} {interception id: ${interceptionId}}`
        );

        const matchingIntercept = getMatchingIntercept(
          request.url.toLowerCase()
        );

        if (!matchingIntercept) {
          logError(
            `No matching intercept found for ${request.url}, check your patterns don't include "*" or "?".`
          );
          process.exit(1);
        }

        let baseResponse = null;
        if (matchingIntercept.requiresBaseResponse) {
          baseResponse = await globalThis.cdpClient.send(
            "Fetch.getResponseBody",
            {
              requestId: interceptionId,
            }
          );
        }

        const response = await matchingIntercept.getFinalResponse({
          interceptionId,
          request,
          baseResponse,
          responseHeaders,
          resourceType: request.resourceType,
        });

        let body = response.body;
        if (Buffer.from(body, "base64").toString("base64") !== body) {
          body = Buffer.from(body).toString("base64");
        }

        response.body = body;

        try {
          if (!responseHeaders) {
            responseHeaders = [
              {
                name: "Content-Length",
                value: response.body.length.toString(),
              },
              { name: "Content-Type", value: response.contentType },
            ];
          } else {
            responseHeaders = responseHeaders.map(
              ({ name, value }: { name: string; value: string }) => {
                if (name.toLowerCase() === "content-length")
                  value = response.body.length.toString();
                else if (name.toLowerCase() === "content-type")
                  value = response.contentType;
                return { name, value };
              }
            );
          }
        } catch (e) {
          logDebug(JSON.stringify(responseHeaders));
          logError(e);
        }

        logDebug(
          `Fulfilling ${request.url} {interception id: ${interceptionId}}, ${response.body.length} bytes, ${response.contentType}`
        );

        await globalThis.cdpClient.send("Fetch.fulfillRequest", {
          requestId: interceptionId,
          responseCode: 200,
          responseHeaders,
          body: body,
        });
      }
    );
  } catch (e) {
    console.log("ERROR");
    logError(e);
  }
}

async function injectModloader() {
  logDebug("Starting Modloader Injection...");
  try {
    const url = "modloader-api/modloader";
    await globalThis.mainPage.addScriptTag({ url });
    log(`Modloader script injected successfully at ${url}`);
  } catch (e) {
    logError(e);
    logError(
      "Modloader injection failed. send error log to modding channel. Exiting..."
    );
    setTimeout(() => {
      process.exit(0);
    }, 5000);
  }
}

function evaluateCommand(command: string) {
  try {
    const result = eval(command);
    console.log("[RESULT]:", util.inspect(result, { depth: 3, colors: true }));
  } catch (error: any) {
    console.log("[ERROR]:", error.message);
  }
}

function startDebugConsole() {
  if (!globalThis.config.debug.interactiveConsole) return;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "DEBUG> ",
  });

  log("Interactive Debugger started. Type commands to interact with the app.");
  rl.prompt();

  rl.on("line", (line: string) => {
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
  if (Object.hasOwn(globalThis, "browser")) globalThis.browser.close();
  if (Object.hasOwn(globalThis, "gameProcess")) globalThis.gameProcess.kill();
  process.exit(1);
}

(async () => {
  process.on("uncaughtException", (e) => {
    logError("Uncaught Exception:", e);
    unexpectedClose();
  });
  process.on("unhandledRejection", (e: any) => {
    logError("Unhandled Rejection:", e);
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
