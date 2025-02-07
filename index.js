const puppeteer = require("puppeteer-core");
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");
const http = require("http");

const DEBUG = true;
const gameExecutable = "sandustrydemo.exe";
const logFilePath = "./app.log";
const modLoaderTargetPath = "./modloader.js";
const modsFolderPath = "./mods";
const modsJsonPath = path.join(modsFolderPath, "mods.json");

const writeLog = (message) => {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFilePath, `[${timestamp}] ${message}\n`, "utf8");
};

const logDebug = (...args) => {
  const message = args.join(" ");
  if (DEBUG) console.log("[DEBUG]", message);
  writeLog("[DEBUG] " + message);
};

const logError = (...args) => {
  const message = args.join(" ");
  console.error("[ERROR]", message);
  writeLog("[ERROR] " + message);
};

const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    logDebug(`Creating directory: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
    logDebug(`Directory created: ${dirPath}`);
  } else {
    logDebug(`Directory already exists: ${dirPath}`);
  }
};

const ensureModLoaderExists = async (sourcePath, targetPath) => {
  try {
    if (!fs.existsSync(targetPath)) {
      logDebug(`File ${targetPath} does not exist. Creating it from the source...`);
      let content;
      if (process.pkg) {
        sourcePath = path.join(__dirname, "assets/modloader.js");
        content = fs.readFileSync(sourcePath, "utf8");
      } else {
        content = fs.readFileSync(sourcePath, "utf8");
      }
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

const generateModsJson = async (modsFolder, modsJsonPath) => {
  try {
    logDebug(`Checking for .js files in mods folder: ${modsFolder}`);
    const files = fs.readdirSync(modsFolder).filter((file) => file.endsWith(".js"));
    const modNames = files.map((file) => path.basename(file, ".js"));
    const jsonContent = JSON.stringify(modNames, null, 2);

    logDebug(`Mod names extracted: ${modNames}`);
    fs.writeFileSync(modsJsonPath, jsonContent, "utf8");
    logDebug(`mods.json created at ${modsJsonPath} with content: ${jsonContent}`);
  } catch (error) {
    logError(`Error generating mods.json: ${error.message}`);
    throw error;
  }
};

const fetchJSON = (url) =>
    new Promise((resolve, reject) => {
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

const fetchWithRetry = async (url, retries = 5, delay = 5000) => {
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

(async () => {
  try {
    fs.writeFileSync(logFilePath, "", "utf8");

    const debugPort = 9222;
    const modLoaderSourcePath = path.resolve(__dirname, "assets/modloader.js");

    await ensureModLoaderExists(modLoaderSourcePath, modLoaderTargetPath);

    ensureDirectoryExists(modsFolderPath);

    await generateModsJson(modsFolderPath, modsJsonPath);

    logDebug(`Starting game executable: ${gameExecutable} with debug port ${debugPort}`);
    exec(`"${gameExecutable}" --remote-debugging-port=${debugPort}`, (err) => {
      if (err) {
        logError(`Failed to start the game executable: ${err.message}`);
        return;
      }
    });

    const url = `http://127.0.0.1:${debugPort}/json/version`;
    logDebug(`Fetching WebSocket debugger URL from ${url}`);
    const webSocketDebuggerUrl = await fetchWithRetry(url);

    logDebug("Connecting Puppeteer with disabled viewport constraints...");
    const browser = await puppeteer.connect({
      browserWSEndpoint: webSocketDebuggerUrl,
      defaultViewport: null,
    });

    const pages = await browser.pages();
    logDebug(`Pages found: ${pages.length}`);
    if (pages.length === 0) throw new Error("No open pages found.");

    const mainPage = pages[0];
    const modLoaderFullPath = `file://${path.resolve(modLoaderTargetPath)}`;
    logDebug(`Resolved mod loader path: ${modLoaderFullPath}`);

    logDebug("Injecting mod loader script...");
    await mainPage.addScriptTag({ url: modLoaderFullPath });
    logDebug("Mod loader script injected successfully.");
  } catch (error) {
    logError("Error:", error.message);
    logDebug("Stack trace:", error.stack);
  }
})();