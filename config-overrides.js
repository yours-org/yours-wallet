const webpack = require("webpack");

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
    process: require.resolve("process/"),
  };

  // Define plugins
  config.plugins = (config.plugins || []).concat([
    new webpack.ProvidePlugin({
      process: "process/browser",
      Buffer: ["buffer", "Buffer"],
    }),
  ]);

  return config;
};
