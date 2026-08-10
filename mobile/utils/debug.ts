export const MOBILE_DEBUG_ENABLED = process.env.EXPO_PUBLIC_MOBILE_DEBUG === "true";

export function mobileDebug(label: string, payload: unknown) {
  if (MOBILE_DEBUG_ENABLED) {
    console.error(label, payload);
  }
}
