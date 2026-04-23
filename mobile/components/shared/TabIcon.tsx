import { View, Text, StyleSheet } from "react-native";

interface TabIconProps {
  icon:    string;
  label:   string;
  focused: boolean;
}

export function TabIcon({ icon, label, focused }: TabIconProps) {
  return (
    <View style={[styles.tabItem, focused && styles.tabItemFocused]}>
      <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>{icon}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 10, minWidth: 56,
  },
  tabItemFocused: { backgroundColor: "#1e3a5f" },
  tabIcon:        { fontSize: 18, color: "#64748b", marginBottom: 2 },
  tabIconFocused: { color: "#3b82f6" },
  tabLabel:       { fontSize: 10, color: "#64748b", fontWeight: "500" },
  tabLabelFocused:{ color: "#3b82f6", fontWeight: "700" },
});