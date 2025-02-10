const puppeteer = require("puppeteer-core");
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");
const http = require("http");
const readline = require("readline");
const util = require("util");

const enableDebug = false;
const debugPort = 9222;
const gameExecutable = "sandustrydemo.exe";
const logFilePath = "./app.log";
const modLoaderSourcePath = "./assets/modloader.js";
const modLoaderTargetPath = "./modloader.js";
const modsFolderPath = "./mods";
const modsJsonPath = path.join(modsFolderPath, "mods.json");

globalThis.bundlejs = "";
globalThis.debug = {
  activeRequest:{}
}

function writeLog(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFilePath, `[${timestamp}] ${message}\n`, "utf8");
};

function logDebug(...args) {
  const message = args.join(" ");
  if (enableDebug) console.log("[DEBUG]", message);
  writeLog("[DEBUG] " + message);
};

function logError(...args) {
  const message = args.join(" ");
  console.log("[ERROR]", message);
  writeLog("[ERROR] " + message);
};

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    logDebug(`Creating directory: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
    logDebug(`Directory created: ${dirPath}`);
  } else {
    logDebug(`Directory already exists: ${dirPath}`);
  }
};

async function ensureModLoaderExists(sourcePath, targetPath) {
  try {
    if (!fs.existsSync(targetPath)) {
      logDebug(`File ${targetPath} does not exist. Creating it from the source...`);
      sourcePath = path.resolve(__dirname, sourcePath);
      let content = fs.readFileSync(sourcePath, "utf8");
      fs.writeFileSync(targetPath, content, "utf8");
      logDebug(`File ${targetPath} created successfully.`);
    } else {
      logDebug(`File ${targetPath} already exists.`);
    }
  } catch (error) {
    logError(`Error ensuring modLoader file exists: ${error.message}`);
    throw error;
  }
};

async function generateModsJson(modsFolder, modsJsonPath) {
  try {
    logDebug(`Checking for .js files in mods folder: ${modsFolder}`);
    const files = fs.readdirSync(modsFolder).filter((file) => file.endsWith(".js"));
    
    const modNames = files.map((file) => path.basename(file, ".js"));
    logDebug(`Mod names extracted: ${modNames}`);

    const jsonContent = JSON.stringify(modNames, null, 2);
    fs.writeFileSync(modsJsonPath, jsonContent, "utf8");

    logDebug(`mods.json created at ${modsJsonPath} with content: ${jsonContent}`);
  } catch (error) {
    logError(`Error generating mods.json: ${error.message}`);
    throw error;
  }
};

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
};

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
};

async function init() {
  fs.writeFileSync(logFilePath, "", "utf8");
  
  if (!fs.existsSync(gameExecutable)) {
    logError(`Game executable not found: ${gameExecutable}`);
    process.exit(1);
  }

  await ensureModLoaderExists(modLoaderSourcePath, modLoaderTargetPath);

  ensureDirectoryExists(modsFolderPath);

  await generateModsJson(modsFolderPath, modsJsonPath);

  logDebug(`Starting game executable: ${gameExecutable} with debug port ${debugPort}`);

  const cmd = `"${gameExecutable}" --remote-debugging-port=${debugPort} --enable-logging --enable-features=NetworkService`;
  exec(cmd, (err) => {
    if (err) {
      logError(`Failed to start the game executable: ${err.message}`);
      return;
    }
  });
}

async function tryConnect() {
  globalThis.url = `http://127.0.0.1:${debugPort}/json/version`;

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

  globalThis.mainPage.on("close", () =>{
    logDebug("Page closed");
  });

  globalThis.mainPage.on('framenavigated', async (frame) => {
    logDebug(`Frame navigated to: ${frame.url()}`);
  });
  
  globalThis.mainPage.on("load", async () => {
    logDebug("Page loaded");
  });

  await interceptRequests(globalThis.mainPage, ["*js/bundle.js"]);

  setTimeout( async () => {
    await mainPage.reload();
  }, 500);

}

async function interceptRequests(page, patterns) {
  logDebug(`Intercepting requests for patterns: ${patterns.join(", ")}`);

  const client = await page.target().createCDPSession();

  await client.send('Network.enable');

  await client.send('Network.setRequestInterception', {
    patterns: patterns.map(pattern => ({
      urlPattern: pattern, resourceType: 'Script', interceptionStage: 'HeadersReceived'
    }))
  });

  client.on('Network.requestIntercepted', async ({ interceptionId, request, responseHeaders, resourceType }) => {
    logDebug(`Intercepted ${request.url} {interception id: ${interceptionId}}`);

    const response = await client.send('Network.getResponseBodyForInterception',{ interceptionId });
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
    client.send('Network.continueInterceptedRequest', { interceptionId, rawResponse });

    logDebug(`Interception continued ${interceptionId}`);

    injectModloader();
  });
}

async function injectModloader() {
  setTimeout( async () => {try{
    const modLoaderFullPath = `file://${path.resolve(modLoaderTargetPath)}`;
    logDebug(`Resolved mod loader path: ${modLoaderFullPath}`);
    logDebug("Injecting mod loader script...");
    await globalThis.mainPage.addScriptTag({url: modLoaderFullPath});
    logDebug("Mod loader script injected successfully.");
  } catch(e) {
    //loadEvent();
    logError(e)
  }}, 1000)
}

function evaluateCommand(command) {
  try {
    const result = eval(command);
    console.log("[RESULT]:", util.inspect(result, { depth: 3, colors: true }));
  } catch (error) {
    console.log("[ERROR]:", error.message);
  }
};

function startDebugConsole() {
  if (!enableDebug) return;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "DEBUG> ",
  });

  console.log("Interactive Debugger started. Type commands to interact with the app.");
  rl.prompt();

  rl.on("line", (line) => {
    const command = line.trim();
    if (command === "exit") {
      console.log("Exiting debugger...");
      rl.close();
    } else {
      evaluateCommand(command);
    }
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("Debugger closed.");
  });
};

(async () => {
  await init();
  await tryConnect();
  startDebugConsole();
})();
