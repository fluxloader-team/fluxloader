const puppeteer = require("puppeteer-core");
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");
const http = require("http");
const readline = require("readline");
const util = require("util");

globalThis.bundlejs = "";
const DEBUG = true;
const gameExecutable = "sandustrydemo.exe";
const logFilePath = "./app.log";
const modLoaderTargetPath = "./modloader.js";
const modsFolderPath = "./mods";
const modsJsonPath = path.join(modsFolderPath, "mods.json");
globalThis.debug ={
  activeRequest:{}
}

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
  console.log("[ERROR]", message);
  writeLog("[ERROR] " + message);
};

process.on("uncaughtException", (error) => {
  //logError("Uncaught exception:", error.stack || error.message);
  //tryConnect()
});

process.on("unhandledRejection", (reason, promise) => {
  //logError(`Unhandled rejection at: ${promise}, reason: ${reason}`);
  //tryConnect()
});


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

const fetchWithRetry = async (url, retries = 200, delay = 100) => {
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

  globalThis.debugPort = 9222;
  globalThis.modLoaderSourcePath = path.resolve(__dirname, "assets/modloader.js");

  await ensureModLoaderExists(modLoaderSourcePath, modLoaderTargetPath);

  ensureDirectoryExists(modsFolderPath);

  await generateModsJson(modsFolderPath, modsJsonPath);

  logDebug(`Starting game executable: ${gameExecutable} with debug port ${debugPort}`);
  exec(`"${gameExecutable}" --remote-debugging-port=${debugPort} --enable-logging --enable-features=NetworkService`, (err) => {
    if (err) {
      logError(`Failed to start the game executable: ${err.message}`);
      return;
    }
  });

}
async function tryConnect(){
  globalThis.url = `http://127.0.0.1:${debugPort}/json/version`;
  logDebug(`Fetching WebSocket debugger URL from ${globalThis.url}`);
  globalThis.webSocketDebuggerUrl = await fetchWithRetry(globalThis.url);

  logDebug("Connecting Puppeteer with disabled viewport constraints...");

  globalThis.browser = await puppeteer.connect({
    browserWSEndpoint: webSocketDebuggerUrl,
    defaultViewport: null,

  });

  globalThis.browser.on("disconnected", () => {
    try{
      process.exit(0)
      //tryConnect();
    }catch(e){
      logError(e)
    }

  })
  globalThis.browser.on("*", (event) => {
    try{
      logDebug("Browser event:" + JSON.stringify(event));
    }catch(e){
      logError(e)
    }

  })

  globalThis.pages = await browser.pages();
  logDebug(`Pages found: ${pages.length}`);
  if (pages.length === 0) throw new Error("No open pages found.");

  globalThis.mainPage = pages[0];
  globalThis.mainPage._client.on("Network.requestWillBeSent", (request) => {})
  setTimeout( async () => {
    //await globalThis.mainPage.setRequestInterception(true);
    setTimeout( async () => {
      //await mainPage.reload();
      setTimeout( async () => {

        globalThis.mainPage.on("*", (event) => {
          try{
            logDebug("mainPage event:" + JSON.stringify(event));
          }catch(e){
            logError(e)
          }

        })

        globalThis.mainPage.on("close", () =>{
          try{
            //tryConnect();
          }catch(e){
            logError(e)
          }

        });

        globalThis.mainPage.on("request", requestEvent)
        globalThis.mainPage.on('framenavigated', framenavigatedEvent);

        globalThis.mainPage.on("requestfinished", requestfinishedEvent)
      },1000)
    },1000)
    },1000)


  //globalThis.mainPage.on("load",loadEvent)
}


async function requestEvent(request){
  try{
    globalThis.debug.activeRequest = request;
    logDebug(`Request: ${request.url()}`)
    if (request.url().includes("js/bundle.js") && request.method() !== 'OPTIONS') {
      globalThis.bundlejs = bundlejs.replace(`debug:{active:!1`, `debug:{active:1`)
      logDebug(`Request bundlejs: ${globalThis.bundlejs.includes("debug:{active:1")}`)
      request.respond({
        status: 200,
        contentType: "application/javascript",
        body: globalThis.bundlejs
      });
      setTimeout( async () => {await loadEvent()},1000)
    }else{
      request.continue();
    }
    logDebug(`Request end: ${request.url()}`)
  }catch(e){
    logError(e)
  }
}
async function requestfinishedEvent(request){
  try{
    globalThis.debug.activeRequest = request;
    logDebug(`requestfinishedEvent: ${request.url()}`)
    if (request.url().includes("js/bundle.js") && globalThis.bundlejs == "" && request.method() !== 'OPTIONS') {
      var response = request.response()
      var responseBody;
      if (request.redirectChain().length === 0) {
        responseBody = await response.buffer();
      }
      globalThis.bundlejs = responseBody?.toString()
      globalThis.bundlejs = bundlejs.replace(`debug:{active:!1`, `debug:{active:1`)
      logDebug(`requestfinishedEvent bundlejs: ${globalThis.bundlejs}`)
      //setTimeout( async () => {await globalThis.mainPage.reload({waitUntil: "domcontentloaded"});},1000)

    }
    request.continue();
    logDebug(`requestfinishedEvent end: ${request.url()}`)
  }catch(e){
    if (request.isInterceptResolutionHandled()) return;
    request.continue();
    logError(e)
  }
}
async function framenavigatedEvent(frame){
  logDebug(`Frame navigated to: ${frame.url()}`);
  //await tryConnect()
}

async function loadEvent(){
  setTimeout( async () => {try{
    const modLoaderFullPath = `file://${path.resolve(modLoaderTargetPath)}`;
    logDebug(`Resolved mod loader path: ${modLoaderFullPath}`);

    logDebug("Injecting mod loader script...");

    await globalThis.mainPage.addScriptTag({url: modLoaderFullPath});
    logDebug("Mod loader script injected successfully.");
  }catch(e){
    //loadEvent();
    logError(e)
  }},1000)


}

setTimeout( async () => {
  startDebugConsole();
},100);


const evaluateCommand = (command) => {
  try {
    const result = eval(command);
    console.log("[RESULT]:", util.inspect(result, { depth: 3, colors: true }));
  } catch (error) {
    console.log("[ERROR]:", error.message);
  }
};

// Debug CLI
const startDebugConsole = () => {
  if (!DEBUG) return;
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
      //rl.close();
    } else {
      evaluateCommand(command);
    }
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("Debugger closed.");
  });
};

setInterval(async () => {
  if(globalThis.browser == null || globalThis.browser == undefined){
    try {
      await init();
      await tryConnect();
    }catch(error){
      await logError("Error:", error.message);
      await logDebug("Stack trace:", error.stack);
    }}
},1000)

setTimeout(async () => {
  //await globalThis.mainPage.reload({waitUntil: "domcontentloaded"});
},2000)