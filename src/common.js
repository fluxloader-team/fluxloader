export class EventBus {
	events = {};

	registerEvent(event) {
		log("debug", "", `Registering new event '${event}'`);
		if (this.events[event]) throw new Error(`Event already registered: ${event}`);
		this.events[event] = [];
	}

	trigger(event, data) {
		// When triggering an event generally if the source is inactive we error, but if the listener is inactive we ignore it
		log("debug", "", `Triggering event '${event}'`);
		if (!this.events[event]) throw new Error(`Cannot trigger non-existent event: ${event}`);
		for (const func of this.events[event]) func(data);
	}

	on(event, func) {
		log("debug", "", `Adding event listener for '${event}'`);
		if (!this.events[event]) throw new Error(`Cannot add listener to non-existent event: ${event}`);
		this.events[event].push(func);
	}

	reset() {
		log("debug", "", "Resetting EventBus");
		for (const event in this.events) {
			this.events[event] = [];
		}
	}

	logContents() {
		let outputString = "EventBus Content\n\n";

		outputString += `  |  Events (${Object.keys(this.events).length})\n`;
		for (const event in this.events) {
			outputString += `  |  |   ${event}: ${this.events[event].length} listeners\n`;
		}

		log("debug", "", outputString);
	}
}

export const ConfigSchemaHandler = {
	// Recursive function to load default config values as well as validate them
	validateConfig: function (config, schema) {
		if (typeof config !== "object") throw new Error("Invalid config provided");
		if (!this.validateSchema(schema)) throw new Error("Invalid schema provided");

		for (const [entry, entrySchema] of Object.entries(schema)) {
			if (!this.isLeafNode(entrySchema)) {
				if (config[entry] === undefined) config[entry] = {};
				this.validateConfig(config[entry], entrySchema);
			} else {
				// Use default value from schema if config value is undefined
				if (config[entry] === undefined) config[entry] = entrySchema.default;
				let result = this.validateConfigValue(config[entry], entrySchema);
				if (!result) throw new Error(`Config value '${JSON.stringify(config[entry])}' failed the check for '${entrySchema.type}' type`);
			}
		}
	},

	// Checks a specific value in the config against its corresponding schema leaf node
	// Errors are only thrown here if the validation cannot continue - ie. Fatal errors during validation
	// Returns true/false based on if the value is valid based on the schema given
	validateConfigValue: function (value, schemaLeaf) {
		if (!value) throw new Error("No value given");
		if (!schemaLeaf) throw new Error("No schema leaf given");
		if (!schemaLeaf.type) {
			if (!schemaLeaf.default) throw new Error("Schema type not provided and default value was missing");
			// Use type of default if no type is provided
			schemaLeaf.type = typeof schemaLeaf.default;
			globalThis.log("debug", "", `Schema type not provided, assuming type from default value: ${schemaLeaf.type}`);
		}
		switch (schemaLeaf.type) {
			case "boolean":
				return value === true || value === false;
			case "string":
				return typeof value === "string";
			case "number":
				if (typeof value !== "number") return false;
				if (schemaLeaf.min !== undefined && value < schemaLeaf.min) return false;
				if (schemaLeaf.max !== undefined && value > schemaLeaf.max) return false;
				// If step is given, checks if the value is close enough to the step value
				if (schemaLeaf.step !== undefined && value !== Math.round(value / schemaLeaf.step) * schemaLeaf.step) return false;
				return true;
			case "dropdown":
				if (!schemaLeaf.options) throw new Error("Schema type 'dropdown' requires an 'options' array");
				return schemaLeaf.options.includes(value);
		}
		throw new Error(`Unknown schema type: ${schemaLeaf.type}`);
	},

	validateSchema: function (schema) {
		// TODO: Proper schema format validation
		return true;
	},

	// Checks if any value of schemaNode is not an object
	// (since at least one value of a leaf node should be a non-object)
	isLeafNode: function (schemaNode) {
		if (typeof schemaNode !== "object") return false; // schemaNode should be an object...
		for (const value of Object.values(schemaNode)) {
			if (typeof value !== "object") return true;
		}
		return false;
	},
};
