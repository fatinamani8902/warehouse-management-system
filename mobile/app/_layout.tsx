import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "@/stores/authStore";

export default function RootLayout() {
  const { hydrated, hydrate, token, user } = useAuthStore();
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    hydrate();
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const inAuth = segments[0] === "(auth)";
    const inApp  = segments[0] === "(app)";

    if (!token) {
      // Not logged in — go to login
      if (!inAuth) router.replace("/(auth)/login");
    } else if (!user?.warehouse_id) {
      // Logged in but no warehouse selected yet
      if (segments[1] !== "select-warehouse") {
        router.replace("/(auth)/select-warehouse");
      }
    } else {
      // Fully authenticated — go to app
      if (!inApp) router.replace("/(app)");
    }
  }, [hydrated, token, user?.warehouse_id, segments]);

  return (
    <>
      <StatusBar style="light" />
      <Slot />
    </>
  );
}