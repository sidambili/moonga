import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.oncident.app",
  appName: "Oncident",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
    cleartext: true,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
