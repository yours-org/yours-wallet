const webpack = require('webpack');
const WebpackPluginReplaceNpm = require('replace-module-webpack-plugin');
const path = require('path');

module.exports = function override(config) {
  config.resolve.extensions.push('.ts', '.tsx');

  config.module.rules.push({
    test: /\.tsx?$/,
    use: 'ts-loader',
    exclude: /node_modules/,
  });

  config.resolve.fallback = {
    ...config.resolve.fallback,
    crypto: require.resolve('crypto-browserify'),
    util: require.resolve('util'),
    assert: require.resolve('assert'),
    url: require.resolve('url'),
    stream: require.resolve('stream-browserify'),
    buffer: require.resolve('buffer'),
    process: require.resolve('process'),
    fs: false,
    os: false,
  };

  config.plugins = [
    ...config.plugins,
    new WebpackPluginReplaceNpm({
      rules: [
        {
          originModule: 'path',
          replaceModule: 'path-browserify',
        },
        // {
        //   originModule: 'bsv-wasm',
        //   replaceModule: 'bsv-wasm-web',
        // },
      ],
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser.js',
      Buffer: ['buffer', 'Buffer'],
    }),
  ];

  // Ensure the default entry point is included
  config.entry = {
    main: path.resolve(__dirname, 'src/index.tsx'),
    background: path.resolve(__dirname, 'src/background.ts'),
    content: path.resolve(__dirname, 'src/content.ts'),
    inject: path.resolve(__dirname, 'src/inject.ts'),
  };

  // Ensure output configuration includes the background script
  config.output = {
    ...config.output,
    filename: '[name].js',
    path: path.resolve(__dirname, 'build'),
  };

  return config;
};
