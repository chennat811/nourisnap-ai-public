import React, { useEffect, useState } from "react";
import { useFonts } from 'expo-font';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from '@expo-google-fonts/nunito';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import {
  createStackNavigator,
  StackNavigationProp,
  CardStyleInterpolators,
} from "@react-navigation/stack";
import { RootStackParamList } from "./src/types/navigation";
import * as Linking from "expo-linking";
import { supabase } from "./src/lib/supabase";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import MealCaptureScreen from "./src/screens/MealCaptureScreen";
import ResultsScreen from "./src/screens/ResultsScreen";
import SignInScreen from "./src/screens/SignInScreen";
import SignUpScreen from "./src/screens/SignUpScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import AnalysisLoadingScreen from "./src/screens/AnalysisLoadingScreen";
import BreakdownConfirmScreen from "./src/screens/BreakdownConfirmScreen";
import HistoryDatesScreen from "./src/screens/HistoryDatesScreen";
import HistoryDayScreen from "./src/screens/HistoryDayScreen";
import HistoryDetailScreen from "./src/screens/HistoryDetailScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import PasswordUpdateScreen from "./src/screens/PasswordUpdateScreen";
import UserQuestionnaireScreen from "./src/screens/UserQuestionnaireScreen";
import GeneralFeedbackScreen from "./src/screens/GeneralFeedbackScreen";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { LanguageProvider } from "./src/context/LanguageContext";
import { ThemeProvider } from "./src/context/ThemeContext";
import { Alert, View, Text, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { getUserSettingsCached, addPendingPhotoLog } from "./src/services/api";
import NetInfo from "@react-native-community/netinfo";
import './src/i18n/config';

const Stack = createStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
let pendingRoute: "PasswordUpdate" | null = null;
let blockAuthedOnce = false;
let lastHandledDeepLinkUrl: string | null = null;

const linking = {
  prefixes: [Linking.createURL("/"), "exp+nourisnap://", "nourisnap://"],
  config: {
    screens: {
      Dashboard: "dashboard",
      SignIn: "signin",
      SignUp: "signup",
      Onboarding: "onboarding",
      MealCapture: "mealcapture",
      Results: "results",
      Profile: "profile",
      Settings: "settings",
      HistoryDates: "history-dates",
      HistoryDay: "history-day",
      HistoryDetail: "history-detail",
      PasswordUpdate: "passwordupdate",
      ResetPassword: "reset-password",
      UserQuestionnaire: "user-questionnaire",
    },
  },
};

async function importLocalPendingPhotosIfAny(userId: string): Promise<number> {
  const key = "manual_pending_photos";
  const raw = await AsyncStorage.getItem(key);
  const arr: Array<{
    imageUri: string;
    mealType?: string | null;
    recordedDateISO?: string | null;
  }> = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  const remaining: typeof arr = [];
  let imported = 0;
  for (const item of arr) {
    try {
      await addPendingPhotoLog({
        user_id: userId,
        image_url: item.imageUri,
        meal_type: (item.mealType as any) || undefined,
        recordedDateISO: item.recordedDateISO || undefined,
      });
      imported += 1;
    } catch (e) {
      remaining.push(item);
    }
  }
  await AsyncStorage.setItem(key, JSON.stringify(remaining));
  return imported;
}

function RootNavigator() {
  const { session } = useAuth() || {};
  const [bootstrapped, setBootstrapped] = React.useState(false);
  const [askQuestionnaire, setAskQuestionnaire] =
    React.useState<boolean>(false);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event: string) => {
        console.log("[AuthStateChange] Event:", event);
        if (event === "PASSWORD_RECOVERY") {
          console.log("[AuthStateChange] Navigating to PasswordUpdate");
          if (navigationRef.isReady()) {
            navigationRef.navigate("PasswordUpdate");
          } else {
            pendingRoute = "PasswordUpdate";
          }
        }
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Timeout fallback: force bootstrap after 10 seconds
    const timeout = setTimeout(() => {
      console.log('[BOOT] Timeout reached, forcing bootstrap');
      setBootstrapped(true);
    }, 10000);

    if (session) {
      (async () => {
        try {
          const forceSignin = await AsyncStorage.getItem(
            "force_signin_after_signup",
          );
          if (forceSignin === "1" || blockAuthedOnce) {
            await AsyncStorage.removeItem("force_signin_after_signup");
            blockAuthedOnce = false;
            try {
              await supabase.auth.signOut();
            } catch {}
            clearTimeout(timeout);
            setBootstrapped(true);
            return;
          }
          const pending = await AsyncStorage.getItem("pending_password_update");
          if (pending === "1") {
            await AsyncStorage.removeItem("pending_password_update");
            if (navigationRef.isReady()) {
              navigationRef.navigate("PasswordUpdate");
            } else {
              pendingRoute = "PasswordUpdate";
            }
          }

          let shouldAskQuestionnaire = false;
          try {
            const deferStr = await AsyncStorage.getItem(
              "defer_user_questionnaire_until",
            );
            const now = Date.now();
            const deferUntil = deferStr ? Date.parse(deferStr) : 0;
            if (!deferUntil || now >= deferUntil) {
              const settings = session?.user?.id
                ? await getUserSettingsCached(session.user.id, {
                    refresh: true,
                  })
                : null;
              shouldAskQuestionnaire = !settings;
            }
          } catch {}

          setAskQuestionnaire(shouldAskQuestionnaire);
        } catch {
        } finally {
          clearTimeout(timeout);
          setBootstrapped(true);
        }
      })();
    } else {
      clearTimeout(timeout);
      setBootstrapped(true);
    }

    return () => clearTimeout(timeout);
  }, [session]);

  if (!bootstrapped) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0e130e' }}>
        <Text style={{ color: '#fff', fontSize: 18 }}>Loading...</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        <Stack.Screen name="PasswordUpdate" component={PasswordUpdateScreen} />
      </Stack.Navigator>
    );
  }
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#333333" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "bold" },
        cardStyle: { backgroundColor: "#121212" },
      }}
      initialRouteName="Dashboard"
    >
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: "Dashboard", headerShown: false }}
      />
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MealCapture"
        component={MealCaptureScreen}
        options={{ title: "Capture Meal", headerShown: false }}
      />
      <Stack.Screen
        name="BreakdownConfirm"
        component={BreakdownConfirmScreen}
        options={{ title: "快速摘要確認", headerShown: false }}
      />
      <Stack.Screen
        name="Results"
        component={ResultsScreen}
        options={{ title: "Analysis Results", headerShown: false }}
      />
      <Stack.Screen
        name="GeneralFeedback"
        component={GeneralFeedbackScreen}
        options={{ title: "General Feedback", headerShown: false }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: "Profile" }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "設定", headerShown: false }}
      />
      <Stack.Screen
        name="HistoryDates"
        component={HistoryDatesScreen}
        options={{ title: "歷史紀錄", headerShown: false }}
      />
      <Stack.Screen
        name="HistoryDay"
        component={HistoryDayScreen}
        options={{ title: "本日紀錄", headerShown: false }}
      />
      <Stack.Screen
        name="HistoryDetail"
        component={HistoryDetailScreen}
        options={{
          title: "詳細內容",
          headerShown: false,
          cardStyleInterpolator: CardStyleInterpolators.forNoAnimation,
        }}
      />
      <Stack.Screen
        name="AnalysisLoading"
        component={AnalysisLoadingScreen}
        options={{ title: "Analysis Loading", headerShown: false }}
      />
      <Stack.Screen
        name="PasswordUpdate"
        component={PasswordUpdateScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="UserQuestionnaire"
        component={UserQuestionnaireScreen}
        options={{ title: "個人化設定", headerShown: false }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'FredokaOne': require('./assets/fonts/FredokaOne-Regular.ttf'),
    'Nunito': Nunito_400Regular,
    'Nunito-SemiBold': Nunito_600SemiBold,
    'Nunito-Bold': Nunito_700Bold,
    'Nunito-ExtraBold': Nunito_800ExtraBold,
    'Nunito-Black': Nunito_900Black,
    'NotoSansTC': require('./assets/fonts/MochiyPopOne-Regular.ttf'),
    'JFOpenHuninn': require('./assets/fonts/jf-openhuninn-2.0.ttf'),
  });
  const [isOffline, setIsOffline] = useState(false);
  const [fontTimeout, setFontTimeout] = useState(false);
  
  useEffect(() => {
    // Force app to load after 3 seconds even if fonts aren't ready
    const timeoutId = setTimeout(() => {
      if (!fontsLoaded) {
        console.warn('[App] Font loading timeout - proceeding without fonts');
        setFontTimeout(true);
      }
    }, 3000);
    
    return () => clearTimeout(timeoutId);
  }, [fontsLoaded]);
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      console.log("[DeepLink] Received URL:", event.url);
      const url = event.url;
      if (url === lastHandledDeepLinkUrl) {
        // Guard against the same URL being delivered twice (e.g. both the
        // "url" event listener and Linking.getInitialURL() firing for the
        // same cold-start link), which would try to consume a single-use
        // PKCE code twice and spuriously fail the second time.
        console.log("[DeepLink] Ignoring duplicate URL:", url);
        return;
      }
      lastHandledDeepLinkUrl = url;
      const urlObj = new URL(url);
      const path = urlObj.pathname.replace(/^\/?--\/?/, "").replace(/^\//, "");
      const paramSource = urlObj.hash
        ? urlObj.hash.replace(/^#/, "")
        : urlObj.search.replace(/^\?/, "");
      const params = new URLSearchParams(paramSource);
      console.log(
        "[DeepLink] Parsed params:",
        Object.fromEntries(params.entries()),
      );

      const type = params.get("type");
      const error = params.get("error");
      const error_code = params.get("error_code");
      const error_description = params.get("error_description");
      if (type) console.log("[DeepLink] type:", type);
      if (error || error_code || error_description) {
        console.warn("[DeepLink] Error params present from Supabase:", {
          error,
          error_code,
          error_description,
        });
        Alert.alert(
          "Link error",
          `${error_code || error || "unknown"}: ${decodeURIComponent(error_description || "")}`,
        );
      }

      const code = params.get("code");
      if (code) {
        try {
          if (type !== "recovery" && !path.startsWith("reset-password")) {
            await AsyncStorage.setItem("force_signin_after_signup", "1");
            blockAuthedOnce = true;
          }
          await supabase.auth.exchangeCodeForSession(code);
          console.log("[DeepLink] exchangeCodeForSession success");
          if (type === "recovery" || path.startsWith("reset-password")) {
            await AsyncStorage.setItem("pending_password_update", "1");
            if (navigationRef.isReady()) {
              navigationRef.navigate("PasswordUpdate");
            } else {
              pendingRoute = "PasswordUpdate";
            }
            return;
          } else {
            try {
              await AsyncStorage.removeItem("pending_password_update");
            } catch {}
            try {
              await supabase.auth.signOut();
            } catch {}
            try {
              await AsyncStorage.removeItem("force_signin_after_signup");
            } catch {}
            blockAuthedOnce = false;
            if (navigationRef.isReady()) {
              navigationRef.navigate("SignIn");
            }
            return;
          }
        } catch (e) {
          console.log("[DeepLink] exchangeCodeForSession error:", e);
          if (type === "recovery" || path.startsWith("reset-password")) {
            // A stale/reused/expired reset link (e.g. from an older email
            // when multiple were requested) leaves no session behind, which
            // would otherwise surface later as a confusing "Auth session
            // missing" error when the user tries to submit a new password.
            Alert.alert(
              "Link expired",
              "This password reset link is invalid or has expired. Please request a new one.",
            );
            if (navigationRef.isReady()) {
              navigationRef.navigate("ResetPassword");
            }
          }
        }
      }

      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        try {
          if (type !== "recovery" && !path.startsWith("reset-password")) {
            await AsyncStorage.setItem("force_signin_after_signup", "1");
            blockAuthedOnce = true;
          }
          await supabase.auth.setSession({ access_token, refresh_token });
          console.log("[DeepLink] setSession success");
          const shouldNavigate =
            type === "recovery" || path.startsWith("reset-password");
          if (shouldNavigate) {
            await AsyncStorage.setItem("pending_password_update", "1");
            if (navigationRef.isReady()) {
              navigationRef.navigate("PasswordUpdate");
            } else {
              pendingRoute = "PasswordUpdate";
            }
            return;
          } else {
            try {
              await AsyncStorage.removeItem("pending_password_update");
            } catch {}
            try {
              await supabase.auth.signOut();
            } catch {}
            try {
              await AsyncStorage.removeItem("force_signin_after_signup");
            } catch {}
            blockAuthedOnce = false;
            if (navigationRef.isReady()) {
              navigationRef.navigate("SignIn");
            }
            return;
          }
        } catch (e) {
          console.log("[DeepLink] setSession error:", e);
          if (type === "recovery" || path.startsWith("reset-password")) {
            Alert.alert(
              "Link expired",
              "This password reset link is invalid or has expired. Please request a new one.",
            );
            if (navigationRef.isReady()) {
              navigationRef.navigate("ResetPassword");
            }
          }
        }
      } else {
        console.log("[DeepLink] No actionable auth params found in URL");
      }
    };
    const subscription = Linking.addEventListener("url", handleDeepLink);

    (async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        console.log("[DeepLink] Initial URL on app start:", initialUrl);
        handleDeepLink({ url: initialUrl });
      } else {
        console.log("[DeepLink] No initial URL");
      }

      try {
        const { data } = await supabase.auth.getUser();
        const userId = data?.user?.id || null;
        if (userId) {
          const imported = await importLocalPendingPhotosIfAny(userId);
          if (imported > 0) {
            Alert.alert("已匯入", `已匯入 ${imported} 張離線照片至歷史記錄。`);
          }
        }
      } catch (e) {
        if (__DEV__) console.warn("[PendingImport] Startup import failed", e);
      }
    })();

    const netSub = NetInfo.addEventListener(async (state) => {
      setIsOffline(!state.isConnected);
      try {
        if (state.isConnected) {
          const { data } = await supabase.auth.getUser();
          const userId = data?.user?.id || null;
          if (userId) {
            const imported = await importLocalPendingPhotosIfAny(userId);
            if (imported > 0) {
              Alert.alert(
                "已匯入",
                `網路連線恢復，已匯入 ${imported} 張離線照片。`,
              );
            }
          }
        }
      } catch (e) {
        if (__DEV__)
          console.warn("[PendingImport] Connectivity import failed", e);
      }
    });

    return () => {
      subscription.remove();
      netSub();
    };
  }, []);

  // Show loading only if fonts haven't loaded AND timeout hasn't occurred AND no error
  if (!fontsLoaded && !fontTimeout && !fontError) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0e130e' }}>
          <Text style={{ color: '#fff' }}>Loading assets…</Text>
        </View>
      </SafeAreaProvider>
    );
  }
  
  // Log font loading issues but continue
  if (fontError) {
    console.error('[App] Font loading error:', fontError);
  }
  if (fontTimeout && !fontsLoaded) {
    console.warn('[App] Continuing without fonts loaded');
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LanguageProvider>
          <ThemeProvider>
            <ErrorBoundary>
            {isOffline && <OfflineBanner />}
            <NavigationContainer
              linking={linking}
              ref={navigationRef}
              onReady={() => {
                if (pendingRoute) {
                  console.log("[Navigation] Flushing pending route:", pendingRoute);
                  navigationRef.navigate(pendingRoute);
                  pendingRoute = null;
                }
              }}
            >
              <RootNavigator />
            </NavigationContainer>
            </ErrorBoundary>
          </ThemeProvider>
        </LanguageProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function OfflineBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.offlineBanner, { top: insets.top || 0 }]}
      pointerEvents="none"
    >
      <Text style={styles.offlineText}>無網路連線</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#FF8C00",
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    // subtle shadow to stand out
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  offlineText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
