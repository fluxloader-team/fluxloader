
globalThis.intercepts = {
	"/bundle.js": [
		{
			requiresBaseResponse: true,
			getFinalResponse: async ({ baseResponse }) => {
				log(`Intercepted bundle.js and applying ${globalThis.bundlePatches.length} patch(es)...`);
				let body = Buffer.from(baseResponse.body, "base64").toString("utf8");
				body = await injectModloader(body);
				body = applyBundlePatches(body);
				body = Buffer.from(body).toString("base64");
				return { body, contentType: "text/javascript" };
			},
		},
	],
	"modloader-api/active-mod-paths": [
		{
			requiresBaseResponse: false,
			getFinalResponse: async (_) => {
				const modPaths = globalThis.loadedMods.map(({ path }) => path);
				let body = JSON.stringify(modPaths, null, 2);
				body = Buffer.from(body).toString("base64");
				return { body, contentType: "application/json" };
			},
		},
	],
	"modloader-api/config": [
		{
			requiresBaseResponse: false,
			getFinalResponse: async ({ request }) => {
				var body = "";
				var obj = JSON.parse(request.postData);
				obj.modName = obj.modName.replace(/(?:\\+|\/+)|(^|\/)\.+(\/|$)|[?"<>|:*]|(^\/+|\/+$)/g, (match, p1, p2, p3) => {
					if (p1 || p3) return ""; // Remove leading or trailing slashes or dot sequences
					if (p2) return "/"; // Remove directory traversal segments (e.g., `.` or `..`)
					return "/"; // Normalize slashes
				});

				const modConfigPath = globalThis.resolvePathRelativeToModloader(`mods/config/${obj.modName}.json`);
				if (request.method == "POST") {
					if (fs.existsSync(modConfigPath)) {
						body = fs.readFileSync(modConfigPath, "utf8");
					} else {
						body = "{}";
					}
				} else if (request.method == "SET") {
					fs.writeFileSync(modConfigPath, JSON.stringify(obj.config), "utf8");
				}

				body = Buffer.from(body).toString("base64");
				return { body, contentType: "application/json" };
			},
		},
	],
};

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
			const allowed = ["FunctionDeclaration", "FunctionExpression"];
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
								return prop.type === "Property" && ((prop.key.type === "Literal" && prop.key.value === key) || (prop.key.type === "Identifier" && prop.key.name === key));
							});
						});
					}

					// Keys is an object so check each nested object
					else if (keys instanceof Object) {
						return Object.keys(keys).every((key) => {
							let prop = properties.find((prop) => {
								return prop.type === "Property" && ((prop.key.type === "Literal" && prop.key.value === key) || (prop.key.type === "Identifier" && prop.key.name === key));
							});
							if (prop === undefined) return false;
							return hasKeys(keys[key], prop.value.properties);
						});
					} else throw new Error("doesMatch('object', { keys }) must be an array or object.");
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
							return prop.type === "Property" && ((prop.key.type === "Literal" && prop.key.value === key) || (prop.key.type === "Identifier" && prop.key.name === key));
						});
						if (prop === undefined) return false;

						// Recurse into a nested object
						if (values[key] instanceof Object) {
							if (prop.value.type !== "ObjectExpression") return false;
							return hasValues(values[key], prop.value.properties);
						}

						// Check the base case of a literal value
						else return values[key] === prop.value.value;
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
				} else if (node.callee.type === "MemberExpression") {
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
		} else throw new Error(`Unknown type (${type}) for doesMatch(...).`);
	}

	/**
	 * Extracts the name of the current node from the parent context.
	 */
	extractNameFromParent(node) {
		let name = null;
		let isAnonymous = false;

		const anonymousTypes = ["CallExpression", "NewExpression", "ReturnStatement", "LogicalExpression", "SequenceExpression", "ArrayExpression", "MemberExpression", "ConditionalExpression", "ArrowFunctionExpression"];

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
		this.astNode = this.astNode._parent;
	}

	/**
	 * Adds the content of the target function to the specified position.
	 * See internal comments for the different positions.
	 * target must be a string that contains an expression or a block statement.
	 */
	insert(position, target) {
		// Convert the target string to AST and extract the body
		let targetCodeASTs = null;
		try {
			targetCodeASTs = acorn.parse(`${target}`, { ecmaVersion: 2020 });
		} catch (e) {
			logError("Failed to parse target code for insert(...)");
			throw e;
		}
		targetCodeASTs = [targetCodeASTs.body[0]];
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
			} else if (position === "end") {
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
			} else if (position === "after") {
				for (let i = 0; i < targetCodeASTs.length; i++) lst.splice(index + 1, 0, targetCodeASTs[i]);
			}
		}
	}

	/**
	 * Wraps the current function with the provided function.
	 * Requires current node to be one of [ FunctionExpression, FunctionDeclaration, ArrowFunctionExpression ]
	 * wrapper must be a string that contains an arrow function: (f, [ args ]) => { ... f( [ args ]); ... }
	 */
	wrap(wrapper) {
		// FunctionExpression.body { BlockStatement.body }
		// FunctionDeclaration.body { BlockStatement.body }
		// ArrowFunctionExpression.body { BlockStatement.body }

		// Must be a function type
		const allowed = ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"];
		if (!allowed.includes(this.astNode.type)) {
			throw new Error("wrap(...) requires the current node to be a function.");
		}

		// Convert the wrapper string to AST and extract the inner nodes
		let wrapperAST = null;
		try {
			wrapperAST = acorn.parse(`(${wrapper})`, { ecmaVersion: 2020 });
		} catch (e) {
			logError("Failed to parse target code for wrap(...)");
			throw e;
		}
		wrapperAST = wrapperAST.body[0].expression;

		// Ensure that wrapper AST is a function
		if (wrapperAST.type !== "ArrowFunctionExpression") {
			throw new Error("wrap(...) requires the wrapper to be an arrow function.");
		}

		// The wrap function arguments must match the current function arguments + 1 (for the function)
		if (this.astNode.params.length != wrapperAST.params.length - 1) throw new Error("wrap(...) requires the same number of arguments as the current function + 1 (for the function).");
		const innerDefinitionName = wrapperAST.params[0].name;

		// Convert the body to a block statement if it is not
		if (wrapperAST.body.type !== "BlockStatement") {
			wrapperAST.body = {
				type: "BlockStatement",
				body: [wrapperAST.body],
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

			let valuesAST;
			try {
				valuesAST = acorn.parse(`(${JSON.stringify(value)})`, { ecmaVersion: 2020 });
			} catch (e) {
				logError("Failed to parse target code for change('update', ...)");
				throw e;
			}
			updateObject(valuesAST.body[0].expression.properties, target.properties);
		}

		// method: Set
		// - Current node can be a variable, object, literal, or property
		else if (method === "set") {
			const allowed = ["VariableDeclarator", "ObjectExpression", "Literal", "Property"];
			if (!allowed.includes(this.astNode.type)) {
				throw new Error("change('set', ...) requires the current node to be a variable, object, literal, or property.");
			}

			let valueAST;
			try {
				valueAST = acorn.parse(`(${JSON.stringify(value)})`, { ecmaVersion: 2020 });
			} catch (e) {
				logError("Failed to parse target code for change('update', ...)");
				throw e;
			}
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
				if (node[key] === undefined || node[key] === null) return false;
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
					node[key].forEach((child) => {
						if (child instanceof acorn.Node) children.push(child);
					});
				}
			}
		}

		return children;
	}
}

globalThis.applyBundlePatches = function (data) {
	// Apply AST patches to the data
	if (patch.type === "ast") {
		const ast = acorn.parse(data, { ecmaVersion: 2020 });
		let patcher = new ASTPatchNode(ast, patch.action);
		patcher.patch();
		data = escodegen.generate(ast);
		logDebug(`Applied AST patch.`);
	}
};

async function finalizeModloaderPatches() {
	if (!globalThis.config.debug.enableDebugMenu) {
		globalThis.bundlePatches.push(
			{
				type: "replace",
				// This disables the debug menu
				// This relies on the minified name "_m" which adds debug button to main menu
				// To find this search for "Debug" and look for the surrounding function - good luck
				from: "function _m(t){",
				to: "function _m(t){return;",
			},
			{
				type: "replace",
				// This uses the spawnElements function of the debug state to disable most debug keybinds
				from: "spawnElements:function(n,r){",
				to: "spawnElements:function(n,r){return false;",
			},
			{
				type: "replace",
				// This exits early out of the 'PauseCamera' down event
				from: "e.debug.active&&(t.session.overrideCamera",
				to: "return;e.debug.active&&(t.session.overrideCamera",
			},
			{
				type: "replace",
				// This exits early out of the 'Pause' down event
				from: "e.debug.active&&(t.session.paused",
				to: "return;e.debug.active&&(t.session.paused",
			}
		);
	} else {
		globalThis.bundlePatches.push({
			type: "replace",
			// This adds the configurable zoom
			from: 'className:"fixed bottom-2 right-2 w-96 pt-12 text-white"',
			to: `className:"fixed bottom-2 right-2 w-96 pt-12 text-white",style:{zoom:"${globalThis.config.debug.debugMenuZoom * 100}%"}`,
		});
	}
	if (!globalThis.config.disableMenuSubtitle) {
		globalThis.bundlePatches.push({
			type: "regex",
			pattern: "if\\(t\\.store\\.scene\\.active===x\\.MainMenu\\)(.+?)else",
			// this relies on minified name "Od" which places blocks
			// If this breaks search the code for "e" for placing blocks in debug
			replace: `if(t.store.scene.active===x.MainMenu){globalThis.setupModdedSubtitle(Od);$1}else`,
		});
	}
}

async function initializeInterceptions() {
	try {
		// Initialize the CDP client
		globalThis.cdpClient = await mainPage.target().createCDPSession();
		await globalThis.cdpClient.send("Console.enable");

		// Redirect console messages to the node console
		if (globalThis.config.debug.forwardConsole) {
			globalThis.cdpClient.on("Console.messageAdded", (event) => {
				logBase("info", "GAME", event.message.text);
			});
		}

		// Convert the intercept patterns into Fetch patterns
		const interceptPatterns = Object.keys(globalThis.intercepts);
		const fetchPatterns = interceptPatterns.map((pattern) => {
			const anyRequestBase = globalThis.intercepts[pattern].some((intercept) => intercept.requiresBaseResponse);
			return { urlPattern: "*" + pattern + "*", requestStage: anyRequestBase ? "Response" : "Request" };
		});
		await cdpClient.send("Fetch.enable", { patterns: fetchPatterns });

		// Listen for any intercepted requests
		await cdpClient.on("Fetch.requestPaused", async ({ requestId, request, frameId, resourceType, responseErrorReason, responseStatusCode, responseStatusText, responseHeaders, networkId, redirectedRequestId }) => {
			var interceptionId = requestId;

			// Find the matching intercepts for the request
			let matchingIntercepts = [];
			interceptPatterns.forEach((pattern) => {
				if (request.url.toLowerCase().includes(pattern.toLowerCase())) {
					matchingIntercepts.push(...globalThis.intercepts[pattern]);
				}
			});

			logDebug(`Intercepted ${request.url} with response code ${responseStatusCode} and interception id: ${interceptionId}: ${matchingIntercepts.length} matching intercept(s).`);

			// Including * or ? in the pattern will cause the 'fetchPatterns' to pick up a URL that no 'interceptPattern' matches
			// This is because fetch uses a pseudo regex pattern, but just above here we are doing a simple string includes
			if (matchingIntercepts.length === 0) {
				logError(`No matching intercepts found for ${request.url}, check your patterns dont include "*" or "?".`);
				process.exit(1);
			}

			let currentResponse = null;

			// If any of the patterns request the base response then we need to retrieve it
			const anyRequestBase = matchingIntercepts.some((intercept) => intercept.requiresBaseResponse);
			if (anyRequestBase) {
				currentResponse = await cdpClient.send("Fetch.getResponseBody", { requestId: interceptionId });
				currentResponse = {
					body: currentResponse.body,
					contentType: responseHeaders.find(({ name }) => name.toLowerCase() === "content-type").value,
				};
			}

			// Sequentially go through the intercepts and get the final response
			for (const matchingIntercept of matchingIntercepts) {
				const interceptResponse = await matchingIntercept.getFinalResponse({
					interceptionId,
					request,
					baseResponse: currentResponse,
					responseHeaders,
					resourceType,
				});

				// If the response is falsy then just keep the current response
				if (!interceptResponse) continue;

				currentResponse = interceptResponse;
			}

			// We want to allow null responses for empty endpoints
			if (!currentResponse) {
				currentResponse = { body: "", contentType: "text/plain" };
			}

			try {
				// Try and populate the response headers with the content length and type
				if (!responseHeaders) {
					responseHeaders = [
						{ name: "Content-Length", value: currentResponse.body.length.toString() },
						{ name: "Content-Type", value: currentResponse.contentType },
					];
				} else {
					responseHeaders = responseHeaders.map(({ name, value }) => {
						if (name.toLowerCase() === "content-length") value = currentResponse.body.length.toString();
						else if (name.toLowerCase() === "content-type") value = currentResponse.contentType;
						return { name, value };
					});
				}
			} catch (e) {
				logDebug(JSON.stringify(responseHeaders));
				logError(e);
			}

			// Extract a response code if provided
			const responseCode = currentResponse.responseCode || 200;

			// Finally we can send the fulfilled request back to the browser
			logDebug(`Fulfilling ${request.url} {interception id: ${interceptionId}}, ${currentResponse.body.length} bytes, ${currentResponse.contentType}`);
			await cdpClient.send("Fetch.fulfillRequest", { requestId: interceptionId, responseCode, responseHeaders, body: currentResponse.body });
		});
	} catch (e) {
		logError(e);
		process.exit(1);
	}
}
