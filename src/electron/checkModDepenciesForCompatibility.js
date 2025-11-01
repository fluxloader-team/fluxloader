import { FluxloaderSemver } from "../common.js";

export const checkModDepenciesForCompatibility = ({ modsToCheck }) => {
	try {
		// Extract all dependency edges
		const constraints = modsToCheck.reduce((acc, mod) => {
			for (const [dependentModID, version] of Object.entries(mod.info.dependencies)) {
				logDebug(`Found dependency for ${mod.info.modID}: ${dependentModID} @ ${version}`);
				const existingDependencies = acc.get(dependentModID) ?? [];
				acc.set(dependentModID, [
					...existingDependencies,
					{
						version,
						parent: mod.info.modID,
					},
				]);
			}

			return acc;
		}, new Map());

		// Check whether installed mods match
		const failedConstraints = [...constraints.entries()]
			.map(([dependentModID, neededVersions]) => {
				logDebug(`Checking constraints for ${dependentModID}`);
				const enabledVersionOfDependentMod = modsToCheck.find((m) => m.info.modID === dependentModID)?.info.version;

				const failingDependencies = neededVersions.filter(({ version }) => {
					const isMet = enabledVersionOfDependentMod && FluxloaderSemver.doesVersionSatisfyDependency(enabledVersionOfDependentMod, version);
					logDebug(`Did ${enabledVersionOfDependentMod} satisfy ${version}? ${isMet}`);
					return !isMet;
				});

				return {
					dependentModID,
					failingDependencies,
				};
			})
			.filter((checkedConstraints) => checkedConstraints.failingDependencies.length > 0);

		logDebug(`Found ${failedConstraints.length} failed constraints: ${JSON.stringify(failedConstraints)}`);
		return failedConstraints;
	} catch (e) {
		logError(e);
		return [];
	}
};
