const webpack = require("webpack");
const WebpackPluginReplaceNpm = require("replace-module-webpack-plugin");

module.exports = function override(config, env) {
  // Ensure crypto-browserify is used as a fallback for the crypto module
  config.resolve.fallback = {
    ...config.resolve.fallback,
    crypto: require.resolve("crypto-browserify"),
    util: require.resolve("util"),
    assert: require.resolve("assert"),
    url: require.resolve("url"),
    stream: require.resolve("stream-browserify"),
    buffer: require.resolve("buffer"),
    process: require.resolve("process"),
    fs: false,
    os: false,
  };

  // Define plugins
  config.plugins = [
    ...config.plugins,
    new WebpackPluginReplaceNpm({
      rules: [
        {
          originModule: "path",
          replaceModule: "path-browserify",
        },
        {
          originModule: "bsv-wasm",
          replaceModule: "bsv-wasm-web",
        },
      ],
    }),
    new webpack.ProvidePlugin({
      process: "process/browser.js",
      Buffer: ["buffer", "Buffer"],
    }),
  ];

  return config;
};
