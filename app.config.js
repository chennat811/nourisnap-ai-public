import 'dotenv/config';

const isDev = process.env.APP_ENV === 'development';
const localIp = process.env.LOCAL_DEV_IP;

export default {
  expo: {
    name: "NouriSnap.ai",
    slug: "nourisnap",
    version: "0.1.0",
    // sdkVersion removed; Expo SDK is inferred from installed 'expo' package
    platforms: ["ios", "android"],
    orientation: "portrait",
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    // Custom URL scheme for deep linking in dev/standalone builds
    scheme: "nourisnap",
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission: "$(PRODUCT_NAME) needs camera access to capture meal photos and analyze nutrition information",
        }
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "$(PRODUCT_NAME) needs access to your photos to select meal images and analyze nutrition information",
          cameraPermission: "$(PRODUCT_NAME) needs camera access to capture meal photos and analyze nutrition information"
        }
      ]
    ],
    updates: {
      url: "https://u.expo.dev/726368fd-6d6a-4b08-bb6e-046917a08331"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.manzoni.nourisnap",
      buildNumber: "1",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        ...(isDev && localIp
          ? {
              NSAppTransportSecurity: {
                NSExceptionDomains: {
                  [localIp]: {
                    NSIncludesSubdomains: true,
                    NSExceptionAllowsInsecureHTTPLoads: true,
                  },
                },
              },
            }
          : {}),
      },
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
            NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
          },
        ],
        NSPrivacyCollectedDataTypes: [
          {
            NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeEmailAddress",
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: [
              "NSPrivacyCollectedDataTypePurposeAppFunctionality",
            ],
          },
          {
            NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePhotos",
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: [
              "NSPrivacyCollectedDataTypePurposeAppFunctionality",
            ],
          },
        ],
        NSPrivacyTracking: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      package: "com.manzoni.nourisnap",
      permissions: [
        "android.permission.CAMERA"
      ]
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    extra: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      supabaseFunctionUrl: process.env.SUPABASE_FUNCTION_URL,
      PRIVACY_URL: process.env.PRIVACY_URL || "https://manzoni-nutrition.vercel.app/privacy",
      dailyScanLimit: parseInt(process.env.DAILY_SCAN_LIMIT || "5", 10),
      eas: {
        projectId: "726368fd-6d6a-4b08-bb6e-046917a08331"
      }
    },
    runtimeVersion: {
      policy: "appVersion"
    },
    owner: "chennat811"
  }
};
