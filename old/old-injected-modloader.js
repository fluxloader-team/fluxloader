
globalThis.setupModdedSubtitle = function (spawnSolid) {
	const interval = setInterval(loop, 60);

	function loop() {
		if (globalThis.moddedSubtitleActivePositions && globalThis.moddedSubtitleActivePositions.length == 0) return clearInterval(interval);

		const title = [
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
			[1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
			[1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1],
			[1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1],
			[1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
		];

		function tryGet(x, y) {
			if (x < 0 || y < 0 || y >= title.length || x >= title[y].length) return false;
			return title[y][x];
		}

		const origin = {
			x: 392 + 80,
			y: 404 + 32,
		};

		const particle = 14; // Fluxite
		if (!globalThis.moddedSubtitleActivePositions || !globalThis.moddedSubtitleInvalidPositions) {
			globalThis.moddedSubtitleActivePositions = [
				{
					x: 0,
					y: 0,
				},
			];
			globalThis.moddedSubtitleInvalidPositions = [];
		}

		// Allow jumping across gaps to designated coordinates
		const jumps = {
			"3, 3": { x: 4, y: 4 },
			"5, 4": { x: 6, y: 3 },
			"9, 5": { x: 11, y: 5 },
			"12, 5": { x: 13, y: 4 },
			"12, 9": { x: 13, y: 10 },
			"16, 4": { x: 17, y: 5 },
			"16, 10": { x: 17, y: 9 },
			"18, 9": { x: 20, y: 9 },
			"21, 5": { x: 22, y: 4 },
			"27, 8": { x: 29, y: 8 },
			"30, 5": { x: 31, y: 4 },
			"36, 5": { x: 38, y: 5 },
			"39, 5": { x: 40, y: 4 },
			"39, 9": { x: 40, y: 10 },
			"45, 9": { x: 47, y: 9 },
			"48, 5": { x: 49, y: 4 },
		};

		const offsets = [
			[-1, 0],
			[0, 1],
			[1, 0],
			[0, -1],
		];

		for (const position of [...globalThis.moddedSubtitleActivePositions]) {
			spawnSolid(gameInstance.state, origin.x + position.x, origin.y + position.y, particle);

			const posName = `${position.x}, ${position.y}`;
			const mappedNames = globalThis.moddedSubtitleActivePositions.map((pos) => `${pos.x}, ${pos.y}`);
			globalThis.moddedSubtitleInvalidPositions.push(posName);
			globalThis.moddedSubtitleActivePositions.splice(mappedNames.indexOf(posName), 1);

			if (jumps[posName]) {
				globalThis.moddedSubtitleActivePositions.push(jumps[posName]);
			}

			for (const offset of offsets) {
				const newPos = { x: position.x + offset[0], y: position.y + offset[1] };
				const newPosName = `${newPos.x}, ${newPos.y}`;
				const mappedNames = globalThis.moddedSubtitleActivePositions.map((pos) => `${pos.x}, ${pos.y}`);

				// Will return truthy if particle should be placed, falsey if not
				if (tryGet(newPos.x, newPos.y) && !globalThis.moddedSubtitleInvalidPositions.includes(newPosName) && !mappedNames.includes(newPosName)) {
					globalThis.moddedSubtitleActivePositions.push(newPos);
				}
			}
		}
	}
};
