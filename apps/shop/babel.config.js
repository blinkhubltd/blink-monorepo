module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }]],
    // reanimated 4 moved the worklets transform into its own package;
    // react-native-reanimated/plugin is now just a re-export of this one.
    // babel-preset-expo does not add it automatically.
    plugins: ["react-native-worklets/plugin"],
  };
};
