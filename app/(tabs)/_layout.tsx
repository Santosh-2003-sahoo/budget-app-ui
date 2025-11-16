import { Tabs } from "expo-router";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Small refresh button in header-right
function RefreshHeaderButton() {
  const handlePress = () => {
    // Call global refresh handlers if they are set by screens
    (globalThis as any).__refreshTransactions?.();
    (globalThis as any).__refreshStats?.();
    (globalThis as any).__refreshAccounts?.();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={styles.headerRightButton}
    >
      <Ionicons name="refresh" size={20} color="#e5e7eb" />
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitle: () => (
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerMainTitle}>{"Sandy's"}</Text>
            <Text style={styles.headerSubTitle}>paisa tracker</Text>
          </View>
        ),
        headerStyle: {
          backgroundColor: "#1f1f1f",
        },
        tabBarStyle: {
          backgroundColor: "#1f1f1f",
          borderTopColor: "#333",
        },
        tabBarActiveTintColor: "#fff",
        tabBarInactiveTintColor: "#777",
        headerRight: () => <RefreshHeaderButton />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Trans.",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="list"
              size={size}
              color={focused ? "#ff9ecb" : "#555"} // pastel pink
            />
          ),
        }}
      />

      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="pie-chart-outline"
              size={size}
              color={focused ? "#9ecbff" : "#555"} // pastel blue
            />
          ),
        }}
      />

      <Tabs.Screen
        name="accounts"
        options={{
          title: "Accounts",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="wallet-outline"
              size={size}
              color={focused ? "#9effd8" : "#555"} // pastel mint
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerTitleContainer: {
    alignItems: "flex-start",
  },
  headerMainTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  headerSubTitle: {
    fontSize: 14,
    color: "#ccc",
  },
  headerRightButton: {
    marginRight: 12,
    padding: 6,
    borderRadius: 999,
    backgroundColor: "rgba(31,41,55,0.85)",
  },
});
