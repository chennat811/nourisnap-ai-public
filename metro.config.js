const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = false;

// Speed up startup by deferring module execution until needed
config.transformer = {
  ...config.transformer,
  experimentalImportSupport: false,
  inlineRequires: true,
};

module.exports = config;
