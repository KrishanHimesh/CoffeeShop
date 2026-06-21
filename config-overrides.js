// config-overrides.js
// Suppresses "Failed to parse source map" warnings from node_modules like @zxing
// Uses react-app-rewired to patch webpack config without ejecting

module.exports = function override(config) {
  // Tell webpack to ignore source maps from node_modules entirely
  config.module.rules = config.module.rules.map(rule => {
    if (rule.enforce === 'pre' && rule.use) {
      const uses = Array.isArray(rule.use) ? rule.use : [rule.use];
      const hasSourceMapLoader = uses.some(u =>
        (typeof u === 'string' && u.includes('source-map-loader')) ||
        (u && u.loader && u.loader.includes('source-map-loader'))
      );
      if (hasSourceMapLoader) {
        return {
          ...rule,
          exclude: /node_modules/,
        };
      }
    }
    return rule;
  });
  return config;
};
