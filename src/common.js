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

export class SchemaValidation {
	// Errors if the schema is invalid
	// Return true / false if the target is valid

	static validate(target, schema) {
		// Recursively validates the target object against the schema object
		if (typeof schema !== "object") throw new Error("Schema must be an object");
		if (typeof target !== "object") {
			log("warn", "", `Target Invalid: Target is not an object`);
			return false;
		}

		// Ensure every key in target is also in the schema
		for (const configKey of Object.keys(target)) {
			if (schema[configKey] === undefined) {
				log("warn", "", `Target Invalid: Key '${configKey}' is not in the schema`);
				return false;
			}
		}

		for (const [schemaKey, schemaValue] of Object.entries(schema)) {
			// The schema value must be an object
			if (typeof schemaValue !== "object") throw new Error(`Schema invalid: Key '${schemaKey}' is not an object`);

			// Validate the target value against the schema leaf node
			if (this.isSchemaLeafNode(schemaValue)) {
				if (!Object.hasOwn(target, schemaKey)) {
					if (!Object.hasOwn(schemaValue, "default")) {
						log("warn", "", `Target Invalid: Key '${schemaKey}' is required by the schema`);
						return false;
					}
					target[schemaKey] = schemaValue.default;
				}
				if (!this.validateValue(target[schemaKey], schemaValue)) {
					log("warn", "", `Target Invalid: Key '${schemaKey}' is not valid`);
					return false;
				}
			}

			// Otherwise recurse into the target and schema object
			else {
				if (!Object.hasOwn(target, schemaKey)) target[schemaKey] = {};
				if (!this.validate(target[schemaKey], schemaValue)) return false;
			}
		}

		return true;
	}

	static validateValue(targetValue, schemaLeafValue) {
		switch (schemaLeafValue.type) {
			case "boolean":
				return targetValue === true || targetValue === false;

			case "string":
				return typeof targetValue === "string";

			case "number":
				if (typeof targetValue !== "number") return false;
				if (Object.hasOwn(schemaLeafValue, "min") && targetValue < schemaLeafValue.min) return false;
				if (Object.hasOwn(schemaLeafValue, "max") && targetValue > schemaLeafValue.max) return false;
				// If step is given, checks if the value is close enough to the step value
				if (Object.hasOwn(schemaLeafValue, "step") && targetValue !== Math.round(targetValue / schemaLeafValue.step) * schemaLeafValue.step) return false;
				return true;

			case "dropdown":
				if (!schemaLeafValue.options) throw new Error("Schema invalid: Type 'dropdown' requires an 'options' array");
				return schemaLeafValue.options.includes(targetValue);

			case "object":
				return typeof targetValue === "object";

			case "array":
				return Array.isArray(targetValue);

			default:
				throw new Error(`Schema invalid: Unknown schema type '${schemaLeafValue.type}'`);
		}
	}

	static isSchemaLeafNode(schemaValue) {
		// This should be caught in the validate function but just in case we check here too
		if (typeof schemaValue !== "object") throw new Error("Schema invalid: Schema value is not an object");

		// If the schema value has "type" defined it is a leaf node
		const hasType = Object.hasOwn(schemaValue, "type");
		if (hasType) return true;

		// If it does not have "type" defined it must only contain other objects or be empty
		const anyValues = Object.values(schemaValue).some((value) => typeof value !== "object");
		if (anyValues) throw new Error(`Schema invalid: Schema nodes must either have "type" or only values that are objects`);
		return false;
	}
}
