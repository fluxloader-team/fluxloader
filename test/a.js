import fs from "fs/promises";
import vm from "vm";
import path from "path";
import url from "url";

// https://nodejs.org/api/vm.html#new-vmsourcetextmodulecode-options

async function executeIsolated(filePath) {
	const context = vm.createContext({
		console,
		shared: { foo: "bar" },
	});

	filePath = path.resolve(filePath);

	const code = await fs.readFile(filePath, "utf8");

	const module = new vm.SourceTextModule(code, {
		context,
		identifier: url.pathToFileURL(filePath).href,
		initializeImportMeta: (meta) => {
			meta.url = url.pathToFileURL(filePath).href;
		},
	});

	await module.link(async (specifier, referencingModule) => {
		console.log("Linking:", specifier, "from", referencingModule.identifier);
        // Do nothing for now
	});

	await module.evaluate();

	console.log("Shared context:", context.shared);

	for (const key of Object.keys(context)) {
		context[key] = undefined;
	}
}

executeIsolated("./b.js");


