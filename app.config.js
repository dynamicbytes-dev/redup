// Extiende app.json. En EAS Build, GOOGLE_SERVICES_JSON es una variable de archivo
// (google-services.json no se versiona). En local se usa ./google-services.json.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
