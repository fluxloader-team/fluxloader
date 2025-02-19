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

globalThis.GameVersion = "This is temp remove me"

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
  constructor(astNode, action) {
    this.astNode = astNode;
    this.action = action;
  }

  patch() {
    this.action(this);
  }

  /**
   * Find all nodes that match the args call callback with each node.
   * See doesMatch(...) for the match object structure.
   */
  find(type, args, callback = null, expected = -1) {
    let stack = [];
    let found = [];

    // Start the search with all the current nodes children
    let children = this.getChildren(this.astNode);
    for (let child of children) {
      child._parent = this.astNode;
      stack.push(child);
    }

    // DFS through the AST to find all matching nodes
    while (stack.length > 0) {
      let node = stack.pop();

      if (this.doesMatch(node, type, args)) found.push(node);

      let children = this.getChildren(node);
      for (let child of children) {
        if (child != null) {
          child._parent = node;
          stack.push(child);
        }
      }
    }

    if (expected !== -1 && found.length !== expected) {
      throw new Error(`find(...) expected ${expected} matches, found ${found.length}.`);
    }

    // Create a new patcher for each found node
    if (callback != null) {
      for (let node of found) {
        let patcher = new ASTPatchNode(node, callback);
        patcher.patch();
      }
    }

    return found.length > 0;
  }

  /**
   * Performs a loose check of node against the type and args.
   * See each case inside for their specific args structure.
   */
  doesMatch(node, type, args) {
    // type=function
    // - node: [ "FunctionDeclaration", "FunctionExpression" ]
    // - args: { name: optional, anonymous: optional, params: optional }
    // - Tries to extract its name from context
    if (type == "function") {
      const allowed = [ "FunctionDeclaration", "FunctionExpression" ];
      if (!allowed.includes(node.type)) return false;

      // Get name to check "name" and "anonymous"
      if (args.name !== undefined || args.anonymous !== undefined) {
        let name, isAnonymous;

        // Use name if we have one
        if (node.id) {
          name = node.id.name;
          isAnonymous = false;
        }
        
        // Otherwise extract from context
        else {
          const { name: contextName, isAnonymous: contextIsAnonymous } = this.extractNameFromParent(node);
          name = contextName;
          isAnonymous = contextIsAnonymous;
        }

        if (isAnonymous && args.anonymous !== true) return false;
        if (!isAnonymous && args.name !== undefined && name !== args.name) return false;
      }

      // Extract parameters from node to check "params"
      if (args.params !== undefined) {
        if (node.params.length !== args.params.length) return false;
        for (let i = 0; i < node.params.length; i++) {
          if (node.params[i].name !== args.params[i]) return false;
        }
      }
      
      return true;
    }

    // type=object
    // - node: [ "ObjectExpression" ]
    // - args: { name: optional, anonymous: optional, keys: optional, values: optional }
    // - Tries to extract its name from context
    else if (type == "object") {
      if (node.type !== "ObjectExpression") return false;
      
      // Extract name from context to check "name"
      if (args.name !== undefined || args.anonymous !== undefined) {
        const { name, isAnonymous } = this.extractNameFromParent(node);
        if (isAnonymous && args.anonymous !== true) return false;
        if (!isAnonymous && args.name !== undefined && name !== args.name) return false;
      }

      // Check the node has all the keys in args.keys
      if (args.keys !== undefined) {
        function hasKeys(keys, properties) {
          // Keys is an array so ensure all keys are found
          if (keys instanceof Array) {
            return keys.every((key) => {
              return properties.find((prop) => {
                return prop.type === "Property" && (
                  (prop.key.type === "Literal" && prop.key.value === key) ||
                  (prop.key.type === "Identifier" && prop.key.name === key)
                );
              });
            });
          }
          
          // Keys is an object so check each nested object
          else if (keys instanceof Object) {
            return Object.keys(keys).every((key) => {
              let prop = properties.find((prop) => {
                return prop.type === "Property" && (
                  (prop.key.type === "Literal" && prop.key.value === key) ||
                  (prop.key.type === "Identifier" && prop.key.name === key)
                );
              });
              if (prop === undefined) return false;
              return hasKeys(keys[key], prop.value.properties);
            });
          }

          else throw new Error("doesMatch('object', { keys }) must be an array or object.");
        }

        if (!hasKeys(args.keys, node.properties)) return false;
      }

      // Check the node has all the values in args.values
      if (args.values !== undefined) {
        function hasValues(values, properties) {
          if (!(values instanceof Object)) throw new Error("doesMatch('object', { values }) must be an object.");

          // Check each property and nested object of values is in properties
          return Object.keys(values).every((key) => {
            let prop = properties.find((prop) => {
              return prop.type === "Property" && (
                (prop.key.type === "Literal" && prop.key.value === key) ||
                (prop.key.type === "Identifier" && prop.key.name === key)
              );
            });
            if (prop === undefined) return false;
            
            // Recurse into a nested object
            if (values[key] instanceof Object) {
              if (prop.value.type !== "ObjectExpression") return false;
              return hasValues(values[key], prop.value.properties);
            }
            
            // Check the base case of a literal value
            else return values[key] === prop.value.value
          });
        }

        if (!hasValues(args.values, node.properties)) return false;
      }

      return true;
    }

    // type=property
    // - node: [ "Property" ]
    // - args: required
    else if (type == "property") {
      if (node.type !== "Property") return false;
      if (args === undefined) throw new Error("doesMatch('property', ...) requires args.");
      return node.key.name === args;
    }

    // type=identifier
    // - node: [ "Identifier" ]
    // - args: required
    else if (type === "identifier") {
      if (node.type !== "Identifier") return false;
      if (args === undefined) throw new Error("doesMatch('identifier', ...) requires args.");
      return node.name === args;
    }

    // type=literal
    // - node: [ "Literal" ]
    // - args: required
    else if (node.type === "Literal") {
      if (node.type !== "Literal") return false;
      if (args === undefined) throw new Error("doesMatch('literal', ...) requires args.");
      return node.value === args;
    }

    // type=call
    // - node: [ "CallExpression" ]
    // - args: { name: optiona, params: optional }
    else if (type === "call") {
      if (node.type !== "CallExpression") return false;

      // Simple check against the callee for the name
      if (args.name !== undefined) {
        if (node.callee.type === "Identifier") {
          if (node.callee.name !== args.name) return false;
        }
        else if (node.callee.type === "MemberExpression") {
          if (node.callee.property.name !== args.name) return false;
        }
      }

      // Check correct amount of parameters
      if (args.params !== undefined && node.arguments.length !== args.params.length) return false;

      // Check each parameter matches
      for (let i = 0; i < node.arguments.length; i++) {
       if (args.params !== undefined) {
          if (args.params[i].type === undefined) throw new Error("doesMatch('call', { params }) requires a type on each param.");
          if (!this.doesMatch(node.arguments[i], args.params[i].type, args.params[i])) return false;
          continue;
        }
      }

      return true;
    }

    else throw new Error(`Unknown type (${type}) for doesMatch(...).`);
  }

  /**
   * Extracts the name of the current node from the parent context.
   */
  extractNameFromParent(node) {
    let name = null;
    let isAnonymous = false;

    const anonymousTypes = [
      "CallExpression",
      "NewExpression",
      "ReturnStatement",
      "LogicalExpression",
      "SequenceExpression",
      "ArrayExpression",
      "MemberExpression",
      "ConditionalExpression",
      "ArrowFunctionExpression",
    ];

    if (anonymousTypes.includes(node._parent.type)) {
      isAnonymous = true;
    } else if (node._parent.type == "AssignmentExpression" && node._parent.left.type == "MemberExpression") {
      name = node._parent.left.property.name;
    } else if (node._parent.type == "VariableDeclarator" && node._parent.id.type == "Identifier") {
      name = node._parent.id.name;
    } else if (node._parent.type == "Property") {
      name = node._parent.key.name;
    } else if (node._parent.type == "AssignmentExpression") {
      name = node._parent.left.name;
    } else if (node._parent.type == "AssignmentPattern") {
      name = node._parent.left.name;
    } else if (node._parent.type == "MethodDefinition") {
      name = node._parent.key.name;
    } else {
      isAnonymous = true;
      logDebug(`Hit an unknown AST parent type (${node._parent.type}) when extracting name for node (${node.type})`);
    }

    return { name, isAnonymous };
  }

  /**
   * Move this patcher node to the specific child of the AST node.
   */
  gotoChild(childProp) {
    if (!this.astNode[childProp]) {
      throw new Error(`gotoChild(...) requires a valid child property: ${childProp}`);
    }
    this.astNode[childProp]._parent = this.astNode;
    this.astNode = this.astNode[childProp];
  }

  /**
   * Move this patcher node to the AST nodes parent.
   */
  gotoParent() {
    if (!this.astNode._parent) {
      throw new Error(`gotoParent(...) requires a parent node.`);
    }
    this.astNode = this.astNode._parent
  }

  /**
   * Adds the content of the target function to the specified position.
   * See internal comments for the different positions.
   */
  insert(position, target) {
    // Extract the target code to insert
    let targetCodeASTs = acorn.parse(`(${target.toString()})`, { ecmaVersion: 2020 });
    targetCodeASTs = [ targetCodeASTs.body[0].expression.body ];
    if (targetCodeASTs[0].type === "BlockStatement") targetCodeASTs = targetCodeASTs[0].body;

    function getMutableChildrenList(node) {
      let lst;
      if (node.type === "BlockStatement") {
        lst = node.body;
      } else if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression") {
        if (node.body.type === "BlockStatement") {
          lst = node.body.body;
        }
      }
      return lst;
    }

    // position is one of [ start, end ]
    // - Add to the start / end of the current nodes body
    // - Requires current node to have an insertable list of elements
    if (position == "start" || position == "end") {
      let lst = getMutableChildrenList(this.astNode);
      if (lst === undefined) throw new Error(`insert(${position}, ...) requires a list of elements inside current node.`);

      if (position === "start") {
        for (let i = targetCodeASTs.length - 1; i >= 0; i--) lst.unshift(targetCodeASTs[i]);
      }
      else if (position === "end") {
        for (let i = 0; i < targetCodeASTs.length; i++) lst.push(targetCodeASTs[i]);
      }
    }

    // position is one of [ before, after ]
    // - Add before / after the current node in the parent list
    // - Requires the current node to have a parent with a list of elements
    else if (position == "before" || position == "after") {
      if (!this.astNode._parent) throw new Error(`insert(${position}, ...) requires a parent node.`);

      let lst = getMutableChildrenList(this.astNode._parent);
      if (lst === undefined) throw new Error(`insert(${position}, ...) requires a list of elements inside parent node.`);

      let index = lst.indexOf(this.astNode);
      if (index === -1) throw new Error(`insert(${position}, ...) requires current node to be in the parent nodes list.`);

      if (position === "before") {
        for (let i = targetCodeASTs.length - 1; i >= 0; i--) lst.splice(index, 0, targetCodeASTs[i]);
      }
      else if (position === "after") {
        for (let i = 0; i < targetCodeASTs.length; i++) lst.splice(index + 1, 0, targetCodeASTs[i]);
      }
    }
  }

  /**
   * Wraps the current function with the provided function.
   * Requires current node to be one of [ FunctionExpression, FunctionDeclaration, ArrowFunctionExpression ]
   */
  wrap(wrapper) {
    // Must wrap with a function
    if (!(wrapper instanceof Function)) throw new Error("wrap(...) requires a wrapping function.");

    // FunctionExpression.body { BlockStatement.body }
    // FunctionDeclaration.body { BlockStatement.body }
    // ArrowFunctionExpression.body { BlockStatement.body }
    
    // Must be a function type
    const allowed = [ "FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression" ];
    if (!allowed.includes(this.astNode.type)) {
      throw new Error("wrap(...) requires the current node to be a function.");
    }
    
    // Convert the wrap function to AST and extract the inner nodes
    let wrapperAST = acorn.parse(`(${wrapper.toString()})`, { ecmaVersion: 2020 });
    wrapperAST = wrapperAST.body[0].expression;
    
    // The wrap function arguments must match the current function arguments + 1 (for the function)
    if (this.astNode.params.length != wrapperAST.params.length - 1)
      throw new Error("wrap(...) requires the same number of arguments as the current function + 1 (for the function).");
    const innerDefinitionName = wrapperAST.params[0].name;
    
    // Convert the body to a block statement if it is not
    if (wrapperAST.body.type !== "BlockStatement") {
      wrapperAST.body = {
        type: "BlockStatement",
        body: [ wrapperAST.body ]
      };
    }

    // Original function: function current(...args) { ...contents 1... }
    // With a wrapper:    function wrapper(func, ...args) { ..contents 2... }
    // Should change to:  function current(...args) { function func(...args) { ...contents 1... }; ...contents 2... }
    // - Move the current nodes function into an inner function with the same arguments
    // - Append the wrap function contents to the block body of the current node

    // Create the inner function AST node with the correct arguments
    const args = this.astNode.params.map((param) => param.name);
    let innerFunctionAST = acorn.parse(`function ${innerDefinitionName}(${args.join(", ")}) { }`, { ecmaVersion: 2020 });
    innerFunctionAST = innerFunctionAST.body[0];

    // Copy the original function into the inner function, then the inner function to the current node
    innerFunctionAST.body.body = this.astNode.body.body;
    this.astNode.body.body = [innerFunctionAST];

    // Append the wrap function contents to the new body of the current node
    wrapperAST.body.body.forEach((node) => this.astNode.body.body.push(node));
  }

  /**
   * Changes the current node to the provided value.
   * method=update: Overwrites properties with new values, adds new properties if they don't exist.
   * - value must be an object, can have nested objects.
   * method=set: Overwrites the current nodes value with the new value.
   * - value can be a variable, object, literal, or property.
   */
  change(method, value) {
    // method: Update
    // - current node must be an object (or object in a property)
    // - value must be an object, can have nested objects
    if (method === "update") {
      if (!(value instanceof Object)) throw new Error("change('update', ...) requires an object value.");

      // Extract the target object to update
      let target = this.astNode;
      if (this.astNode.type === "Property") target = this.astNode.value;
      if (this.astNode.type !== "ObjectExpression") {
        throw new Error("change('update', ...) requires the current node to be an object.");
      }

      function updateObject(valuesProperties, nodeProperties) {
        valuesProperties.forEach((valueProp) => {
          const nodeProp = nodeProperties.find((nodeProp) => nodeProp.key.name === valueProp.key.value);

          // Add new property if it doesn't exist
          if (nodeProp === undefined) {
            nodeProperties.push(valueProp);
          }
          
          // Try to continue updating nested properties if both have it
          else if (valueProp.value.type === "ObjectExpression" && nodeProp.value.type === "ObjectExpression") {
            updateObject(valueProp.value.properties, nodeProp.value.properties);
          }

          // Otherwise just overwrite the property
          else {
            nodeProp.value = valueProp.value;
          }
        });
      }

      let valuesAST = acorn.parse(`(${JSON.stringify(value)})`, { ecmaVersion: 2020 });
      updateObject(valuesAST.body[0].expression.properties, target.properties);
    }

    // method: Set
    // - Current node can be a variable, object, literal, or property
    else if (method === "set") {
      const allowed = [ "VariableDeclarator", "ObjectExpression", "Literal", "Property" ];
      if (!allowed.includes(this.astNode.type)) {
        throw new Error("change('set', ...) requires the current node to be a variable, object, literal, or property.");
      }

      let valueAST = acorn.parse(`(${JSON.stringify(value)})`, { ecmaVersion: 2020 });
      valueAST = valueAST.body[0].expression;

      // Update the relevant section of the current node
      if (this.astNode.type === "VariableDeclarator") this.astNode.init = valueAST;
      else if (this.astNode.type === "Property") this.astNode.value = valueAST;
      else if (this.astNode.type === "ObjectExpression") this.astNode.properties = valueAST.properties;
      else if (this.astNode.type === "Literal") this.astNode.value = value;
    }
  }

  /**
   * Same as find(...) but performs a raw search against AST properties.
   * https://github.com/estree/estree/blob/master/es5.md
   */
  findRaw(args, callback = null, expected = -1) {
    let stack = [];
    let found = [];

    // Start the search with all the current nodes children
    let children = this.getChildren(this.astNode);
    for (let child of children) {
      child._parent = this.astNode;
      stack.push(child);
    }

    // DFS through the AST to find all matching nodes
    while (stack.length > 0) {
      let node = stack.pop();

      if (this.doesMatchRaw(node, args)) found.push(node);

      let children = this.getChildren(node);
      for (let child of children) {
        if (child != null) {
          child._parent = node;
          stack.push(child);
        }
      }
    }

    if (expected !== -1 && found.length !== expected) {
      throw new Error(`findRaw(...) expected ${expected} matches, found ${found.length}.`);
    }

    // Create a new patcher for each found node
    if (callback != null) {
      for (let node of found) {
        let patcher = new ASTPatchNode(node, callback);
        patcher.patch();
      }
    }

    return found.length > 0;
  }
  
  /**
   * Same as change(...) but directly sets the raw AST nodes properties.
   * https://github.com/estree/estree/blob/master/es5.md
   */
  changeRaw(change) {
    // Allow the user to directly change the AST node
    change(this.astNode);
  }

  /**
   * Same as doesMatch(...) but performs a raw match against AST properties.
   */
  doesMatchRaw(node, args) {
    // Perform a property-wise match of the node against the args
    // Ensure everything in args is in node, but not the other way around
    // On nested objects recurse otherwise compare values (be careful with arrays)
    function matchObject(node, args) {
      for (let key in args) {
        if (node[key] === undefined) return false;
        if (args[key] instanceof Object) {
          if (!matchObject(node[key], args[key])) return false;
        } else {
          if (node[key] !== args[key]) return false;
        }
      }
      return true;
    }

    return matchObject(node, args);
  }

  /**
   * Extracts all the children of the node.
   * Does this with a brute force search over all properties.
   */
  getChildren(node) {
    let children = [];

    // Grab each acorn.Node from each property in the node
    for (let key in node) {
      if (key === "_parent") continue;
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
      let patcher = new ASTPatchNode(ast, patch.action);
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

async function finalizeModloaderPatches() {
  if (!globalThis.config.debug.enableDebugMenu) {
    globalThis.bundlePatches.push({
      type: "replace",
      from: "function ym(t){",
      to: "function ym(t){return;",
      expectedMatches: 1,
    });
  }
}

async function initializeModloader() {
  await readAndVerifyConfig(configSourcePath, configTargetPath);

  await finalizeModloaderPatches();

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
