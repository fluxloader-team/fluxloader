const puppeteer = require("puppeteer-core");
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");
const http = require("http");
const readline = require("readline");
const util = require("util");

const configSourcePath = "./assets/modloader-config.json";
const configTargetPath = "./modloader-config.json";
const modLoaderSourcePath = "./assets/modloader.js";
const modLoaderTargetPath = "./modloader.js";

globalThis.bundlejs = "";
globalThis.debug = {
  activeRequest:{}
}

function writeLog(message) {
  if (!Object.hasOwn(globalThis, "config")) return;
  const timestamp = new Date().toISOString();
  fs.appendFileSync(config.paths.log, `[${timestamp}] ${message}\n`, "utf8");
};

function logDebug(...args) {
  const message = args.join(" ");
  if (config.enableDebug) console.log("[DEBUG]", message);
  writeLog("[DEBUG] " + message);
}

function logError(...args) {
  const message = args.join(" ");
  console.log("[ERROR]", message);
  writeLog("[ERROR] " + message);
}

function log(...args) {
  const message = args.join(" ");
  console.log("[LOG]", message);
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

async function readAndVerifyConfig(sourcePath, targetPath) {
  try {
    sourcePath = path.resolve(__dirname, sourcePath);
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
      return;
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

async function createLocalModLoader(sourcePath, targetPath) {
  try {
    logDebug(`Creating modloader file at ${targetPath} from source...`);
    sourcePath = path.resolve(__dirname, sourcePath);
    let content = fs.readFileSync(sourcePath, "utf8");
    fs.writeFileSync(targetPath, content, "utf8");
    logDebug(`Modloader file ${targetPath} created successfully.`);
  } catch (error) {
    logError(`Error creating modLoader file: ${error.message}`);
    throw error;
  }
}

async function generateModsJson(modsFolder) {
  try {
    const modsJsonPath = path.join(modsFolder, "mods.json");

    logDebug(`Checking for .js files in mods folder: ${modsFolder}`);
    const files = fs.readdirSync(modsFolder).filter((file) => file.endsWith(".js"));
    
    const modNames = files.map((file) => path.basename(file, ".js"));
    logDebug(`Mod names extracted: ${modNames}`);
    if (modNames.length === 0) {
      logDebug(`No mods found in ${modsFolder}`);
    } else {
      log("Found mods: ", modNames.join(", "))
    }
    const jsonContent = JSON.stringify(modNames, null, 2);
    fs.writeFileSync(modsJsonPath, jsonContent, "utf8");

    logDebug(`mods.json created at ${modsJsonPath} with content: ${jsonContent}`);
  } catch (error) {
    logError(`Error generating mods.json: ${error.message}`);
    throw error;
  }
}

function fetchJSON(url) {
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
      logError(`Error fetching JSON from ${url}:`, err.message);
      reject(err);
    });
  });
}

async function fetchWithRetry(url, retries = 200, delay = 100) {
  for (let i = 0; i < retries; i++) {
    logDebug(`Attempting to fetch ${url} (retry ${i + 1}/${retries})`);
    try {
      const { webSocketDebuggerUrl } = await fetchJSON(url);
      logDebug(`Debugger WebSocket URL: ${webSocketDebuggerUrl}`);
      return webSocketDebuggerUrl;
    } catch (err) {
      logDebug(`Fetch attempt ${i + 1} failed:`, err.message);
      if (i === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function init() {
  await readAndVerifyConfig(configSourcePath, configTargetPath);

  fs.writeFileSync(config.paths.log, "", "utf8");
  
  if (!fs.existsSync(config.paths.executable)) {
    logError(`Game executable not found: ${config.paths.executable}`);
    process.exit(1);
  }

  log("Generating Mods");
  await createLocalModLoader(modLoaderSourcePath, modLoaderTargetPath);

  ensureDirectoryExists(config.paths.mods);

  await generateModsJson(config.paths.mods);

  logDebug(`Starting game executable: ${config.paths.executable} with debug port ${config.debugPort}`);
  log("Starting Sandustry")
  const cmd = `"${config.paths.executable}" --remote-debugging-port=${config.debugPort} --enable-logging --enable-features=NetworkService`;
  globalThis.gameProcess = exec(cmd, (err) => {
    if (err) {
      logError(`Failed to start the game executable: ${err.message}`);
      return;
    }
  });
}

async function tryConnect() {
  globalThis.url = `http://127.0.0.1:${config.debugPort}/json/version`;

  logDebug(`Fetching WebSocket debugger URL from ${globalThis.url}`);
  globalThis.webSocketDebuggerUrl = await fetchWithRetry(globalThis.url);

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

  mainPage.on('framenavigated', async (frame) => {
    logDebug(`Frame navigated to: ${frame.url()}`);
  });
  
  mainPage.on("load", async () => {
    logDebug("Page loaded");
    if (globalThis.config.openDevTools) {
      globalThis.cdpClient.send("Runtime.evaluate", { expression: "electron.openDevTools();" });
    }
  });

  globalThis.cdpClient = await mainPage.target().createCDPSession();
  cdpClient.send('Network.enable');

  await interceptRequests(["*js/bundle.js"]);

  setTimeout( async () => {
    await mainPage.reload();
  }, 500);
}

async function interceptRequests(patterns) {
  logDebug(`Intercepting requests for patterns: ${patterns.join(", ")}`);

  await cdpClient.send('Network.setRequestInterception', {
    patterns: patterns.map(pattern => ({
      urlPattern: pattern, resourceType: 'Script', interceptionStage: 'HeadersReceived'
    }))
  });

  cdpClient.on('Network.requestIntercepted', async ({ interceptionId, request, responseHeaders, resourceType }) => {
    logDebug(`Intercepted ${request.url} {interception id: ${interceptionId}}`);

    const response = await cdpClient.send('Network.getResponseBodyForInterception',{ interceptionId });
    // logDebug(`Response body for ${request.url}:`, response.body);

    const contentTypeHeader = Object.keys(responseHeaders).find(k => k.toLowerCase() === 'content-type');
    let _, contentType = responseHeaders[contentTypeHeader];

    let bodyData = Buffer.from(response.body, 'base64').toString("utf8");
    bodyData = bodyData.replace(`debug:{active:!1`, `debug:{active:1`);
  
    const newHeaders = [
      'Content-Length: ' + bodyData.length,
      'Content-Type: ' + contentType
    ];

    const rawResponse = Buffer.from('HTTP/1.1 200 OK' + '\r\n' + newHeaders.join('\r\n') + '\r\n\r\n' + bodyData).toString('base64');

    logDebug(`Continuing interception ${interceptionId} with modified response...`);
    cdpClient.send('Network.continueInterceptedRequest', { interceptionId, rawResponse });

    logDebug(`Interception continued ${interceptionId}`);

    injectModloader();
  });
}

async function injectModloader() {
  log("Starting Modloader Injection...")
  setTimeout( async () => {try{
    const modLoaderFullPath = `file://${path.resolve(modLoaderTargetPath)}`;
    logDebug(`Resolved mod loader path: ${modLoaderFullPath}`);
    logDebug("Injecting mod loader script...");
    await globalThis.mainPage.addScriptTag({url: modLoaderFullPath});
    log("Modloader script injected successfully");
  } catch(e) {
    logError(e)
    log("Modloader injection failed. send error log to modding channel. Exiting...");
    setTimeout(() => {
      process.exit(0);
    },5000)

  }}, 1000)
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
  if (!config.enableDebug) return;

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
  if (browser) browser.close();
  if (gameProcess) gameProcess.kill();
  process.exit(1);
}

(async () => {
  process.on("uncaughtException", () => unexpectedClose());
  process.on("unhandledRejection", () => unexpectedClose());
  process.on("SIGINT", () => unexpectedClose());
  process.on("SIGTERM", () => unexpectedClose());
  process.on("SIGHUP", () => unexpectedClose());

  await init();
  await tryConnect();
  startDebugConsole();
})();
