import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography } from '../config/theme';

export default function LoadingScreen({ message = 'Loading...' }) {
  return (
    <LinearGradient colors={[colors.primaryDark, colors.primary]} style={styles.container}>
      <Text style={styles.logo}>🌿</Text>
      <Text style={styles.appName}>AgriMarket</Text>
      <ActivityIndicator size="large" color="rgba(255,255,255,0.9)" style={styles.spinner} />
      <Text style={styles.message}>{message}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: { fontSize: 64, marginBottom: 8 },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.5,
    marginBottom: 40,
  },
  spinner: { marginBottom: 16 },
  message: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    ...typography.body,
  },
});
