import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import PlantScreen from '../screens/farmer/PlantScreen';
import InventoryScreen from '../screens/farmer/InventoryScreen';
import MarketScreen from '../screens/farmer/MarketScreen';
import FarmerJobsScreen from '../screens/farmer/FarmerJobsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { colors } from '../config/theme';

const Tab = createBottomTabNavigator();

export default function FarmerNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Plant: focused ? 'leaf' : 'leaf-outline',
            Inventory: focused ? 'archive' : 'archive-outline',
            Market: focused ? 'cart' : 'cart-outline',
            Jobs: focused ? 'briefcase' : 'briefcase-outline',
            Profile: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: 4,
          height: 62,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textOnPrimary,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerRight: undefined,
      })}
    >
      <Tab.Screen name="Plant" component={PlantScreen} options={{ title: 'Plant' }} />
      <Tab.Screen name="Inventory" component={InventoryScreen} options={{ title: 'Inventory' }} />
      <Tab.Screen name="Market" component={MarketScreen} options={{ title: 'Market' }} />
      <Tab.Screen name="Jobs" component={FarmerJobsScreen} options={{ title: 'Jobs' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
