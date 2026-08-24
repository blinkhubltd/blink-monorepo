const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { FileStore } = require("metro-cache");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so changes in packages/* trigger a rebuild.
config.watchFolders = [...(config.watchFolders ?? []), monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Force singletons for packages that hold React context. Without this, Metro can
// bundle two copies depending on which workspace an import originates from, and
// the second copy's context is always empty — the "two Reacts" failure.
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
  "@clerk/clerk-expo": path.resolve(projectRoot, "node_modules/@clerk/clerk-expo"),
};

config.resolver.unstable_enablePackageExports = true;

// SVGs are imported as components (see types/svg.d.ts), so they move from asset
// to source extensions and go through the transformer.
config.transformer.babelTransformerPath = require.resolve(
  "react-native-svg-transformer",
);
config.resolver.assetExts = config.resolver.assetExts.filter((e) => e !== "svg");
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

config.cacheStores = [
  new FileStore({
    root: path.join(projectRoot, "node_modules", ".cache", "metro"),
  }),
];

module.exports = withNativeWind(config, { input: "./global.css" });
