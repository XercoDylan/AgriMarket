import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius, typography, shadow } from '../../config/theme';

const ROLES = [
  {
    id: 'farmer',
    emoji: '🌾',
    title: 'Farmer',
    description: 'Plan your farm, manage inventory, sell crops, and hire contractors.',
    color: colors.primary,
    lightColor: '#E8F5E9',
  },
  {
    id: 'contractor',
    emoji: '🔧',
    title: 'Contractor',
    description: 'Find agricultural work posted by farmers and grow your income.',
    color: '#1565C0',
    lightColor: '#E3F2FD',
  },
  {
    id: 'buyer',
    emoji: '🛍️',
    title: 'Buyer',
    description: 'Source fresh, quality crops directly from local farmers.',
    color: '#6D4C41',
    lightColor: '#EFEBE9',
  },
];

export default function OnboardingScreen({ route, navigation }) {
  const { uid } = route.params || {};
  const { createProfile, user } = useAuth();
  const [name, setName] = useState('');
  const [selectedRole, setSelectedRole] = useState(null);
  const [loading, setLoading] = useState(false);

  const resolvedUid = uid || user?.uid;

  const handleContinue = async () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter your name.');
      return;
    }
    if (!selectedRole) {
      Alert.alert('Select a Role', 'Please choose how you will use AgriMarket.');
      return;
    }
    if (!resolvedUid) {
      Alert.alert('Error', 'Something went wrong. Please sign up again.');
      navigation.navigate('SignUp');
      return;
    }

    setLoading(true);
    try {
      await createProfile(resolvedUid, {
        name: name.trim(),
        role: selectedRole,
        email: user?.email || '',
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to save your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={[colors.primaryDark, colors.primary]}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Welcome to AgriMarket</Text>
        <Text style={styles.headerSubtitle}>Let's set up your profile</Text>
      </LinearGradient>

      <View style={styles.content}>
        {/* Name input */}
        <Text style={styles.sectionLabel}>Your Name</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="person-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="done"
          />
        </View>

        {/* Role selection */}
        <Text style={styles.sectionLabel}>I am a...</Text>
        {ROLES.map((role) => {
          const isSelected = selectedRole === role.id;
          return (
            <TouchableOpacity
              key={role.id}
              style={[
                styles.roleCard,
                isSelected && { borderColor: role.color, borderWidth: 2, backgroundColor: role.lightColor },
              ]}
              onPress={() => setSelectedRole(role.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.roleEmoji, { backgroundColor: role.lightColor }]}>
                <Text style={styles.roleEmojiText}>{role.emoji}</Text>
              </View>
              <View style={styles.roleInfo}>
                <Text style={[styles.roleTitle, isSelected && { color: role.color }]}>{role.title}</Text>
                <Text style={styles.roleDesc}>{role.description}</Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={24} color={role.color} />
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.7 }]}
          onPress={handleContinue}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <>
              <Text style={styles.buttonText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.textOnPrimary} style={{ marginLeft: 8 }} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1 },
  header: {
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: spacing.lg,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  sectionLabel: {
    ...typography.h4,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    height: 54,
  },
  inputIcon: { marginRight: spacing.sm },
  input: { flex: 1, color: colors.textPrimary, fontSize: 16 },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadow.sm,
  },
  roleEmoji: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  roleEmojiText: { fontSize: 28 },
  roleInfo: { flex: 1 },
  roleTitle: {
    ...typography.h4,
    color: colors.textPrimary,
    marginBottom: 3,
  },
  roleDesc: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 17,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    height: 54,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: { color: colors.textOnPrimary, ...typography.button },
});
