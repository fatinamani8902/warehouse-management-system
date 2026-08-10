import { Stack } from "expo-router";

export default function InventoryLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="count-plan/[id]" />
      <Stack.Screen name="count-plan/create" />
      <Stack.Screen name="adjustment/[id]" />
      <Stack.Screen name="adjustment/create" />
    </Stack>
  );
}