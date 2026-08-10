import { Stack } from "expo-router";

export default function PickingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[pickListId]" />
    </Stack>
  );
}