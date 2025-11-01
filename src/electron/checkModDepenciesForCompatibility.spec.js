import { test, suite } from "node:test";
import semver from "semver";
import assert from "node:assert/strict";
import { checkModDepenciesForCompatibility } from "./checkModDepenciesForCompatibility.js";

globalThis.logDebug = () => {};
globalThis.logError = () => {};

globalThis.semver = semver;

suite("checkModDepenciesForCompatibility", () => {
	suite("without issues", () => {
		test("should return success when no mods are installed", () => {
			const modsToCheck = [
				// none
			];

			const failedConstraints = checkModDepenciesForCompatibility({ modsToCheck });
			assert.deepEqual(failedConstraints, [], "Found failed constraints when none were expected");
		});

		test("should return success when single mod with no dependencies are installed", () => {
			const modsToCheck = [
				{
					info: {
						modID: "portals",
						dependencies: {},
					},
				},
			];

			const failedConstraints = checkModDepenciesForCompatibility({ modsToCheck });
			assert.deepEqual(failedConstraints, [], "Found failed constraints when none were expected");
		});

		test("should return success when multiple mod with no dependencies are installed", () => {
			const modsToCheck = [
				{
					info: {
						modID: "portals",
						dependencies: {},
					},
				},
				{
					info: {
						modID: "cameras",
						dependencies: {},
					},
				},
			];

			const failedConstraints = checkModDepenciesForCompatibility({ modsToCheck });
			assert.deepEqual(failedConstraints, [], "Found failed constraints when none were expected");
		});

		test("should return success when mod direct dependencies are installed", () => {
			const modsToCheck = [
				{
					info: {
						modID: "portals",
						dependencies: {
							cameras: ">1.0.0",
						},
					},
				},
				{
					info: {
						modID: "cameras",
						version: "1.0.1",
						dependencies: {},
					},
				},
			];

			const failedConstraints = checkModDepenciesForCompatibility({ modsToCheck });
			assert.deepEqual(failedConstraints, [], "Found failed constraints when none were expected");
		});
	});

	suite("with issues", () => {
		test("should return failure when mod direct dependencies are not compatible versions", () => {
			const modsToCheck = [
				{
					info: {
						modID: "portals",
						version: "1.0.0",
						dependencies: {
							cameras: "^1.0.0",
						},
					},
				},
				{
					info: {
						modID: "cameras",
						version: "2.0.1",
						dependencies: {},
					},
				},
			];

			const expectedFailure = {
				dependentModID: "cameras",
				failingDependencies: [
					{
						parent: "portals",
						version: "^1.0.0",
					},
				],
			};

			const failedConstraints = checkModDepenciesForCompatibility({ modsToCheck });
			assert.deepEqual(failedConstraints, [expectedFailure], "Did not find expected failed constraints");
		});
		test("should return failure when mod descendent dependencies are not compatible versions", () => {
			const modsToCheck = [
				{
					info: {
						modID: "portals",
						version: "1.0.0",
						dependencies: {
							cameras: "^1.0.0",
						},
					},
				},
				{
					info: {
						modID: "cameras",
						version: "1.0.1",
						dependencies: {
							core: "~2.0.0",
						},
					},
				},
				{
					info: {
						modID: "core",
						version: "1.0.1",
						dependencies: {},
					},
				},
			];

			const expectedFailure = {
				dependentModID: "core",
				failingDependencies: [
					{
						parent: "cameras",
						version: "~2.0.0",
					},
				],
			};

			const failedConstraints = checkModDepenciesForCompatibility({ modsToCheck });
			assert.deepEqual(failedConstraints, [expectedFailure], "Did not find expected failed constraints");
		});
	});
});
