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

      // Añadir reglas de ProGuard para LiveKit y WebRTC necesarias para R8 en release
      const proguardPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro',
      );
      if (fs.existsSync(proguardPath)) {
        const existing = fs.readFileSync(proguardPath, 'utf8');
        if (!existing.includes('livekit.org.jni_zero')) {
          const rules = `
# LiveKit & WebRTC ProGuard rules for R8
-keep class livekit.** { *; }
-dontwarn livekit.**
-dontwarn livekit.org.jni_zero.**
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**
`;
          fs.appendFileSync(proguardPath, rules, 'utf8');
        }
      }

      return modConfig;
    },
  ]);
};
