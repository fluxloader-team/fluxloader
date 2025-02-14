var typeMappings = new Map();

var generateTypeDefinition = (instance, typeName = "GeneratedType") => {
  if (typeMappings.has(typeName)) {
    return typeMappings.get(typeName);
  }

  const proto = Object.getPrototypeOf(instance);
  const instanceProps = Object.getOwnPropertyNames(instance);
  const protoProps = Object.getOwnPropertyNames(proto).filter(
    (prop) => prop !== "constructor"
  );

  let typeDef = `type ${typeName} = {\n`;

  const getType = (value) => {
    if (Array.isArray(value)) return "any[]"; // More complex checks can be added
    if (value === null) return "null";
    if (typeof value === "object") return generateNestedTypeDefinition(value);
    if (typeof value === "function") return "(...args: unknown[]) => unknown";
    return typeof value;
  };

  const generateNestedTypeDefinition = (obj, nestedTypeName = "NestedType") => {
    if (typeMappings.has(nestedTypeName)) {
      return typeMappings.get(nestedTypeName);
    }

    let nestedTypeDef = `{\n`;
    const nestedProps = Object.getOwnPropertyNames(obj);
    nestedProps.forEach((prop) => {
      nestedTypeDef += `  ${prop}: ${getType(obj[prop])},\n`;
    });
    nestedTypeDef += "}\n";

    typeMappings.set(nestedTypeName, nestedTypeDef);
    return nestedTypeDef;
  };

  // Handle instance properties (likely fields)
  instanceProps.forEach((prop) => {
    const value = instance[prop];
    typeDef += `  ${prop}: ${getType(value)},\n`;
  });

  // Handle prototype properties (likely methods)
  protoProps.forEach((prop) => {
    if (typeof proto[prop] === "function") {
      typeDef += `  ${prop}: (...args: any[]) => any;\n`;
    }
  });

  typeDef += "};";
  typeMappings.set(typeName, typeDef);
  console.log(typeDef);
  return typeDef;
};

generateTypeDefinition(gameInstance, "gameInstance");
