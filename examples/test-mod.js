exports.modinfo = {
  name: "test-mod",
  version: "1.0.0",
  loaderVersion: "1.4.0",
  dependencies: [{
    name: "test-mod-library",
    version: "1.0.0"
  }],
  modauthor: "tomster12",
};

exports.patches = [
  // Process the entire source code
  {
    "type": "process",
    func: (data) => {
      console.log("test-mod: process patch");
      return data;
    }
  },
  // Match a value using regex in the source and replace it
  {
    "type": "regex",
    "pattern": 'description:"Unlocks Conveyor Belts and Launchers.",cost:50',
    "replace": 'description:"Unlocks Conveyor Belts and Launchers.",cost:1',
    "expectedMatches": 1
  },
  // Simpler match to directly replace a string
  {
    "type": "replace",
    "from": '"Unlocks Gun. Damage type: ⛏️",cost:500',
    "to": '"Unlocks Gun. Damage type: ⛏️",cost:1',
    "expectedMatches": 1
  },
  // AST patch to modify the source code by traversing the AST
  {
    "type": "ast",
    "action": (root) => {
      // Find object using a nested property
      root.find({ type: "object", objValues: { gun: { speed: { level: 1 } } } }, (node) => {

        // Change a nested property
        node.change({ gun: { damage: { level: 100 } } }, updateProps = true);

        // Find an exact property on the object
        node.find({ type: "property", name: "gun" }, (node) => {
          node.find({ type: "property", name: "bullets" }, (node) => {
            node.find({ type: "property", name: "level" }, (node) => {

              // Change the value directly
              node.change(100);
            }, expectedCount = 1);
          });

          const displayString = escodegen.generate(node.currentASTNode).replaceAll("\n", "").replaceAll(" ", "");
          console.log(`test-mod: Found gun object: ${displayString}`);
        });
      }, expectedCount = 1);

      // Find the p_ function and wrap around it
      root.find({ type: "function", name: "p_" }, (node) => {
        const displayString = escodegen.generate(node.currentASTNode).replaceAll("\n", "").replaceAll(" ", "");
        console.log(`test-mod: Found p_ function definition: ${displayString}`);

        // Wrap around it and listen to the function arguments
        node.wrap((f, e) => {
          console.log(`test-mod: p_ called with ${JSON.stringify(e)}`);
          f(e);
        });
      }, expectedCount = 1);

      // Use the unsafe version to find a specific AST node
      root.findUnsafe({
        type: "AssignmentExpression", operator: "=",
        left: { type: "MemberExpression", property: { type: "Identifier", name: "style" } },
        right: { type: "Identifier", name: "i" }
      }, (node) => {
        console.log(`test-mod: Found specific node: ${JSON.stringify(node.currentASTNode)}`);
      });
    }
  }
];

exports.api = {
  // Standard API endpoint that returns text
  "test-mod/mod": {
    requiresBaseResponse: false,
    getFinalResponse: (_) => {
      let body = Buffer.from("Hello World!").toString("base64");
      return { body, contentType: "text/plain" };
    }
  },

  // Wider matching API endpoint that extracts the url
  "test-mod/log/": {
    requiresBaseResponse: false,
    getFinalResponse: ({ request }) => {
      let body = Buffer.from("Logged").toString("base64");
      console.log(`test-mod: log: ${request.url}`);
      return { body, contentType: "text/plain" };
    }
  }
}

exports.onMenuLoaded = async function () {
  console.log("test-mod: menu loaded");

  // Send requests to the 2 API endpoints
  const res = await fetch("test-mod/mod");
  const text = await res.text();
  console.log(`test-mod: test/mod response: ${text}`);
  await fetch("test-mod/log/hello-world");
};

exports.onGameLoaded = function () {
  // Access game version from the gameInstance
  console.log(`test-mod: game loaded, game version: ${gameInstance.state.store.version}`);
};
