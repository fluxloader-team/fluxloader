import { apis } from "./apis";

const modinfo = {
  name: "ts-example-mod",
  version: "1.0.8",
  dependencies: [],
  modauthor: "stinkfire",
};

const patches = [
  {
    type: "process",
    func: (data: any) => {
      console.log("test-mod: process patch");
      return data;
    },
  },
  {
    type: "regex",
    pattern: 'description:"Unlocks Conveyor Belts and Launchers.",cost:50',
    replace: 'description:"Unlocks Conveyor Belts and Launchers.",cost:1',
    expectedMatches: 1,
  },
];

const api = apis;

async function onMenuLoaded() {
  console.log("test-mod: menu loaded");
  console.log("test-mod: fetching test/mod...");
  const res = await fetch("test/mod");
  const text = await res.text();
  console.log(`test-mod: test/mod response: ${text}`);
}

function onGameLoaded() {
  console.log(
    `test-mod: game loaded, game version: ${gameInstance.state.store.version}`
  );
}

export default { modinfo, patches, api, onMenuLoaded, onGameLoaded };
