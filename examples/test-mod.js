exports.modinfo = {
  name: "test-mod",
  version: "1.0.0",
  dependencies: [],
  modauthor: "tomster12",
};

exports.patches = [
  {
    type: "process",
    func: (data) => {
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

exports.api = {
  "test/mod": {
    requiresBaseResponse: false,
    getFinalResponse: async ({
      interceptionId,
      request,
      responseHeaders,
      response,
      resourceType,
    }) => {
      let bodyData = "Hello World!";
      let contentType = "text/plain";
      return { body: bodyData, contentType };
    },
  },
};

exports.onMenuLoaded = async function () {
  console.log("test-mod: menu loaded");
  console.log("test-mod: fetching test/mod...");
  const res = await fetch("test/mod");
  const text = await res.text();
  console.log(`test-mod: test/mod response: ${text}`);
};

exports.onGameLoaded = function () {
  console.log(
    `test-mod: game loaded, game version: ${gameInstance.state.store.version}`
  );
};
