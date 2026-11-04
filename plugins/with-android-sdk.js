const fs = require('fs');
const os = require('os');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

module.exports = function withAndroidSdk(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const sdkDir =
        process.env.ANDROID_HOME ||
        process.env.ANDROID_SDK_ROOT ||
        path.join(os.homedir(), 'Library', 'Android', 'sdk');

      if (fs.existsSync(sdkDir)) {
        const localPropsPath = path.join(
          modConfig.modRequest.platformProjectRoot,
          'local.properties',
        );
        const escaped = sdkDir.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
        fs.writeFileSync(localPropsPath, `sdk.dir=${escaped}\n`, 'utf8');
      }

      return modConfig;
    },
  ]);
};
