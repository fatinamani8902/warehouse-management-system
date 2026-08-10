import { Stack } from "expo-router";

export default function PutawayLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="task/[id]" />
    </Stack>
  );
}