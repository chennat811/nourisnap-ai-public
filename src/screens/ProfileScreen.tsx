import React from "react";
import { View, Text, Button, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../context/LanguageContext";

export default function ProfileScreen() {
  const { session, supabase } = useAuth();
  const { t } = useLanguage();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    await AsyncStorage.removeItem("supabase_session");
  };

  if (!session) return null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
    <View style={styles.container}>
      <Text style={styles.title}>{t('profile.title')}</Text>
      <Text>{t('profile.email')} {session.user.email}</Text>
      <Button title={t('profile.signOut')} onPress={handleSignOut} />
    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 24 },
});
