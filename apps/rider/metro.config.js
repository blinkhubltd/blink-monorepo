const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { FileStore } = require("metro-cache");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

/**
 * Force singleton resolution for packages that carry React context, so Metro
 * never bundles two copies regardless of where the import originates.
 *
 * `.npmrc` sets node-linker=hoisted, so in practice every one of these lands in
 * the monorepo root and apps/rider/node_modules does not exist at all. Resolve
 * each one instead of hardcoding a path: pointing at a directory that isn't
 * there makes Metro fail to resolve the module entirely.
 */
const singletons = ["react", "react-native", "nativewind", "react-native-worklets"];

config.resolver.extraNodeModules = singletons.reduce((acc, name) => {
  const candidates = [
    path.resolve(projectRoot, "node_modules", name),
    path.resolve(monorepoRoot, "node_modules", name),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) acc[name] = found;
  return acc;
}, {});

config.resolver.unstable_enablePackageExports = true;

config.cacheStores = [
  new FileStore({
    root: path.join(projectRoot, "node_modules", ".cache", "metro"),
  }),
];

module.exports = withNativeWind(config, { input: "./global.css" });
