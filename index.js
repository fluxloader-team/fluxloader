const puppeteer = require("puppeteer-core");
const path = require("path");
const { exec } = require("child_process");
const http = require("http");

const DEBUG = true;
const gameExecutable = "sandustrydemo.exe";
const modLoaderPath = "./modloader.js";

const logDebug = (...args) => {
  if (DEBUG) console.log("[DEBUG]", ...args);
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
        logDebug(`Error fetching JSON from ${url}:`, err.message);
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
    const debugPort = 9222;

    logDebug(`Starting game executable: ${gameExecutable} with debug port ${debugPort}`);
    exec(`"${gameExecutable}" --remote-debugging-port=${debugPort}`, (err) => {
      if (err) {
        console.error(`Failed to start the game executable: ${err.message}`);
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
    const modLoaderFullPath = `file://${path.resolve(modLoaderPath)}`;
    logDebug(`Resolved mod loader path: ${modLoaderFullPath}`);

    logDebug("Injecting mod loader script...");
    await mainPage.addScriptTag({ url: modLoaderFullPath });
    logDebug("Mod loader script injected successfully.");
  } catch (error) {
    console.error("Error:", error.message);
    logDebug("Stack trace:", error.stack);
  }
})();