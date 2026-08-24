module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // The `@/...` alias used throughout the app source. tsconfig paths cover
      // typechecking; this covers the runtime resolution.
      [
        "module-resolver",
        {
          root: ["./"],
          alias: { "@": "./", "tailwind.config": "./tailwind.config.js" },
        },
      ],
      "react-native-worklets/plugin",
    ],
  };
};
