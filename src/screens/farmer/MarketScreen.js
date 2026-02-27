import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  createListing,
  getMyListings,
  cancelListing,
  createUnitSale,
  getOpenUnitSales,
  joinUnitSale,
  getMyInventory,
  markInventoryListed,
} from '../../services/marketService';
import { colors, spacing, borderRadius, typography, shadow } from '../../config/theme';

export default function MarketScreen() {
  const { user, userProfile } = useAuth();
  const [tab, setTab] = useState('listings');
  const [myListings, setMyListings] = useState([]);
  const [unitSales, setUnitSales] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal state
  const [showListingModal, setShowListingModal] = useState(false);
  const [showUnitSaleModal, setShowUnitSaleModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(null); // set to unitSale obj
  const [submitting, setSubmitting] = useState(false);

  // Listing form
  const [listForm, setListForm] = useState({
    inventoryId: '',
    cropName: '',
    cropEmoji: '',
    quantity: '',
    pricePerUnit: '',
    unit: 'kg',
    description: '',
  });

  // Unit sale form
  const [saleForm, setSaleForm] = useState({
    inventoryId: '',
    cropName: '',
    cropEmoji: '',
    initialQuantity: '',
    targetQuantity: '',
    pricePerUnit: '',
    description: '',
  });

  // Join form
  const [joinQuantity, setJoinQuantity] = useState('');
  const [joinInventoryId, setJoinInventoryId] = useState('');

  const load = useCallback(async () => {
    try {
      const [listings, sales, inv] = await Promise.all([
        getMyListings(user.uid),
        getOpenUnitSales(),
        getMyInventory(user.uid),
      ]);
      setMyListings(listings);
      setUnitSales(sales);
      setInventory(inv.filter((i) => i.status === 'available'));
    } catch (err) {
      Alert.alert('Error', 'Failed to load market data.');
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

  const openListingModal = (item) => {
    setListForm({
      inventoryId: item.id,
      cropName: item.cropName,
      cropEmoji: item.cropEmoji || '🌱',
      quantity: String(item.quantity),
      pricePerUnit: '',
      unit: item.unit || 'kg',
      description: '',
    });
    setShowListingModal(true);
  };

  const submitListing = async () => {
    const { inventoryId, cropName, cropEmoji, quantity, pricePerUnit, unit, description } = listForm;
    if (!quantity || !pricePerUnit) {
      Alert.alert('Missing Fields', 'Please fill in quantity and price.');
      return;
    }
    setSubmitting(true);
    try {
      await createListing(user.uid, userProfile?.name || 'Farmer', {
        inventoryId,
        cropType: cropName.toLowerCase(),
        cropName,
        cropEmoji,
        quantity: parseFloat(quantity),
        pricePerUnit: parseFloat(pricePerUnit),
        unit,
        description,
      });
      await markInventoryListed(inventoryId);
      setShowListingModal(false);
      Alert.alert('Listed!', 'Your crop is now visible to buyers.');
      load();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelListing = (listing) => {
    Alert.alert('Cancel Listing', 'Remove this listing from the market?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel Listing',
        style: 'destructive',
        onPress: async () => {
          await cancelListing(listing.id);
          load();
        },
      },
    ]);
  };

  const openSaleModal = (item) => {
    setSaleForm({
      inventoryId: item.id,
      cropName: item.cropName,
      cropEmoji: item.cropEmoji || '🌱',
      initialQuantity: String(item.quantity),
      targetQuantity: '',
      pricePerUnit: '',
      description: '',
    });
    setShowUnitSaleModal(true);
  };

  const submitUnitSale = async () => {
    const { inventoryId, cropName, cropEmoji, initialQuantity, targetQuantity, pricePerUnit, description } = saleForm;
    if (!initialQuantity || !targetQuantity || !pricePerUnit) {
      Alert.alert('Missing Fields', 'Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      await createUnitSale(user.uid, userProfile?.name || 'Farmer', {
        inventoryId,
        cropType: cropName.toLowerCase(),
        cropEmoji,
        initialQuantity: parseFloat(initialQuantity),
        targetQuantity: parseFloat(targetQuantity),
        pricePerUnit: parseFloat(pricePerUnit),
        description,
      });
      await markInventoryListed(inventoryId);
      setShowUnitSaleModal(false);
      Alert.alert('Group Sale Created!', 'Other farmers with the same crop can now join your group sale.');
      load();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitJoin = async (sale) => {
    if (!joinQuantity || !joinInventoryId) {
      Alert.alert('Missing Fields', 'Select an inventory item and enter quantity.');
      return;
    }
    setSubmitting(true);
    try {
      await joinUnitSale(sale.id, user.uid, userProfile?.name || 'Farmer', parseFloat(joinQuantity), joinInventoryId);
      await markInventoryListed(joinInventoryId);
      setShowJoinModal(null);
      Alert.alert('Joined!', 'You have successfully joined this group sale.');
      load();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderListingCard = ({ item }) => {
    const statusColor = item.status === 'active' ? colors.primary : item.status === 'sold' ? colors.earth : colors.error;
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.cardEmoji}>{item.cropEmoji || '🌱'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.cropName}</Text>
            <Text style={styles.cardMeta}>
              {item.quantity} {item.unit} • GH₵{item.pricePerUnit}/{item.unit}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>
        {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}
        {item.status === 'active' && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancelListing(item)}>
            <Text style={styles.cancelBtnText}>Cancel Listing</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderUnitSaleCard = ({ item }) => {
    const pct = Math.min(100, Math.round((item.currentQuantity / item.targetQuantity) * 100));
    const alreadyJoined = item.contributors?.some((c) => c.farmerId === user.uid);
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.cardEmoji}>{item.cropEmoji || '🌾'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.cropType} Group Sale</Text>
            <Text style={styles.cardMeta}>
              GH₵{item.pricePerUnit}/kg • {item.contributors?.length || 1} contributor(s)
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: '#E3F2FD' }]}>
            <Text style={[styles.badgeText, { color: '#1565C0' }]}>{item.status}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>
            {item.currentQuantity} / {item.targetQuantity} kg
          </Text>
          <Text style={styles.progressPct}>{pct}%</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>

        {!alreadyJoined && item.status === 'open' && (
          <TouchableOpacity
            style={styles.joinBtn}
            onPress={() => {
              setJoinQuantity('');
              setJoinInventoryId('');
              setShowJoinModal(item);
            }}
          >
            <Ionicons name="add-circle-outline" size={16} color="#fff" />
            <Text style={styles.joinBtnText}>Join This Sale</Text>
          </TouchableOpacity>
        )}
        {alreadyJoined && (
          <View style={[styles.badge, { backgroundColor: '#E8F5E9', alignSelf: 'flex-start', marginTop: spacing.sm }]}>
            <Ionicons name="checkmark-circle" size={12} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.primary }]}>You're in</Text>
          </View>
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'listings' && styles.tabActive]}
          onPress={() => setTab('listings')}
        >
          <Text style={[styles.tabText, tab === 'listings' && styles.tabTextActive]}>
            My Listings ({myListings.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'group' && styles.tabActive]}
          onPress={() => setTab('group')}
        >
          <Text style={[styles.tabText, tab === 'group' && styles.tabTextActive]}>
            Group Sales ({unitSales.length})
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'listings' ? (
        <>
          {/* Quick action: list from inventory */}
          {inventory.length > 0 && (
            <View style={styles.inventoryActions}>
              <Text style={styles.inventoryActionsLabel}>
                {inventory.length} crop(s) ready to sell:
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
                {inventory.map((item) => (
                  <View key={item.id} style={styles.inventoryChip}>
                    <Text style={styles.chipText}>{item.cropEmoji} {item.cropName}</Text>
                    <TouchableOpacity style={styles.chipBtn} onPress={() => openListingModal(item)}>
                      <Text style={styles.chipBtnText}>List</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chipBtn, { backgroundColor: '#1565C0' }]}
                      onPress={() => openSaleModal(item)}
                    >
                      <Text style={styles.chipBtnText}>Group</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          <FlatList
            data={myListings}
            keyExtractor={(item) => item.id}
            renderItem={renderListingCard}
            contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyEmoji}>🛒</Text>
                <Text style={styles.emptyTitle}>No active listings</Text>
                <Text style={styles.emptySubtitle}>Harvest a crop in the Inventory tab, then list it here.</Text>
              </View>
            }
          />
        </>
      ) : (
        <FlatList
          data={unitSales}
          keyExtractor={(item) => item.id}
          renderItem={renderUnitSaleCard}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyEmoji}>🤝</Text>
              <Text style={styles.emptyTitle}>No group sales open</Text>
              <Text style={styles.emptySubtitle}>Create a group sale from your inventory to sell at wholesale prices with other farmers.</Text>
            </View>
          }
        />
      )}

      {/* Listing Modal */}
      <Modal visible={showListingModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>List {listForm.cropEmoji} {listForm.cropName} for Sale</Text>
            <FormInput label="Quantity (kg)" value={listForm.quantity} onChangeText={(v) => setListForm({ ...listForm, quantity: v })} keyboardType="numeric" />
            <FormInput label="Price per kg (GH₵)" value={listForm.pricePerUnit} onChangeText={(v) => setListForm({ ...listForm, pricePerUnit: v })} keyboardType="numeric" />
            <FormInput label="Description (optional)" value={listForm.description} onChangeText={(v) => setListForm({ ...listForm, description: v })} multiline />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowListingModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={submitListing} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSubmitText}>List Crop</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Unit Sale Modal */}
      <Modal visible={showUnitSaleModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Group Sale: {saleForm.cropEmoji} {saleForm.cropName}</Text>
            <FormInput label={`Your contribution (kg) — max ${saleForm.initialQuantity} kg`} value={saleForm.initialQuantity} onChangeText={(v) => setSaleForm({ ...saleForm, initialQuantity: v })} keyboardType="numeric" />
            <FormInput label="Target total quantity (kg)" value={saleForm.targetQuantity} onChangeText={(v) => setSaleForm({ ...saleForm, targetQuantity: v })} keyboardType="numeric" />
            <FormInput label="Wholesale price per kg (GH₵)" value={saleForm.pricePerUnit} onChangeText={(v) => setSaleForm({ ...saleForm, pricePerUnit: v })} keyboardType="numeric" />
            <FormInput label="Description" value={saleForm.description} onChangeText={(v) => setSaleForm({ ...saleForm, description: v })} multiline />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowUnitSaleModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={submitUnitSale} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSubmitText}>Create Sale</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Join Modal */}
      <Modal visible={!!showJoinModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Join: {showJoinModal?.cropType} Group Sale</Text>
            <Text style={styles.modalSubtitle}>Select your crop from inventory and enter quantity:</Text>
            <ScrollView style={{ maxHeight: 120 }}>
              {inventory
                .filter((i) => i.cropName?.toLowerCase() === showJoinModal?.cropType?.toLowerCase())
                .map((i) => (
                  <TouchableOpacity
                    key={i.id}
                    style={[styles.inventorySelectRow, joinInventoryId === i.id && styles.inventorySelectRowActive]}
                    onPress={() => setJoinInventoryId(i.id)}
                  >
                    <Text style={styles.inventorySelectText}>{i.cropEmoji} {i.cropName} — {i.quantity} kg available</Text>
                    {joinInventoryId === i.id && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              {inventory.filter((i) => i.cropName?.toLowerCase() === showJoinModal?.cropType?.toLowerCase()).length === 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 13, padding: spacing.sm }}>
                  No matching {showJoinModal?.cropType} in your inventory.
                </Text>
              )}
            </ScrollView>
            <FormInput label="Quantity to contribute (kg)" value={joinQuantity} onChangeText={setJoinQuantity} keyboardType="numeric" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowJoinModal(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={() => submitJoin(showJoinModal)} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSubmitText}>Join Sale</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FormInput({ label, value, onChangeText, keyboardType, multiline }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4, fontWeight: '600' }}>{label}</Text>
      <TextInput
        style={{
          backgroundColor: colors.background,
          borderRadius: borderRadius.sm,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          color: colors.textPrimary,
          fontSize: 15,
          minHeight: multiline ? 70 : 44,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, minHeight: 200 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.md },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  inventoryActions: {
    backgroundColor: colors.sand,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inventoryActionsLabel: { fontSize: 13, color: colors.earth, fontWeight: '600' },
  inventoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    marginRight: spacing.sm,
    gap: spacing.sm,
    ...shadow.sm,
  },
  chipText: { fontSize: 13, color: colors.textPrimary },
  chipBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  chipBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardEmoji: { fontSize: 34 },
  cardTitle: { ...typography.h4, color: colors.textPrimary, marginBottom: 2 },
  cardMeta: { ...typography.caption, color: colors.textMuted },
  cardDesc: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    gap: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cancelBtn: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
  },
  cancelBtnText: { color: colors.error, fontWeight: '700', fontSize: 13 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  progressText: { fontSize: 12, color: colors.textMuted },
  progressPct: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  progressBar: { height: 6, backgroundColor: colors.border, borderRadius: 3, marginTop: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1565C0',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
    gap: 6,
  },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
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
    paddingBottom: 32,
  },
  modalTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: 4 },
  modalSubtitle: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
  modalBtns: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  modalCancelBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600' },
  modalSubmitBtn: {
    flex: 2,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalSubmitText: { color: '#fff', fontWeight: '700' },
  inventorySelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: 4,
    backgroundColor: colors.background,
  },
  inventorySelectRowActive: { backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: colors.primary },
  inventorySelectText: { fontSize: 13, color: colors.textPrimary, flex: 1 },
});
