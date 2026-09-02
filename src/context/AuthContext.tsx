import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { clearAllInMemoryCaches } from "../services/api";

interface AuthContextType {
  session: Session | null;
  supabase: typeof supabase;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STAY_SIGNED_IN_KEY = "stay_signed_in_pref";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STAY_SIGNED_IN_KEY);
        const staySignedIn = stored != null ? JSON.parse(stored) : true;

        if (staySignedIn === false) {
          // User opted not to stay signed in on this device. Clear the
          // locally persisted session so a full app relaunch starts logged out.
          await supabase.auth.signOut();
          if (mounted) setSession(null);
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          if (mounted) setSession(session);
        }
      } catch (e) {
        if (__DEV__) console.warn("Failed to apply stay-signed-in preference:", e);
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) setSession(session);
      }

      const { data: listener } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (event === "SIGNED_OUT") {
            clearAllInMemoryCaches();
          }
          if (mounted) setSession(session);
        },
      );
      unsubscribe = () => listener.subscription.unsubscribe();
    })();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, supabase }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
