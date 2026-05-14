const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// phosphor-react-native uses the modern "exports" field in its package.json,
// which Metro's resolver only honors when this flag is on.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;