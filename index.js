const puppeteer = require("puppeteer-core");
const { exec } = require("child_process");
const readline = require("readline");
const util = require("util");
const acorn = require("acorn");

globalThis.escodegen = require("escodegen");
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
  "/bundle.js": {
    requiresBaseResponse: true,
    getFinalResponse: async ({ baseResponse }) => {
      log(`Intercepted bundle.js and applying ${globalThis.bundlePatches.length} patch(es)...`);
      let body = Buffer.from(baseResponse.body, "base64").toString("utf8");
      body = await injectModloader(body);
      body = applyBundlePatches(body);
      body = Buffer.from(body).toString("base64");
      //setTimeout(() => { injectModloader(); }, 200);
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

class ASTPatchNode {
  constructor(parentASTNode, currentASTNode, action) {
    this.parentASTNode = parentASTNode;
    this.currentASTNode = currentASTNode;
    this.action = action;
  }

  patch() {
    this.action(this);
  }

  /**
   * Find all nodes that match the provided object and apply the callback to each with a new node.
   * - match.type: [function | variable | object | literal | identifier | property | return]
   * - match.name: string
   * - match.value: any              (requires type: literal)
   * - match.objKeys:   {...}        (requires type: object)
   * - match.objValues: [...]||{...} (requires type: object)
   */
  find(match, callback = null, expectedCount = -1) {
    // match requires a type
    if (!match.type) throw new Error("find(...) requires a type to match.");

    let stack = [];
    let found = [];

    // Start the search with all the current nodes children
    let children = this.getChildren(this.currentASTNode);
    for (let child of children) {
      stack.push([this.currentASTNode, child]);
    }

    // DFS through the AST to find all matching nodes
    while (stack.length > 0) {
      let node = stack.pop();

      if (this.doesMatch(node[1], match)) found.push(node);

      let children = this.getChildren(node[1]);
      for (let child of children) {
        if (child != null) stack.push([node[1], child]);
      }
    }

    if (expectedCount !== -1 && found.length !== expectedCount) {
      throw new Error(`find(...) expected ${expectedCount} matches, found ${found.length}.`);
    }

    // Create a new patcher for each found node
    if (callback != null) {
      for (let node of found) {
        let patcher = new ASTPatchNode(node[0], node[1], callback);
        patcher.patch();
      }
    }

    return found.length > 0;
  }

  /**
   * Adds the content of the target function to the specified position.
   * - position: [start | end | before | after]
   * - [before, after]: the parent node MUST have a body array
   * - [start, end]: the current node MUST be a function with a block statement
   */
  insert(position, target) {
    // Must insert a function
    if (!(target instanceof Function)) throw new Error("insert(...) argument 2 must be a function.");

    // Start / end inserts requires the current node to be a function with a block statement
    if (position == "start" || position == "end") {
      if (this.currentASTNode.type != "FunctionDeclaration") throw new Error(`insert(${position}, ...) requires current node to be a function.`);
      if (this.currentASTNode.body.type != "BlockStatement")
        throw new Error(`insert(${position}, ...) requires current node to have a block statement inside.`);
    }

    // Before / after inserts require the parent node to have a list of body nodes
    if (position == "before" || position == "after") {
      if (!(this.parentASTNode.body instanceof Array)) throw new Error(`insert(${position}, ...) requires the current nodes parent to have a body array.`);
    }

    // Convert the  the target to AST and extract the inner nodes
    // Allow standard and arrow functions, as well as either a block or single statement
    const targetAST = acorn.parse(`(${target.toString()})`, { ecmaVersion: 2020 });
    let targetInnerASTNodes = [targetAST.body[0].expression.body];
    if (targetAST.body[0].expression.body.type === "BlockStatement") targetInnerASTNodes = targetAST.body[0].expression.body.body;

    if (position === "start") {
      targetInnerASTNodes.forEach((node) => {
        this.currentASTNode.body.body.unshift(node);
      });
    } else if (position === "end") {
      targetInnerASTNodes.forEach((node) => {
        this.currentASTNode.body.body.push(node);
      });
    } else if (position === "before") {
      let index = this.parentASTNode.body.indexOf(this.currentASTNode);
      targetInnerASTNodes.forEach((node) => {
        this.parentASTNode.body.splice(index, 0, node);
        index++;
      });
    } else if (position === "after") {
      let index = this.parentASTNode.body.indexOf(this.currentASTNode);
      targetInnerASTNodes.forEach((node) => {
        this.parentASTNode.body.splice(index + 1, 0, node);
        index++;
      });
    } else {
      throw new Error(`insert(...) requires a valid position: [start | end | before | after].`);
    }
  }

  /**
   * Wraps the current function with the provided function.
   * - The current node MUST be a function with a block statement.
   * - The wrap function MUST have a block statement, and MUST have same argument count as the current function + 1.
   * - Works by moving the current function into an inner function then appending the wrap function contents.
   */
  wrap(wrapper) {
    // Must wrap with a function
    if (!(wrapper instanceof Function)) throw new Error("wrap(...) requires a wrapping function.");

    // The current node must be a function
    if (this.currentASTNode.type != "FunctionDeclaration") throw new Error("wrap(...) requires current node to be a function.");

    // Convert the wrap function to AST and extract the inner nodes
    const wrapperAST = acorn.parse(`(${wrapper.toString()})`, { ecmaVersion: 2020 });
    let wrapperASTNode = wrapperAST.body[0].expression;

    // The wrap function must have a block statement
    if (!wrapperASTNode.body.type === "BlockStatement") throw new Error("wrap(...) requires a block statement.");

    // The wrap function arguments must match the current function arguments + 1 (for the function)
    if (this.currentASTNode.params.length != wrapperASTNode.params.length - 1)
      throw new Error("wrap(...) requires the same number of arguments as the current function + 1 (for the function).");
    const innerDefinitionName = wrapperASTNode.params[0].name;

    // We want to change:  function current(...args) { ... }
    // To look like:       function current(...args) { function func(...args); ...wrap function contents... }
    // - Move the current nodes function into an inner function with the same arguments
    // - Append the wrap function contents to the block body of the current node

    // Copy the definition of the current function into a new inner function AST node
    const args = this.currentASTNode.params.map((param) => param.name);
    let innerDefinitionASTNode = acorn.parse(`function ${innerDefinitionName}(${args.join(", ")}) { }`, { ecmaVersion: 2020 });
    innerDefinitionASTNode = innerDefinitionASTNode.body[0];
    innerDefinitionASTNode.body.body = this.currentASTNode.body.body;
    this.currentASTNode.body.body = [innerDefinitionASTNode];

    // Append the wrap function contents to the new body of the current node
    wrapperASTNode.body.body.forEach((node) => {
      this.currentASTNode.body.body.push(node);
    });
  }

  /**
   * Changes the current node to the provided value.
   * - currentASTNode.type must be [variable | object | literal | identifier | property]
   * - updateProps only applies to objects and will update properties instead of overwriting
   */
  change(value, updateProps = false) {
    // The current node must be a variable, object, or literal
    if (!(this.currentASTNode.type != "VariableDeclarator" || this.currentASTNode.type != "ObjectExpression" || this.currentASTNode.type != "Literal")) {
      throw new Error("change(...) requires the current node to be a variable, object, or literal.");
    }

    // If the current node is a variable we can overwrite the init value
    if (this.currentASTNode.type === "VariableDeclarator") {
      const valueAST = acorn.parse(`(${value.toString()})`, { ecmaVersion: 2020 });
      this.currentASTNode.init = valueAST.body[0].expression;
    }

    // If the current node is a property we need to change the value
    else if (this.currentASTNode.type === "Property") {
      let valueAST = acorn.parse(`({${this.currentASTNode.key.name}: ${JSON.stringify(value)}})`, { ecmaVersion: 2020 });
      this.currentASTNode.value = valueAST.body[0].expression.properties[0].value;
    }

    // If the current node is an object we need to update the properties
    else if (this.currentASTNode.type === "ObjectExpression") {
      const valueAST = acorn.parse(`(${JSON.stringify(value)})`, { ecmaVersion: 2020 });
      const valueProperties = valueAST.body[0].expression.properties;

      // Just overwrite the properties if updateProps is false
      if (!updateProps) {
        this.currentASTNode.properties = valueProperties;
      }

      // Otherwise update each property
      else {
        function updateObject(a, b) {
          for (let aProp of a) {
            let found = false;
            for (let bProp of b) {
              if (aProp.key.value === bProp.key.name) {

                // Different type so overwrite
                if (aProp.value.type !== bProp.value.type) {
                  bProp.value = bProp.value;
                }
                
                // If both are literals then overwrite
                else if (aProp.value.type === "Literal") {
                  bProp.value.value = aProp.value.value;
                }

                // If both are identifiers then overwrite
                else if (aProp.value.type === "Identifier") {
                  bProp.value.name = aProp.value.name;
                }

                // If both are objects then recurse
                else if (aProp.value.type === "ObjectExpression") {
                  updateObject(aProp.value.properties, bProp.value.properties);
                }

                found = true;
                break;
              }
            }

            // If the property wasn't found then add it
            if (!found) b.push(aProp);
          }
        }

        updateObject(valueProperties, this.currentASTNode.properties);
      }
    }

    // If the current node is a literal we can change the value directly
    else if (this.currentASTNode.type === "Literal") {
      this.currentASTNode.value = value;
    }
  }

  doesMatch(node, match) {
    if (!match.type) throw new Error("find(...) requires a type to match.");

    const typeMap = {
      function: "FunctionDeclaration",
      variable: "VariableDeclarator",
      object: "ObjectExpression",
      literal: "Literal",
      identifier: "Identifier",
      return: "ReturnStatement",
      property: "Property"
    };

    // Support for { type, name, value, props }

    // Always has to be the same type
    if (node.type !== typeMap[match.type]) return false;

    // If an identifier, final return check if they have the same name
    if (node.type === "Identifier") return match.name == undefined || node.name === match.name;

    // If a property, final return check if they have the same name
    if (node.type === "Property") return match.name == undefined || node.key.name === match.name;

    // If name defined then ensure they have the same name
    if (match.name != undefined && node.id.name !== match.name) return false;

    // If a literal, final return check if they have same value
    if (node.type === "Literal") return match.value == undefined || node.value === match.value;

    // If an object, final return check if they have the same properties / values
    else if (node.type === "ObjectExpression") {
      if (!match.objKeys && !match.objValues) return true;

      // Ensure every value in a is found in b
      function doesObjectValuesMatch(a, b) {
        for (let aProp of a) {
          let found = false;
          for (let bProp of b) {
            if (bProp.type !== "Property") continue;

            // Found a matching variable name so check the value
            if (aProp.key.value === bProp.key.name) {
              if (aProp.value.type !== bProp.value.type) return false;
              if (aProp.value.type === "Literal") {
                if (aProp.value.value !== bProp.value.value) return false;
              } else if (aProp.value.type === "Identifier") {
                if (aProp.value.name !== bProp.value.name) return false;
              } else if (aProp.value.type === "ObjectExpression") {
                if (!doesObjectValuesMatch(aProp.value.properties, bProp.value.properties)) return false;
              } else return false;
              found = true;
              break;
            }
          }
          
          if (!found) return false;
        }
        return true;
      }

      // Ensure every key in a is found in b
      function doesObjectKeysMatch(a, b) {
        // Check every element in the a list is found in b
        if (a.type === "ArrayExpression") {
          for (let aKey of a.elements) {
            let found = false;
            for (let bProp of b) {
              if (aKey.value === bProp.key.name) {
                found = true;
                break;
              }
            }
            if (!found) return false;
          }
          return true;
        
        // Recurse into every object key of a and ensure it is found in b
        } else if (a.type === "ObjectExpression") {
          for (let aProp of a) {
            let found = false;
            for (let bProp of b) {
              if (aProp.type !== "Property") continue;
              if (aProp.key.value === bProp.key.name) {
                found = true;
                break;
              }
            }
            if (!found) return false;
          }
        }
        
        // match.objKeys must be either arrays or objects
        else throw new Error("Invalid match objKeys type.");
      }

      if (match.objValues) {
        let matchAST = acorn.parse(`(${JSON.stringify(match.objValues)})`, { ecmaVersion: 2020 });
        matchAST = matchAST.body[0].expression.properties;
        if (!doesObjectValuesMatch(matchAST, node.properties)) return false;
      }

      if (match.objKeys) {
        let matchAST = acorn.parse(`(${JSON.stringify(match.objKeys)})`, { ecmaVersion: 2020 });
        matchAST = matchAST.body[0].expression;
        if (!doesObjectKeysMatch(matchAST, node.properties)) return false;
      }

      return true;
    }

    // At this point the type and name matches with no specific type checks
    return true;
  }

  /**
   * Same as find(...) but performs a property-by-property match to the raw AST node
   * No guard rails for checking types and nice names, uses raw AST node properties
   * https://github.com/estree/estree/blob/master/es5.md
   */
  findUnsafe(match, callback = null, expectedCount = -1) {
    let stack = [];
    let found = [];

    // Start the search with all the current nodes children
    let children = this.getChildren(this.currentASTNode);
    for (let child of children) {
      stack.push([this.currentASTNode, child]);
    }

    // DFS through the AST to find all matching nodes
    while (stack.length > 0) {
      let node = stack.pop();

      if (this.doesMatchUnsafe(node[1], match)) found.push(node);

      let children = this.getChildren(node[1]);
      for (let child of children) {
        if (child != null) stack.push([node[1], child]);
      }
    }

    if (expectedCount !== -1 && found.length !== expectedCount) {
      throw new Error(`find(...) expected ${expectedCount} matches, found ${found.length}.`);
    }

    // Create a new patcher for each found node
    if (callback != null) {
      for (let node of found) {
        let patcher = new ASTPatchNode(node[0], node[1], callback);
        patcher.patch();
      }
    }

    return found.length > 0;
  }

  /**
   * Same as change(...) but directly sets the raw AST nodes properties
   * No guard rails for checking types and nice names, uses raw AST node properties
   * https://github.com/estree/estree/blob/master/es5.md
   */
  changeUnsafe(value, updateProps = false) {
    if (!updateProps) {
      this.currentASTNode = {};
    }

    for (let key in value) {
      this.currentASTNode[key] = value[key];
    }
  }

  doesMatchUnsafe(node, match) {
    function doesVariableMatch(a, b) {
      // If both are objects perform a recursive object deep match
      if (a instanceof Object) {
        if (!(b instanceof Object)) return false;
        if (!doesObjectMatch(a, b)) return false;
        return true;
      }
      
      // If both are arrays perform a recursive list deep match
      else if (a instanceof Array) {
        if (!(b instanceof Array)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (!doesVariableMatch(a[i], b[i])) return false;
        }
        return true;
      }
      
      // Otherwise check literal values
      else return a === b;
    }

    function doesObjectMatch(a, b) {
      // Ensure each property in a is found in b
      for (let key in a) {
        if (!Object.hasOwn(b, key) || b[key] === undefined) return false;
        if (!doesVariableMatch(a[key], b[key])) return false;
      }
      return true;
    }

    return doesObjectMatch(match, node);
  }

  getChildren(node) {
    let children = [];

    // Grab each acorn.Node from each property in the node
    for (let key in node) {
      if (node[key] instanceof acorn.Node) {
        children.push(node[key]);
      } else if (node[key] instanceof Array) {
        if (node[key].length > 0 && node[key][0] instanceof acorn.Node) {
          node[key].forEach(child => {
            if (child instanceof acorn.Node) children.push(child);
          });
        }
      }
    }

    return children;
  }
}

function applyBundlePatches(data) {
  for (const patch of globalThis.bundlePatches) {
    // Match instances of "pattern" and replace with with "replace", expect "expectedMatches" matches
    if (patch.type === "regex") {
      const regex = new RegExp(patch.pattern, "g");
      const matches = data.match(regex);
      if (matches && matches.length === patch.expectedMatches) {
        data = data.replace(regex, patch.replace);
        logDebug(`Applied regex patch: "${patch.pattern}" -> "${patch.replace}", ${matches.length} match(s).`);
      } else {
        throw new Error(`Failed to apply regex patch: "${patch.pattern}" -> "${patch.replace}", ${matches ? matches.length : 0} / ${patch.expectedMatches} match(s).`);
      }
    }
    
    // Process data with "func" from the patch
    else if (patch.type === "process") {
      data = patch.func(data);
      logDebug(`Applied process patch.`);
    }

    // Replace "from" with "to" in the data
    else if (patch.type === "replace") {
      // Find all instances of patch.from
      let index = data.indexOf(patch.from);
      let matches = 0;
      while (index !== -1) {
        matches++;
        data = data.slice(0, index) + patch.to + data.slice(index + patch.from.length);
        index = data.indexOf(patch.from, index + patch.to.length);
      }
      if (patch.expectedMatches && matches !== patch.expectedMatches) {
        throw new Error(`Failed to apply replace patch: "${patch.from}" -> "${patch.to}", ${matches} / ${patch.expectedMatches} match(s).`);
      } else {
        logDebug(`Applied replace patch: "${patch.from}" -> "${patch.to}".`);
      }
    }

    // Apply AST patches to the data
    else if (patch.type === "ast") {
      const ast = acorn.parse(data, { ecmaVersion: 2020 });
      let patcher = new ASTPatchNode(null, ast, patch.action);
      patcher.patch();
      data = escodegen.generate(ast);
      logDebug(`Applied AST patch.`);
    }
  }

  return data;
}

globalThis.modConfig = {
  get: async (modName) =>{
    try {
      modName = modName.replace(/(?:\\+|\/+)|(^|\/)\.+(\/|$)|[?"<>|:*]|(^\/+|\/+$)/g, (match, p1, p2, p3) => {
        if (p1 || p3) return ''; // Remove leading or trailing slashes or dot sequences
        if (p2) return '/';      // Remove directory traversal segments (e.g., `.` or `..`)
        return '/';              // Normalize slashes
      });
      var body;
      if(fs.existsSync(`${modConfigPath}/${modName}.json`)) {
        body = JSON.parse(fs.readFileSync(`${modConfigPath}/${modName}.json`, "utf8"));
      }else{
        body = {}
      }
      return body
    } catch (error) {
      return null;
    }

  },
  set: async (modName, config) =>{
    try {
      modName = modName.replace(/(?:\\+|\/+)|(^|\/)\.+(\/|$)|[?"<>|:*]|(^\/+|\/+$)/g, (match, p1, p2, p3) => {
        if (p1 || p3) return ''; // Remove leading or trailing slashes or dot sequences
        if (p2) return '/';      // Remove directory traversal segments (e.g., `.` or `..`)
        return '/';              // Normalize slashes
      });
      fs.writeFileSync(`${modConfigPath}/${modName}.json`, JSON.stringify(config), "utf8");
      return true

    } catch (error) {
      return false;
    }
  }
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

globalThis.logDebug = function(...args) {
  if (!Object.hasOwn(globalThis, "config")) return;
  const message = args.join(" ");
  if (canLogConsole("debug")) console.log("[DEBUG]", message);
  writeLog("[DEBUG] " + message);
}

globalThis.logError = function(...args) {
  if (!Object.hasOwn(globalThis, "config")) return;
  const message = args.join(" ");
  if (canLogConsole("error")) console.log("[ERROR]", message);
  writeLog("[ERROR] " + message);
}

globalThis.log = function(...args) {
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
    await globalThis.cdpClient.send('Console.enable');
    globalThis.cdpClient.on('Console.messageAdded', (event) => {
      console.log(event.message.text);
    });

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

async function injectModloader(body) {
  logDebug("Starting Modloader Injection...");
  try {
    body = `${globalThis.modloaderContent}
${body}`
   return body;
  } catch(e) {
    logError(e);
    logError("Modloader injection failed. send error log to modding channel. Exiting...");
    setTimeout(() => {
      process.exit(0);
    }, 5000);
    return body;
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
    logError(`Uncaught Exception: ${e.message}\n${e.stack}`);
    unexpectedClose();
  });
  process.on("unhandledRejection", (e) => {
    logError(`Uncaught Rejection: ${e.message}\n${e.stack}`);
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
