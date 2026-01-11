/**
 * @typedef {Object} ModInfo
 * @property {string} modID
 * @property {string} name
 * @property {string} version
 * @property {string} [author]
 * @property {Object.<string,string>} [dependencies]
 * @property {Object} [configSchema]
 * @property {string} [description]
 */

/**
 * @typedef {Object} Mod
 * @property {ModInfo} info
 * @property {string} path
 * @property {boolean} isInstalled
 * @property {boolean} isEnabled
 * @property {boolean} isLoaded
 * @property {string[]|undefined} [versions]
 *
 * @typedef {{ [modID: string]: Mod }} Mods
 */

/**
 * @typedef {Object} Action
 * @property {"install"|"change"|"uninstall"} type
 * @property {string} modID
 * @property {string|null} [version]
 * @property {string[]|null} [parents]
 * @property {"loading"|"queued"|"failed"|"complete"|null} [state]
 *
 * @typedef {{ [modID: string]: Action }} Actions
 */

/**
 * @template T
 * @typedef {Object} FlResponse
 * @property {boolean} success
 * @property {string} message
 * @property {T|null} data
 */

/**
 * @typedef {Object} VerifyIssue
 * @property {"missing"|"disabled"|"version"} type
 * @property {string} modID
 * @property {string} dependencyModID
 * @property {string} dependency
 * @property {string} [dependencyVersion]
 */

/**
 * @typedef {Object} VerifyModsResponse
 * @property {boolean} success
 * @property {VerifyIssue[]} issues
 */

/**
 * @typedef {Object} CalculateModsResponse
 */

/**
 * @typedef {Object} FetchedMod
 * @property {string} modID
 * @property {ModInfo} [modData]
 * @property {string[]} [versionNumbers]
 * @property {string} [uploadTime]
 * @property {string} [renderedDescription]
 * @property {any} [votes]
 *
 * @typedef {{ [modID: string]: FetchedMod }} FetchedModCache
 */

export class EventBus {
	logging = true;
	events = {};

	constructor(logging = true) {
		this.logging = logging;
	}

	registerEvent(event, toLog = true) {
		if (toLog && this.logging) logDebug(`Registering new event '${event}'`);
		if (this.events[event]) throw new Error(`Event already registered: ${event}`);
		this.events[event] = [];
	}

	async trigger(event, data, toLog = true) {
		// When triggering an event generally if the source is inactive we error, but if the listener is inactive we ignore it
		if (toLog && this.logging) logDebug(`Triggering event '${event}'`);
		if (!this.events.hasOwnProperty(event)) throw new Error(`Cannot trigger non-existent event: ${event}`);
		for (let i = this.events[event].length - 1; i >= 0; i--) {
			await this.events[event][i](data);
		}
	}

	async tryTrigger(event, data, toLog = true) {
		// This is here in cases for when we cant be sure if the event is registered or not
		if (toLog && this.logging) logDebug(`Trying to trigger event '${event}'`);
		if (!this.events.hasOwnProperty(event)) return;
		for (let i = this.events[event].length - 1; i >= 0; i--) {
			await this.events[event][i](data);
		}
	}

	on(event, func, toLog = true) {
		if (toLog && this.logging) logDebug(`Adding event listener for '${event}'`);
		if (!this.events[event]) throw new Error(`Cannot add listener to non-existent event: ${event}`);
		this.events[event].push(func);
	}

	off(event, func, toLog = true) {
		if (toLog && this.logging) logDebug(`Removing event listener for '${event}'`);
		if (!this.events[event]) throw new Error(`Cannot remove listener from non-existent event: ${event}`);
		const index = this.events[event].indexOf(func);
		if (index === -1) throw new Error(`Listener not found for event: ${event}`);
		this.events[event].splice(index, 1);
	}

	clear(toLog = true) {
		if (toLog && this.logging) logDebug("Clearing EventBus");
		for (const event in this.events) {
			delete this.events[event];
		}
	}

	logContents() {
		let outputString = "EventBus Content\n\n";

		outputString += `  |  Events (${Object.keys(this.events).length})\n`;
		for (const event in this.events) {
			outputString += `  |  |   ${event}: ${this.events[event].length} listeners\n`;
		}

		logDebug(outputString);
	}
}

export class FluxloaderSemver {
	static isDependencyValid(dependency) {
		// If it is `param:version` then we validate param and version seperately
		if (dependency.includes(":")) {
			const spitDependency = dependency.split(":");
			if (spitDependency.length !== 2) return false;
			const [param, dependencySemver] = spitDependency;
			if (!["optional", "conflict"].includes(param)) return false;
			dependency = dependencySemver;
		}
		// Now just validate if it is a valid semver value
		return semver.coerce(dependency) != null || semver.validRange(dependency) != null;
	}

	static isOptional(dependency) {
		return dependency.startsWith("optional:");
	}

	static isConflict(dependency) {
		return dependency.startsWith("conflict:");
	}

	static doesVersionSatisfyDependency(version, dependency) {
		// If it is `param:version` then we use custom logic
		// `optional:version` means the version should satisfy the dependency if it exists
		// `conflict:version` means the version should not satisfy the dependency
		if (dependency.includes(":")) {
			const [param, dependencySemver] = dependency.split(":");
			if (param === "optional") return !version || semver.satisfies(version, dependencySemver);
			if (param === "conflict") return !semver.satisfies(version, dependencySemver);
		}
		// Regular semver dependency check for `version`
		return semver.satisfies(version, dependency);
	}
}

export class SchemaValidation {
	// Errors if the schema is invalid
	// Return true / false if the target is valid

	static FLOAT_EPSILON = 1e-8;

	static validate({ target, schema, config = {}, path = [], validateCallback }) {
		// Recursively validates the target object against the schema object
		if (typeof schema !== "object") {
			return { success: false, error: { id: "schemaNotObject", message: "Schema must be an object" }, source: "schema" };
		}
		if (typeof target !== "object") {
			return { success: false, error: { id: "targetNotObject", message: "Target must be an object" }, source: "target" };
		}

		// Ensure every key in target is also in the schema
		for (const configKey of Object.keys(target)) {
			let nextPath = path.concat(configKey);
			if (schema[configKey] === undefined) {
				if (!config.unknownKeyMethod || config.unknownKeyMethod === "ignore") {
					logWarn(`Target warning: Key '${nextPath.join(".")}' is not in the schema, ignoring...`);
				} else if (config.unknownKeyMethod === "delete") {
					logWarn(`Target warning: Key '${nextPath.join(".")}' is not in the schema, deleting...`);
					delete target[configKey];
				} else if (config.unknownKeyMethod === "error") {
					return {
						success: false,
						error: {
							id: "notInSchema",
							message: `Key '${nextPath.join(".")}' is not in the schema`,
							path: nextPath,
							key: configKey,
						},
						source: "target",
					};
				}
			}
		}

		for (const [schemaKey, schemaValue] of Object.entries(schema)) {
			let nextPath = path.concat(schemaKey);
			// The schema value must be an object
			if (typeof schemaValue !== "object") {
				// throw new Error(`Schema invalid: Key '${schemaKey}' is not an object`);
				return {
					success: false,
					error: {
						id: "notObject",
						message: `Key '${nextPath.join(".")}' is not an object`,
						path: nextPath,
						key: schemaKey,
					},
					source: "schema",
				};
			}

			// Validate the target value against the schema leaf node
			const res = this.isSchemaLeafNode(schemaValue);
			if (!res.success) return res;
			if (res.isLeaf) {
				if (!Object.hasOwn(target, schemaKey)) {
					if (!Object.hasOwn(schemaValue, "default")) {
						return {
							success: false,
							error: {
								id: "keyRequired",
								message: `Key '${nextPath.join(".")}' is required by the schema`,
								path: nextPath,
								key: schemaKey,
							},
							source: "target",
						};
					}
					logDebug(`Key '${nextPath.join(".")}' has no value. Using default: ${JSON.stringify(schemaValue.default)}`);
					target[schemaKey] = schemaValue.default;
				}
				let res = this.validateValue(target[schemaKey], schemaValue);
				if (!res.success) {
					if (validateCallback) {
						target[schemaKey] = validateCallback({
							path: nextPath,
							key: schemaKey,
							leaf: schemaValue,
							value: target[schemaKey],
						});
						// re-validate
						res = this.validateValue(target[schemaKey], schemaValue);
					}
					// Check if res still failed (in case validateCallback worked)
					if (!res.success) {
						return {
							success: false,
							error: {
								id: "keyInvalid",
								message: `Key '${nextPath.join(".")}' is invalid, ${res.error}`,
								path: nextPath,
								key: schemaKey,
								leaf: schemaValue,
								value: target[schemaKey],
							},
							source: res.source,
						};
					}
				}
			}

			// Otherwise recurse into the target and schema object
			else {
				if (!Object.hasOwn(target, schemaKey)) target[schemaKey] = {};
				const res = this.validate({ target: target[schemaKey], schema: schemaValue, path: nextPath, validateCallback });
				if (!res.success) return res;
			}
		}

		return { success: true };
	}

	static validateValue(targetValue, schemaLeafValue) {
		switch (schemaLeafValue.type) {
			case "boolean":
				var isValid = typeof targetValue === "boolean";
				if (!isValid) return { success: false, error: `Expected boolean but got ${typeof targetValue}`, source: "target" };
				return { success: true };

			case "string":
				if (typeof targetValue !== "string") return { success: false, error: `Expected string but got ${typeof targetValue}`, source: "target" };
				if (Object.hasOwn(schemaLeafValue, "pattern")) {
					var regex = new RegExp(schemaLeafValue.pattern);
					if (!regex.test(targetValue)) return { success: false, error: `String '${targetValue}' does not match pattern '${schemaLeafValue.pattern}'`, source: "target" };
				}
				return { success: true };

			case "semver":
				if (typeof targetValue !== "string") return { success: false, error: `Expected semver string but got ${typeof targetValue}`, source: "target" };
				var isValid = FluxloaderSemver.isDependencyValid(targetValue);
				if (!isValid) return { success: false, error: `String '${targetValue}' is not a valid fluxloader semver dependency`, source: "target" };
				return { success: true };

			case "number":
				if (typeof targetValue !== "number") return { success: false, error: `Expected number but got ${typeof targetValue}`, source: "target" };
				if (Object.hasOwn(schemaLeafValue, "min") && targetValue < schemaLeafValue.min) return { success: false, error: `Number is less than minimum value ${schemaLeafValue.min}`, source: "target" };
				if (Object.hasOwn(schemaLeafValue, "max") && targetValue > schemaLeafValue.max) return { success: false, error: `Number is greater than maximum value ${schemaLeafValue.max}`, source: "target" };
				// If step is given, checks if the value is close enough to the step value
				if (Object.hasOwn(schemaLeafValue, "step")) {
					const step = Math.abs((targetValue - (schemaLeafValue.min || 0)) / schemaLeafValue.step) % 1;
					if (step > SchemaValidation.FLOAT_EPSILON && 1 - step > SchemaValidation.FLOAT_EPSILON) {
						return { success: false, error: `Number ${targetValue} is not a valid step of ${schemaLeafValue.step}`, source: "target" };
					}
				}
				return { success: true };

			case "dropdown":
				if (!schemaLeafValue.options) return { success: false, error: `Dropdown schema must have 'options' defined`, source: "schema" };
				if (!schemaLeafValue.options.includes(targetValue)) return { success: false, error: `Value '${targetValue}' is not a valid option for dropdown`, source: "target" };
				return { success: true };

			case "object":
				if (typeof targetValue !== "object") return { success: false, error: `Expected object but got ${typeof targetValue}`, source: "target" };
				if (targetValue === null) return { success: false, error: `Expected object but got null`, source: "target" };
				if (Array.isArray(targetValue)) return { success: false, error: `Expected object but got an array`, source: "target" };
				return { success: true };

			case "array":
				if (!Array.isArray(targetValue)) return { success: false, error: `Expected array but got ${typeof targetValue}`, source: "target" };
				if (Object.hasOwn(schemaLeafValue, "elements")) {
					// If elements is defined, validate each element in the array
					for (const [index, element] of targetValue.entries()) {
						const res = this.validateValue(element, schemaLeafValue.elements);
						if (!res.success) {
							return { success: false, error: `Element at index ${index} is invalid, ${res.error}`, source: res.source };
						}
					}
				}
				return { success: true };

			default:
				return { success: false, error: `Unknown schema type '${schemaLeafValue.type}'`, source: "schema" };
		}
	}

	static isSchemaLeafNode(schemaValue) {
		// This should be caught in the validate function but just in case we check here too
		if (typeof schemaValue !== "object") return { success: false, error: `Schema value must be an object`, source: "schema" };

		// If the schema value has "type" defined it is a leaf node
		const hasType = Object.hasOwn(schemaValue, "type");
		if (hasType) return { success: true, isLeaf: true };

		// If it does not have "type" defined it must only contain other objects or be empty
		const anyValuesNotObjects = Object.values(schemaValue).some((value) => typeof value !== "object");
		if (anyValuesNotObjects) return { success: false, error: `Schema node properties must either be a leaf node (include type) or only contain other objects`, source: "schema" };
		return { success: true, isLeaf: false };
	}
}

export class Logging {
	static levelColours = {
		debug: "brightBlue",
		info: "grey",
		warn: "yellow",
		error: "red",
	};

	static logHead(timestamp, level, tag, coloured = false) {
		let timestampText = timestamp.toISOString().split("T")[1].split("Z")[0];
		const levelText = level.toUpperCase();
		if (!coloured) {
			return `${levelText} ${timestampText}${tag ? ` ${tag}` : ""}`;
		} else {
			const levelColour = Logging.levelColours[level] || "white";
			return Logging.colourText(`${levelText} ${timestampText}`, levelColour) + Logging.colourText(tag ? ` ${tag}` : "", "magenta");
		}
	}

	static colourText(text, colour) {
		const COLOUR_MAP = {
			red: "\x1b[31m",
			green: "\x1b[32m",
			yellow: "\x1b[33m",
			blue: "\x1b[34m",
			magenta: "\x1b[35m",
			cyan: "\x1b[36m",
			white: "\x1b[37m",
			grey: "\x1b[90m",
			black: "\x1b[30m",
			brightRed: "\x1b[91m",
			brightGreen: "\x1b[92m",
			brightYellow: "\x1b[93m",
			brightBlue: "\x1b[94m",
			brightMagenta: "\x1b[95m",
			brightCyan: "\x1b[96m",
			brightWhite: "\x1b[97m",
			reset: "\x1b[0m",
		};
		return `${COLOUR_MAP[colour]}${text}\x1b[0m`;
	}
}

export class DependencyCalculator {
	/** @returns {CalculateModsResponse} */
	static async calculate(/** @type {Mods} */ mods, /** @type {Actions} */ inputActions, /** @type {FetchedModCache} */ fetchedModCache) {
		logDebug(`Calculating all mod actions for ${Object.keys(inputActions).length} main action(s)`);

		/**
		 * Cache for mods available versions
		 * @type {{ [modID: string]: string[] }}
		 */
		let modVersionsCache = {};

		/**
		 * Cache for mod version dependencies
		 * - 2 layered map of modID -> version -> {dependencies}
		 * - Dependencies are a map of dependencyModID -> dependencyVersion
		 * @type {{ [modID: string]: { [version: string]: { [dependencyModID: string]: string } } }}
		 */
		let modVersionDependencies = {};

		/**
		 * @typedef {Object} Constraint
		 * @property {string} version
		 * @property {string|null} parent
		 */

		/**
		 * Holds the mutable sets used during calculation
		 * @typedef {Object} CalculationState
		 * @property {{ [modID: string]: string }} versions
		 * @property {{ [modID: string]: Constraint[] }} constraints
		 * @property {string[]} markedForUninstall
		 */

		/** @type {CalculationState} */
		let inputState;

		/** @type {CalculationState} */
		let currentState;

		// ---------------------- UTILITY ----------------------

		/** @returns {FlResponse<string[]>} */
		const getModVersions = async (modID) => {
			// Retrieve all available versions for a mod from the API
			// First check if it is installed, then check memoized fetched mod cache, then fetch from API

			// Already cached
			if (modVersionsCache[modID]) {
				return successResponse(`Mod versions found for '${modID}'`, modVersionsCache[modID]);
			}

			// Take known remote versions and add local version if it's not included
			const cacheVersions = (/** @type {Mod} */ modData) => {
				let versions = JSON.parse(JSON.stringify(modData.versions || []));
				if (modData.info && modData.info.version && !versions.includes(modData.info.version)) {
					// Add local to the end (yes it's most likely the latest, but we sort anyway)
					versions.push(modData.info.version);
					// Local version is most likely the latest, but we make sure here
					// Sorted highest -> lowest
					versions.sort((a, b) => -semver.compare(a, b));
				}
				modVersionsCache[modID] = versions;
				return successResponse(`Mod versions found for '${modID}'`, versions);
			};

			// Check data in installed mods
			if (mods[modID] && mods[modID].versions) {
				return cacheVersions(mods[modID]);
			}

			// Check remote mod cache
			if (fetchedModCache[modID] && fetchedModCache[modID].versionNumbers) {
				return cacheVersions({ versions: fetchedModCache[modID].versionNumbers });
			}

			// Now try and fetch incase it is a remote mod
			const versionsURL = `https://fluxloader.app/api/mods?option=versions&modid=${modID}`;
			let versionsResData;
			try {
				const res = await fetch(versionsURL);
				versionsResData = await res.json();
			} catch (e) {
				return errorResponse(`Failed to fetch available versions for mod '${modID}' with url ${versionsURL}: ${e.stack}`, {
					errorModID: modID,
					errorReason: "mod-versions-fetch",
				});
			}

			if (versionsResData && Object.hasOwn(versionsResData, "versions")) {
				return cacheVersions(versionsResData);
			}

			// At this point it has to be a local only mod (with versions == null)
			if (mods[modID] == null) return errorResponse(`No mod versions found for '${modID}'`);
			return cacheVersions(mods[modID]);
		};

		/** @returns {FlResponse<{ [dependencyModID: string]: string }>} */
		const getModVersionDependencies = async (modID, version) => {
			// Already cached
			if (modVersionDependencies[modID]) {
				if (modVersionDependencies[modID][version]) {
					return successResponse(`Mod version dependencies found for '${modID}' version '${version}'`, modVersionDependencies[modID][version]);
				}
			} else {
				modVersionDependencies[modID] = {};
			}

			// Check installed mods
			if (mods[modID] && mods[modID].info && mods[modID].info.version === version) {
				modVersionDependencies[modID][version] = mods[modID].info.dependencies || {};
				return successResponse(`Mod version dependencies found for '${modID}' version '${version}'`, modVersionDependencies[modID][version]);
			}

			// Check remote mod cache
			if (fetchedModCache[modID] && fetchedModCache[modID].modData && fetchedModCache[modID].modData.version === version) {
				modVersionDependencies[modID][version] = fetchedModCache[modID].modData.dependencies || {};
				return successResponse(`Mod version dependencies found for '${modID}' version '${version}'`, modVersionDependencies[modID][version]);
			}

			// Otherwise fetch
			const versionDataURL = `https://fluxloader.app/api/mods?option=info&modid=${modID}&version=${version}`;
			let versionData;
			try {
				// logDebug(`Fetching '${modID}' version '${version}' from API: ${versionDataURL}`);
				const fetchStart = Date.now();
				const res = await fetch(versionDataURL);
				versionData = await res.json();
				const fetchEnd = Date.now();
				// logDebug(`Fetched '${modID}' version '${version}' in ${fetchEnd - fetchStart}ms`);
			} catch (e) {
				return errorResponse(`Failed to fetch '${modID}' version '${version}': ${e.stack}`, {
					errorModID: modID,
					errorReason: "mod-version-fetch",
				});
			}

			// Check the response is valid
			if (!versionData || !Object.hasOwn(versionData, "mod") || !Object.hasOwn(versionData.mod, "modData")) {
				return errorResponse(`Invalid response for mod info of ${modID} version ${version}`, {
					errorModID: modID,
					errorReason: "mod-version-fetch",
				});
			}
			// ERROR
			const dependencies = versionData.mod.modData.dependencies || {};
			if (!dependencies || typeof dependencies !== "object") {
				return errorResponse(`Invalid response for mod info of ${modID} version ${version}`, {
					errorModID: modID,
					errorReason: "version-info-fetch",
				});
			}

			// Finally we can add it to the cache
			if (!modVersionDependencies[modID]) modVersionDependencies[modID] = {};
			modVersionDependencies[modID][version] = dependencies;
			return successResponse(`Mod version dependencies found for '${modID}' version '${version}'`, dependencies);
		};

		/** @returns {FlResponse<{ [modID: string]: Constraint[] }>} */
		const populateState = async (state) => {
			if (!state) return errorResponse("Current state not initialised");

			// Reset current state and copy everything from input state
			for (const modID in inputState.versions) {
				if (!state.versions[modID]) {
					state.versions[modID] = inputState.versions[modID];
				}
			}

			state.markedForUninstall = [...inputState.markedForUninstall];

			state.constraints = {};
			for (const modID in inputState.constraints) {
				state.constraints[modID] = inputState.constraints[modID].slice();
			}

			// Now populate constraints with dependencies from the current states mod versions
			for (const modID in state.versions) {
				const modDependenciesResponse = await getModVersionDependencies(modID, state.versions[modID]);
				if (!modDependenciesResponse.success) return modDependenciesResponse;
				const modDependencies = modDependenciesResponse.data;

				for (const depModID in modDependencies) {
					if (!state.constraints[depModID]) state.constraints[depModID] = [];
					state.constraints[depModID].push({ version: modDependencies[depModID], parent: modID });
				}
			}

			// Propogate uninstalls up the dependency tree
			let uninstallsToPropogate = [...state.markedForUninstall];
			while (uninstallsToPropogate.length > 0) {
				const modID = uninstallsToPropogate.pop();

				if (state.constraints[modID]) {
					for (const constraint of state.constraints[modID]) {
						const parentModID = constraint.parent;

						if (parentModID && !state.markedForUninstall.includes(parentModID)) {
							state.markedForUninstall.push(parentModID);
							uninstallsToPropogate.push(parentModID);
						}
					}
				}
			}

			return successResponse(`Constraints created from current state`);
		};

		/** Returns whether a version satisfies all constraints for a mod */
		// Modified to accept modID so it can detect uninstalls for that mod
		const doesVersionSatisfyAllConstraints = (modID, version, modConstraints) => {
			if (currentState.markedForUninstall.includes(modID)) return false;
			for (const constraint of modConstraints) {
				if (!FluxloaderSemver.doesVersionSatisfyDependency(version, constraint.version)) {
					return false;
				}
			}
			return true;
		};

		const hashModVersions = (versions) => {
			if (versions.length == 0) return "";
			const sortedKeys = Object.keys(versions).sort();
			let hashString = "";
			for (const key of sortedKeys) {
				hashString += `${key}:${versions[key]};`;
			}
			return hashString;
		};

		/** @returns {Promise<FlResponse<{[modID: string]: string[] }>>} */
		const getAllValidVersionsForRelevantMods = async (state) => {
			const result = {};

			// Include .versions (for existing mods) and .constraints (for new mods)
			const relevantMods = new Set([...Object.keys(state.versions), ...Object.keys(state.constraints)]);

			for (const modID of relevantMods) {
				// If the mod is marked for uninstall, skip it
				if (state.markedForUninstall.includes(modID)) {
					if (modID in state.versions) result[modID] = [state.versions[modID]];
					continue;
				}

				// fetch all versions of the mod
				const versionsResponse = await getModVersions(modID);
				if (!versionsResponse.success) return versionsResponse;
				const versions = versionsResponse.data;
				if (!versions || versions.length === 0) {
					return errorResponse(
						`No versions available for '${modID}'`,
						{
							errorModID: modID,
							errorReason: "no-mod-versions",
						},
						false,
					);
				}

				const modConstraints = state.constraints[modID];
				if (!modConstraints || modConstraints.length === 0) {
					// No constraints, all versions are valid
					result[modID] = versions;
					continue;
				}

				// Otherwise filter to only valid versions per the constraints
				const validVersions = versions.filter((v) => doesVersionSatisfyAllConstraints(modID, v, modConstraints));
				if (validVersions.length === 0) {
					return errorResponse(
						`No valid version for mod '${modID}' that satisfies: ${JSON.stringify(modConstraints)}`,
						{
							errorModID: modID,
							errorReason: "constraint-unsatisfied",
						},
						false,
					);
				}

				result[modID] = validVersions;
			}

			return successResponse("Valid versions computed", result);
		};

		/**
		 * @param {{[modID:string]: string[]}} validVersions
		 * @param {{[modID:string]: string}} previousVersions
		 * @returns {{[modID:string]: string[]}}
		 */
		const orderValidVersions = (validVersions, previousVersions) => {
			const ordered = {};
			const modIDs = Object.keys(validVersions).sort();

			for (const modID of modIDs) {
				const valid = validVersions[modID];
				const list = [];

				const installed = mods[modID]?.info?.version;
				const previous = previousVersions[modID];

				// Prioritize previous version, then installed version, then the rest
				// We want previous prioritized as that is what generated this version list in the first place
				if (previous && previous !== installed && valid.includes(previous)) list.push(previous);
				if (installed && valid.includes(installed)) list.push(installed);

				for (let v of valid) {
					if (!list.includes(v)) list.push(v);
				}

				ordered[modID] = list;
			}

			return ordered;
		};

		/**
		 * @param {{[modID:string]: string[]}} ordered
		 * @param {number} cap
		 * @returns {Array<{[modID:string]:string}>}
		 */
		const generateVersionCombos = (ordered, cap = 2000) => {
			const modIDs = Object.keys(ordered);
			const out = [];

			// Consider changing to breadth-first for better(?) results..?
			// Depth first recursive generator (AI generated)
			(function gen(i, acc) {
				if (out.length >= cap) return;
				if (i === modIDs.length) {
					out.push({ ...acc });
					return;
				}
				const modID = modIDs[i];
				for (const v of ordered[modID]) {
					acc[modID] = v;
					gen(i + 1, acc);
				}
			})(0, {});

			return out;
		};

		// ---------------------- SETUP ----------------------

		// Build input state from currently installed mods and input actions
		inputState = { versions: {}, constraints: {}, markedForUninstall: [] };

		for (const modID in mods) {
			inputState.versions[modID] = mods[modID].info.version;
		}

		for (const actionModID in inputActions) {
			const action = inputActions[actionModID];
			if (action.type === "install") {
				inputState.constraints[actionModID] = [{ version: action.version, parent: null }];
			} else if (action.type === "uninstall") {
				inputState.markedForUninstall.push(actionModID);
			} else {
				return errorResponse(`Invalid action type '${action.type}' for mod '${actionModID}'`, {
					errorModID: actionModID,
					errorReason: "invalid-action-type",
				});
			}

			// We need to remove the existing version so it is not considered
			delete inputState.versions[actionModID];
		}

		// ---------------------- CALCULATION ----------------------

		// Loop until we have found a stable configuration of mod versions
		// If we hit a dead end we just exit out the entire calculation with errorResponse()
		let isStable = false;
		let iterations = 0;
		let visitedVersionHashes = new Set();
		let queuedVersionHashes = new Set();
		let versionQueue = [{}];

		while (!isStable && iterations < 50 && versionQueue.length > 0) {
			// Get the next version combination from the queue and populate
			const currentVersions = versionQueue.shift();

			currentState = { versions: currentVersions, constraints: {}, markedForUninstall: [] };
			const populateResponse = await populateState(currentState);
			if (populateResponse.success === false) return populateResponse;

			const currentHash = hashModVersions(currentState.versions);
			visitedVersionHashes.add(currentHash);

			logDebug(`Trying to resolve state (queueSize=${versionQueue.length}): versions=${currentHash}, constraints=${JSON.stringify(currentState.constraints)}, markedForUninstall=${JSON.stringify(currentState.markedForUninstall)}`);

			// Calculate the versions for each mod that are valid given the constraints
			const validModVersionsResponse = await getAllValidVersionsForRelevantMods(currentState);
			if (!validModVersionsResponse.success) {
				logDebug(`Cannot resolve configuration: ${validModVersionsResponse.message}`);
				iterations++;
				continue;
			}

			const validModVersions = validModVersionsResponse.data;

			// Order the valid versions so we try installed / previous versions first
			const orderedValidVersions = orderValidVersions(validModVersions, currentVersions);

			// generate all the combos of valid versions to try
			const versionCombos = generateVersionCombos(orderedValidVersions, 2000);

			// Go over and check if any of the generated combos are stable
			// If not add them to the queue if we haven't already visited them
			let newCombos = 0;
			for (const combo of versionCombos) {
				const comboHash = hashModVersions(combo);
				if (comboHash === currentHash) {
					isStable = true;
					currentState.versions = combo;
					break;
				}
				if (!visitedVersionHashes.has(comboHash) && !queuedVersionHashes.has(comboHash)) {
					queuedVersionHashes.add(comboHash);
					versionQueue.push(combo);
					newCombos++;
				}
			}

			logDebug(`Generated ${newCombos} new version combinations`);

			if (isStable) break;

			iterations++;
		}

		if (!isStable) {
			return errorResponse(`Failed to find a stable configuration of mod versions after ${iterations} iterations`, {
				errorReason: "unstable-configuration",
			});
		}

		logDebug(`Found stable configuration of mod versions after ${iterations} iterations: ${JSON.stringify(currentState.versions)}`);

		// ---------------------- RESPONSE ----------------------

		// Now need to convert the current state into a set of "install", "change", and "uninstall" actions
		let actions = {};

		// For each mod version create "change" or "install" actions
		for (const modID in currentState.versions) {
			const version = currentState.versions[modID];
			if (actions[modID]) {
				return errorResponse(`Mod '${modID}' already has an action defined, cannot redefine it`, {
					errorModID: modID,
					errorReason: "action-duplicate",
				});
			}
			if (mods[modID]) {
				if (mods[modID].info.version === version) {
					logDebug(`Mod '${modID}' is already installed with version '${version}', no action needed`);
					continue;
				}
				actions[modID] = { type: "change", modID, version };
			} else {
				actions[modID] = { type: "install", modID, version };
			}
		}

		// For each mod marked for uninstall in the current state create "uninstall" actions
		for (const modID of currentState.markedForUninstall) {
			if (!actions[modID]) {
				actions[modID] = { type: "uninstall", modID };
			}
		}

		logDebug(`Calculated actions: ${JSON.stringify(actions)}`);
		return successResponse(`Found stable configuration of mod versions`, actions);
	}

	/** @returns {VerifyModsResponse} */
	static verify(/** @type {Mods} */ mods) {
		let issues = [];

		for (const modID in mods) {
			const mod = mods[modID];

			if (mod.isEnabled && mod.info.dependencies) {
				for (const depModID in mod.info.dependencies) {
					const dep = mod.info.dependencies[depModID];
					const depMod = mods[depModID];

					if (depMod === undefined) {
						issues.push({ type: "missing", modID, dependencyModID: depModID, dependency: dep });
						continue;
					}

					if (!depMod.isEnabled) {
						if (!FluxloaderSemver.isOptional(dep)) issues.push({ type: "disabled", modID, dependencyModID: depModID, dependency: dep });
						continue;
					}

					const depVersion = depMod.info.version;
					if (!FluxloaderSemver.doesVersionSatisfyDependency(depVersion, dep)) {
						issues.push({ type: "version", modID, dependencyModID: depModID, dependency: dep, dependencyVersion: depVersion });
						continue;
					}

					if (!FluxloaderSemver.doesVersionSatisfyDependency(fluxloaderVersion, mod.info.fluxloaderVersion)) {
						issues.push({ type: "fluxloader-version", modID, dependencyModID: "fluxloader", dependency: mod.info.fluxloaderVersion, dependencyVersion: fluxloaderVersion });
						continue;
					}
				}
			}
		}

		// Return shape expected by callers in electron.js
		return { success: issues.length === 0, issues };
	}
}

/**
 * @template T
 * @param {string} message
 * @param {T|null} [data=null]
 * @returns {FlResponse<T>}
 */
export function successResponse(message, data = null) {
	return { success: true, message, data };
}

/**
 * @template T
 * @param {string} message
 * @param {T|null} [data=null]
 * @param {boolean} [log=true]
 * @returns {FlResponse<T>}
 */
export function errorResponse(message, data = null, log = true) {
	if (log) logError(message);
	return { success: false, message, data };
}

/**
 * @template T
 * @param {FlResponse<T>} response
 * @returns {FlResponse<T>}
 */
export function responseAsError(response) {
	if (!response) throw new Error("Response is undefined");
	if (!response.success) throw new Error(response.message);
	return response;
}
