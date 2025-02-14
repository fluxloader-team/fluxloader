const dotenv = require("dotenv");

dotenv.config();
const esbuild = require("esbuild");

const outFilePath =
  process.env.MODS_DIRECTORY + "/" + process.env.MOD_NAME + ".js";
esbuild
  .build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "neutral",
    format: "cjs",
    outfile: outFilePath,
    minify: false,
  })
  .catch(() => process.exit(1));
