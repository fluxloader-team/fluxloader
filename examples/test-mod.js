exports.modinfo = {
  name: "test-mod",
  version: "1.0.0",
  dependencies: [],
  modauthor: "tomster12",
};

function logASTNode(msg, node, limit = -1) {
  let displayString = escodegen.generate(node).replaceAll("\n", "").replaceAll("    ", "");
  if (limit != -1) displayString = displayString.length > limit ? displayString.substring(0, limit) + ` ... (${displayString.length - limit} more)` : displayString;
  console.log(`test-mod: ${msg}: ${displayString}`);
}

exports.patches = [
  {
    "type": "ast",
    action: (root) => {

      // Find an object that defines the following keys
      root.find("object", { keys: [ "jetpack", "gun", "shovel" ] }, (node) => {

        // Find the nested object called "gun"
        node.find("object", { name: "gun" }, (node) => {
          logASTNode("Gun object before change", node.astNode);

          // Update the nested property damage.level to 100
          node.change("update", { damage: { level: 100 } });

          // Manually search to the nested bullets.level and change to 100
          node.find("property", "bullets", (node) => {
            node.find("property", "level", (node) => {
              node.change("set", 100);
            });
          });

          // Search to speed then overwrite the object to level 100
          node.find("property", "speed", (node) => {
            node.change("set", { level: 100, availableLevel: 1 });
          }, expected = 1);

          logASTNode("Gun object after change", node.astNode);
        }, expected = 1);
      }, expected = 1);

      // Do a wide search for functions with these arguments
      // Looking for the following function: (lf = {})[l.Grabber] = function (r, i, s) { ... }
      root.find("function", { params: [ "r", "i", "s" ]}, (node) => {

        // Narrow it down with a raw match of the parent node
        if (node.doesMatchRaw(node.astNode._parent, {
          type: "AssignmentExpression", operator: "=",
          left: { property: { property: { name: "Grabber" } } },
        })) {
          logASTNode("(r,i,s) function before change", node.astNode, 150);
          
          // Add a log to the start of the function
          node.insert("start", `{
            console.log("Hello from inside this function :)");
            const maybeUseful = "some value";
          }`);

          logASTNode("(r,i,s) function after change", node.astNode, 150);
        }
      });

      // Find the p_ function by name
      root.find("function", { name: "p_" }, (node) => {
        logASTNode("p_(e) function before change", node.astNode, 150);

        // Wrap it to listen to the parameters
        node.wrap(`(f, e) => {
          console.log('test-mod: p_ called with ' + JSON.stringify(e));
          f(e);
        }`);

        logASTNode("p_(e) function after change", node.astNode, 150);
      }, expected = 1);
    
      // Find a specific function call
      root.find("call", { name: "m_", params: [
        { type: "object", values: { href: "https://discord.gg/HJNk5eMnmt" } },
        { type: "object", keys: [ "children"] }
      ] }, (node) => {

        logASTNode("specific m_ function call", node.astNode, 150);
      }, expected = 1);
    }
  }
];
