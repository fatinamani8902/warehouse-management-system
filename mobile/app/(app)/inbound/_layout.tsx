import { Stack } from "expo-router";

export default function InboundLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create-asn" />
      <Stack.Screen name="create-grn" />
      <Stack.Screen name="asn/[id]" />
      <Stack.Screen name="grn/[id]" />
    </Stack>
  );
}