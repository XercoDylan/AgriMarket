import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getMyPlantingPlans, markPlanHarvested } from '../../services/plantService';
import { addToInventory, getMyInventory } from '../../services/marketService';
import { colors, spacing, borderRadius, typography, shadow } from '../../config/theme';

const STATUS_CONFIG = {
  active: { label: 'Growing', color: colors.primary, bg: '#E8F5E9', icon: 'leaf' },
  harvested: { label: 'Harvested', color: colors.earth, bg: '#EFEBE9', icon: 'archive' },
};

const INVENTORY_STATUS = {
  available: { label: 'Available', color: colors.primary, bg: '#E8F5E9' },
  listed: { label: 'Listed for Sale', color: '#1565C0', bg: '#E3F2FD' },
  sold: { label: 'Sold', color: colors.textMuted, bg: colors.border },
};

export default function InventoryScreen({ navigation }) {
  const { user, userProfile } = useAuth();
  const [plans, setPlans] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [harvestingId, setHarvestingId] = useState(null);
  const [tab, setTab] = useState('growing'); // 'growing' | 'inventory'
  const [showHarvestModal, setShowHarvestModal] = useState(false);
  const [harvestTarget, setHarvestTarget] = useState(null);
  const [harvestKg, setHarvestKg] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, inv] = await Promise.all([
        getMyPlantingPlans(user.uid),
        getMyInventory(user.uid),
      ]);
      setPlans(p.filter((x) => x.status === 'active'));
      setInventory(inv);
    } catch (error) {
      let message = 'Failed to load data.';
      if (error?.code === 'permission-denied') {
        message = 'Firestore rules blocked this request. Update your Firebase rules for signed-in users.';
      } else if (error?.code === 'failed-precondition') {
        message = 'Firestore index is missing for this query. Create the suggested index in Firebase Console.';
      } else if (error?.message) {
        message = error.message;
      }
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.uid]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleHarvest = (plan) => {
    setHarvestTarget(plan);
    setHarvestKg(
      plan?.estimatedYieldKg && Number.isFinite(Number(plan.estimatedYieldKg))
        ? String(plan.estimatedYieldKg)
        : ''
    );
    setShowHarvestModal(true);
  };

  const submitHarvest = async () => {
    const plan = harvestTarget;
    const qty = parseFloat(harvestKg);
    if (!plan) return;
    if (!qty || qty <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter harvested quantity in kg.');
      return;
    }

    setHarvestingId(plan.id);
    try {
      await markPlanHarvested(plan.id);
      await addToInventory(user.uid, {
        cropType: plan.cropType,
        cropName: plan.cropName,
        cropEmoji: plan.cropEmoji,
        quantity: qty,
        unit: 'kg',
        planId: plan.id,
        harvestedAt: new Date().toISOString(),
        farmerName: userProfile?.name || 'Farmer',
      });
      setShowHarvestModal(false);
      setHarvestTarget(null);
      setHarvestKg('');
      Alert.alert('Added to Inventory!', `${plan.cropName} (${qty} kg) has been added to your inventory.`);
      load();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setHarvestingId(null);
    }
  };

  const confirmHarvest = (plan) => {
    Alert.alert(
      'Mark as Harvested',
      `Enter how many kg of ${plan.cropName} you harvested.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => handleHarvest(plan),
        },
      ]
    );
  };

  const renderPlanCard = ({ item }) => {
    const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.active;
    const isHarvesting = harvestingId === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>{item.cropEmoji || '🌱'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.cropName}</Text>
            <Text style={styles.cardMeta}>
              {item.farmAreaHectares?.toFixed(2)} ha • Planted{' '}
              {item.createdAt?.toDate
                ? item.createdAt.toDate().toLocaleDateString()
                : new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={12} color={cfg.color} />
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        {item.status === 'active' && (
          <TouchableOpacity
            style={[styles.harvestBtn, isHarvesting && { opacity: 0.6 }]}
            onPress={() => confirmHarvest(item)}
            disabled={isHarvesting}
          >
            {isHarvesting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="basket-outline" size={16} color="#fff" />
                <Text style={styles.harvestBtnText}>Mark as Harvested</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderInventoryCard = ({ item }) => {
    const cfg = INVENTORY_STATUS[item.status] || INVENTORY_STATUS.available;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>{item.cropEmoji || '📦'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.cropName}</Text>
            <Text style={styles.cardMeta}>
              {item.quantity} {item.unit} • Harvested{' '}
              {item.harvestedAt ? new Date(item.harvestedAt).toLocaleDateString() : '—'}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        {item.status === 'available' && (
          <Text style={styles.sellHint}>
            Go to the Market tab to list this crop for sale or join a group sale.
          </Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const activeData = tab === 'growing' ? plans : inventory;
  const isEmpty = activeData.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'growing' && styles.tabActive]}
          onPress={() => setTab('growing')}
        >
          <Ionicons name="leaf-outline" size={16} color={tab === 'growing' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, tab === 'growing' && styles.tabTextActive]}>
            Growing ({plans.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'inventory' && styles.tabActive]}
          onPress={() => setTab('inventory')}
        >
          <Ionicons name="archive-outline" size={16} color={tab === 'inventory' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, tab === 'inventory' && styles.tabTextActive]}>
            Inventory ({inventory.length})
          </Text>
        </TouchableOpacity>
      </View>

      {isEmpty ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>{tab === 'growing' ? '🌱' : '📦'}</Text>
          <Text style={styles.emptyTitle}>
            {tab === 'growing' ? 'No active planting plans' : 'No harvested crops'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {tab === 'growing'
              ? 'Go to the Plant tab to create your first planting plan.'
              : 'Mark a growing crop as harvested to add it here.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={activeData}
          keyExtractor={(item) => item.id}
          renderItem={tab === 'growing' ? renderPlanCard : renderInventoryCard}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        />
      )}

      <Modal visible={showHarvestModal} animationType="slide" transparent onRequestClose={() => setShowHarvestModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                Harvest Quantity {harvestTarget?.cropEmoji || '🌾'} {harvestTarget?.cropName || ''}
              </Text>
              <Text style={styles.modalSubtitle}>Enter the actual amount harvested in kilograms.</Text>
              <TextInput
                style={styles.modalInput}
                value={harvestKg}
                onChangeText={setHarvestKg}
                keyboardType="decimal-pad"
                placeholder="e.g. 125.5"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <TouchableOpacity onPress={Keyboard.dismiss} style={styles.keyboardDoneBtn}>
                <Text style={styles.keyboardDoneText}>Done</Text>
              </TouchableOpacity>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    setShowHarvestModal(false);
                    setHarvestTarget(null);
                    setHarvestKg('');
                  }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, harvestingId && { opacity: 0.7 }]}
                  onPress={submitHarvest}
                  disabled={!!harvestingId}
                >
                  {harvestingId ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalSaveText}>Save Harvest</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: 6,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardEmoji: { fontSize: 36 },
  cardTitle: { ...typography.h4, color: colors.textPrimary, marginBottom: 2 },
  cardMeta: { ...typography.caption, color: colors.textMuted },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    gap: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  harvestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.earth,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
    gap: 6,
  },
  harvestBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sellHint: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { ...typography.h3, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  emptySubtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  modalTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: 4 },
  modalSubtitle: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
  modalInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    height: 52,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  keyboardDoneBtn: { alignSelf: 'flex-end', marginTop: spacing.sm },
  keyboardDoneText: { color: colors.primary, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600' },
  modalSaveBtn: {
    flex: 2,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  modalSaveText: { color: '#fff', fontWeight: '700' },
});
