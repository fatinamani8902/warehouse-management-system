import { useRef } from "react";
import { View, PanResponder, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { DrawerProvider, useDrawer } from "@/context/DrawerContext";
import { AppDrawer } from "@/components/shared/AppDrawer";
import { TabIcon } from "@/components/shared/TabIcon";

function AppLayoutInner() {
  const { isOpen, openDrawer, closeDrawer } = useDrawer();

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        const startX      = _evt.nativeEvent.pageX;
        const isRight     = gestureState.dx > 8;
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
        return startX < 30 && isRight && isHorizontal && !isOpen;
      },
      onPanResponderTerminationRequest: () => true,
      onShouldBlockNativeResponder: () => false,
      onPanResponderRelease: (_evt, gestureState) => {
        if (gestureState.dx > 50) openDrawer();
      },
    })
  ).current;

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: "none" },
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon="🏠" label="Home" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="inbound"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon="📥" label="Inbound" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon="📦" label="Inventory" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="shipping/index"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon="🚚" label="Shipping" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon="👤" label="Profile" focused={focused} />
            ),
          }}
        />
      </Tabs>
      <AppDrawer open={isOpen} onClose={closeDrawer} />
    </View>
  );
}

export default function AppLayout() {
  return (
    <DrawerProvider>
      <AppLayoutInner />
    </DrawerProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabBar: {
    backgroundColor: "#0f172a",
    borderTopWidth: 0,
    height: 64,
    paddingBottom: 8,
    paddingTop: 8,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});