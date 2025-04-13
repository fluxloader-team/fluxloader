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

export class ConfigTemplateHandler {
	// Use a template and use the default value to guess the type if not provided
	guessTypes(template) {}

	// Guesses the type of a single leaf node of a template
	guessType(leafNode) {}

	// Generates default types as well as validating values
	validateConfig(config, template) {
		if (typeof config !== "object" || typeof template !== "object") return false;

		for (const key of Object.keys(template)) {
			if (typeof template[key] === "object") {
				if (!this.validateConfig(config[key], template[key])) return false;
			} else if (typeof config[key] !== typeof template[key]) {
				return false;
			}
		}

		return true;
	}

	// Find all leaf nodes from a template
	getLeaves(template) {}
}
