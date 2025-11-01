import { describe, it, suite, test } from "node:test";
import assert from "node:assert/strict";
import { ModsManager } from "./electron.js";

suite("checkModDepenciesForCompatibility", () => {
	suite("without issues", () => {
		it("should return success when no mods are installed", () => {
			const modsManager = new ModsManager();

			modsManager.installedMods = {
				// none
			};

			const failedConstraints = modsManager.checkModDepenciesForCompatibility();
			assert.deepEqual(failedConstraints, [], "Found failed constraints when none were expected");
		});

		it("should return success when single mod with no dependencies are installed", () => {
			const modsManager = new ModsManager();

			modsManager.loadOrder = ["portals"];
			modsManager.installedMods = {
				portals: {
					info: {
						modID: "portals",
						dependencies: {},
					},
				},
			};

			const failedConstraints = modsManager.checkModDepenciesForCompatibility();
			assert.deepEqual(failedConstraints, [], "Found failed constraints when none were expected");
		});

		it("should return success when multiple mod with no dependencies are installed", () => {
			const modsManager = new ModsManager();

			modsManager.loadOrder = ["portals", "cameras"];
			modsManager.installedMods = {
				portals: {
					info: {
						modID: "portals",
						dependencies: {},
					},
				},
				cameras: {
					info: {
						modID: "cameras",
						dependencies: {},
					},
				},
			};

			const failedConstraints = modsManager.checkModDepenciesForCompatibility();
			assert.deepEqual(failedConstraints, [], "Found failed constraints when none were expected");
		});

		it("should return success when mod direct dependencies are installed", () => {
			const modsManager = new ModsManager();

			modsManager.loadOrder = ["portals", "cameras"];
			modsManager.installedMods = {
				portals: {
					info: {
						modID: "portals",
						dependencies: {
							cameras: ">1.0.0",
						},
					},
				},
				cameras: {
					info: {
						modID: "cameras",
						version: "1.0.1",
						dependencies: {},
					},
				},
			};

			const failedConstraints = modsManager.checkModDepenciesForCompatibility();
			assert.deepEqual(failedConstraints, [], "Found failed constraints when none were expected");
		});
	});

	suite("with issues", () => {
		it("should return failure when mod direct dependencies are not compatible versions", () => {
			const modsManager = new ModsManager();

			modsManager.loadOrder = ["portals", "cameras"];
			modsManager.installedMods = {
				portals: {
					info: {
						modID: "portals",
						version: "1.0.0",
						dependencies: {
							cameras: "^1.0.0",
						},
					},
				},
				cameras: {
					info: {
						modID: "cameras",
						version: "2.0.1",
						dependencies: {},
					},
				},
			};

			const expectedFailure = {
				dependentModID: "cameras",
				failingDependencies: [
					{
						parent: "portals",
						version: "^1.0.0",
					},
				],
			};

			const failedConstraints = modsManager.checkModDepenciesForCompatibility();
			assert.deepEqual(failedConstraints, [expectedFailure], "Did not find expected failed constraints");
		});
		it("should return failure when mod descendent dependencies are not compatible versions", () => {
			const modsManager = new ModsManager();

			modsManager.loadOrder = ["portals", "cameras", "core"];
			modsManager.installedMods = {
				portals: {
					info: {
						modID: "portals",
						version: "1.0.0",
						dependencies: {
							cameras: "^1.0.0",
						},
					},
				},
				cameras: {
					info: {
						modID: "cameras",
						version: "1.0.1",
						dependencies: {
							core: "~2.0.0",
						},
					},
				},
				core: {
					info: {
						modID: "core",
						version: "1.0.1",
						dependencies: {},
					},
				},
			};

			const expectedFailure = {
				dependentModID: "core",
				failingDependencies: [
					{
						parent: "cameras",
						version: "~2.0.0",
					},
				],
			};

			const failedConstraints = modsManager.checkModDepenciesForCompatibility();
			assert.deepEqual(failedConstraints, [expectedFailure], "Did not find expected failed constraints");
		});
	});
});
