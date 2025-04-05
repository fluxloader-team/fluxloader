export class EventBus {
	events = {};

	registerEvent(event) {
		logDebug(`Registering new event '${event}'`);
		if (this.events[event]) throw new Error(`Event already registered: ${event}`);
		this.events[event] = []
	}

	trigger(event, data) {
		// When triggering an event generally if the source is inactive we error, but if the listener is inactive we ignore it
		logDebug(`Triggering event '${event}'`);
		if (!this.events[event]) throw new Error(`Cannot trigger non-existent event: ${event}`);
		for (const func of this.events[event]) func(data);
	}

	on(event, func) {
		logDebug(`Adding event listener for '${event}'`);
		if (!this.events[event]) throw new Error(`Cannot add listener to non-existent event: ${event}`);
		this.events[event].push(func);
	}

	reset() {
		logDebug("Resetting EventBus");
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

		logDebug(outputString);
	}
}
