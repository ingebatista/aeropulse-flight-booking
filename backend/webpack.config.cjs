const { join } = require('node:path');
const nodeExternals = require('webpack-node-externals');

module.exports = (config) => ({
  ...config,
  externals: [
    nodeExternals({
      additionalModuleDirs: [join(__dirname, '../node_modules')],
    }),
  ],
});
