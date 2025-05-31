import fs from "fs/promises";
import vm from "vm";
import path from "path";
import url from "url";

// https://nodejs.org/api/vm.html#new-vmsourcetextmodulecode-options

async function executeIsolated(context, filePath) {
	const code = await fs.readFile(filePath, "utf8");
	const identifier = url.pathToFileURL(filePath).href;
	const module = new vm.SourceTextModule(code, { context, identifier });

	await module.link(async (specifier, referencingModule) => {
		console.log(`Linking currently unsupported (specifier: ${specifier}, referencingModule: ${referencingModule.identifier})`);
		return null;
	});

	await module.evaluate();
}

const context = vm.createContext({
	console,
	shared: { foo: "bar" },
});

let filePath = path.resolve("./b.js");

await executeIsolated(context, filePath);
await executeIsolated(context, filePath);

for (const key of Object.keys(context)) {
	context[key] = undefined;
}
