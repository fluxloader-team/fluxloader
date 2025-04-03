export class EventBus {
	events = {};

	registerEvent(source, event) {
		logDebug(`Registering new event from source: ${source} -> ${event}`);
		if (this.events[event]) {
			throw new Error(`Event already registered: ${event}`);
		}
		this.events[event] = { source, listeners: {} };
	}

	trigger(event, ...args) {
		// When triggering an event generally if the source is inactive we error, but if the listener is inactive we ignore it
		logDebug(`Triggering event: ${event}`);
		if (!this.events[event]) {
			throw new Error(`Cannot trigger non-existent event: ${event}`);
		}
		for (const listener in this.events[event].listeners) {
			for (const func of this.events[event].listeners[listener]) {
				func(...args);
			}
		}
	}

	triggerFor(event, listener, ...args) {
		logDebug(`Triggering event for: ${event} -> ${listener}`);
		if (!this.events[event]) {
			throw new Error(`Cannot trigger non-existent event: ${event}`);
		}
		if (!this.events[event].listeners[listener]) {
			return;
		}
		for (const func of this.events[event].listeners[listener]) {
			func(...args);
		}
	}

	on(listener, event, func) {
		logDebug(`Adding event listener: ${event} -> ${listener}`);
		if (!this.events[event]) {
			throw new Error(`Cannot add listener to non-existent event: ${event}`);
		}
		if (!this.events[event].listeners[listener]) {
			this.events[event].listeners[listener] = [];
		}
		this.events[event].listeners[listener].push(func);
	}

	off(listener, event) {
		// When removing a listener we need to ensure the event source is active
		logDebug(`Removing event listener: ${event} -> ${listener}`);
		if (!this.events[event]) {
			throw new Error(`Cannot remove listener from non-existent event: ${event}`);
		}
		if (!this.events[event].listeners[listener]) {
			throw new Error(`Event listener not found: ${listener}`);
		}
		this.events[event].listeners[listener] = [];
	}

	offAll(participant) {
		logDebug(`Removing participant from event bus: ${participant}`);
		for (const event in this.events) {
			if (this.events[event].source === participant) {
				delete this.events[event];
				continue;
			}
			if (this.events[event].listeners[participant]) {
				delete this.events[event].listeners[participant];
			}
		}
	}

	logContents() {
		let outputString = "EventBus Content\n\n";

		outputString += `  |  Events (${Object.keys(this.events).length})\n`;
		for (const event in this.events) {
			outputString += `  |  |   ${this.events[event].source} -> ${event} [ `;
			outputString += Object.keys(this.events[event].listeners)
				.map((l) => `${l}:${this.events[event].listeners[l].length}`)
				.join(", ");
			outputString += ` ]\n`;
		}

		logDebug(outputString);
	}
}
