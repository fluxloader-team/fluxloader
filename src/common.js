export class EventBus {
	events = {};
	participants = {};

	setParticipantActive(participant, isActive) {
		// This is for enabling / disabling sources / listeners
		// Primarily for enabling / disabling mods
		if (!this.participants[participant]) {
			this.participants[participant] = { isActive };
		} else {
			this.participants[participant].isActive = isActive;
		}
	}

	registerEvent(source, event) {
		logDebug(`Registering new event from source: ${source} -> ${event}`);
		if (this.events[event]) {
			throw new Error(`Event already registered: ${event}`);
		}
		if (!this.participants[source]) this.participants[source] = { isActive: true };
		this.events[event] = { source, listeners: {} };
	}

	trigger(event, ...args) {
		// When triggering an event generally if the source is inactive we error, but if the listener is inactive we ignore it
		logDebug(`Triggering event: ${event}`);
		if (!this.events[event]) {
			throw new Error(`Cannot trigger non-existent event: ${event}`);
		}
		if (!this.participants[this.events[event].source]) {
			throw new Error(`Event source participant not active: ${this.events[event].source}`);
		}
		for (const listener in this.events[event].listeners) {
			if (this.participants[listener].isActive) {
				for (const func of this.events[event].listeners[listener]) {
					func(...args);
				}
			}
		}
	}

	triggerFor(event, listener, ...args) {
		// When directly triggering an event for a listener it is an error to specify inactive source / listeners
		logDebug(`Triggering event for: ${event} -> ${listener}`);
		if (!this.events[event]) {
			throw new Error(`Cannot trigger non-existent event: ${event}`);
		}
		if (!this.participants[this.events[event].source].isActive) {
			throw new Error(`Event source participant not active: ${this.events[event].source}`);
		}
		if (!this.events[event].listeners[listener]) {
			throw new Error(`Event listener not found: ${listener}`);
		}
		if (!this.participants[listener].isActive) {
			throw new Error(`Event listener participant not active: ${listener}`);
		}
		for (const func of this.events[event].listeners[listener]) {
			func(...args);
		}
	}

	on(listener, event, func) {
		// When adding a listener we need to ensure the event source is active
		logDebug(`Adding event listener: ${event} -> ${listener}`);
		if (!this.events[event]) {
			throw new Error(`Cannot add listener to non-existent event: ${event}`);
		}
		if (!this.participants[this.events[event].source]) {
			logWarn(`Event source participant not active: ${this.events[event].source}`);
		}
		if (!this.events[event].listeners[listener]) {
			this.events[event].listeners[listener] = [];
		}
		if (!this.participants[listener]) this.participants[listener] = { isActive: true };
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

	removeParticipant(participant) {
		logDebug(`Removing event participant: ${participant}`);
		for (const event in this.events) {
			if (this.events[event].source === participant) delete this.events[event];
			else if (this.events[event].listeners[participant]) delete this.events[event].listeners[participant];
		}
		delete this.participants[participant];
	}

	logContents() {
		let outputString = "ModloaderEvent Content\n\n";

		outputString += `  |  Participants (${Object.keys(this.participants).length})\n`;
		for (const participant in this.participants) {
			outputString += `  |  |  ${participant}: ${this.participants[participant].isActive ? "ACTIVE" : "INACTIVE"}\n`;
		}

		outputString += `  |  \n`;
		outputString += `  |  Events (${Object.keys(this.events).length})\n`;
		for (const event in this.events) {
			outputString += `  |  |   ${!this.participants[this.events[event].source].isActive ? "(OFF) " : ""} ${this.events[event].source} -> ${event} [ `;
			outputString += Object.keys(this.events[event].listeners)
				.map((l) => `${!this.participants[l].isActive ? "(OFF) " : ""}${l}:${this.events[event].listeners[l].length}`)
				.join(", ");
			outputString += ` ]\n`;
		}

		logDebug(outputString);
	}
}

