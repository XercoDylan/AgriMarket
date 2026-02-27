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
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  getActiveListings,
  getAllUnitSales,
  buyListing,
  buyUnitSale,
  getMyOrders,
} from '../../services/marketService';
import { colors, spacing, borderRadius, typography, shadow } from '../../config/theme';
import { formatPrice } from '../../config/currencies';

// Same crops as farmer PlantScreen, sorted alphabetically by name
const CROP_OPTIONS = [
  { id: 'cassava', name: 'Cassava', emoji: '🥔' },
  { id: 'cocoa', name: 'Cocoa', emoji: '🍫' },
  { id: 'cotton', name: 'Cotton', emoji: '🌱' },
  { id: 'cowpea', name: 'Cowpea', emoji: '🫘' },
  { id: 'groundnut', name: 'Groundnut', emoji: '🥜' },
  { id: 'maize', name: 'Maize', emoji: '🌽' },
  { id: 'millet', name: 'Millet', emoji: '🌾' },
  { id: 'okra', name: 'Okra', emoji: '🌿' },
  { id: 'onion', name: 'Onion', emoji: '🧅' },
  { id: 'pepper', name: 'Pepper', emoji: '🌶️' },
  { id: 'plantain', name: 'Plantain', emoji: '🍌' },
  { id: 'rice', name: 'Rice', emoji: '🍚' },
  { id: 'sorghum', name: 'Sorghum', emoji: '🌾' },
  { id: 'sugarcane', name: 'Sugarcane', emoji: '🎋' },
  { id: 'tomato', name: 'Tomato', emoji: '🍅' },
  { id: 'yam', name: 'Yam', emoji: '🍠' },
];

export default function BuyerMarketScreen() {
  const { user, userProfile } = useAuth();
  const [tab, setTab] = useState('individual'); // 'individual' | 'wholesale' | 'orders'
  const [listings, setListings] = useState([]);
  const [unitSales, setUnitSales] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cropFilter, setCropFilter] = useState('All');
  const [selectedCrops, setSelectedCrops] = useState([]);
  const [cropDropdownVisible, setCropDropdownVisible] = useState(false);

  // Buy modal
  const [buyTarget, setBuyTarget] = useState(null); // { type: 'listing'|'wholesale', item }
  const [buyQuantity, setBuyQuantity] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, us, o] = await Promise.all([
        getActiveListings(),
        getAllUnitSales(),
        getMyOrders(user.uid),
      ]);
      setListings(l);
      setUnitSales(us.filter((s) => s.status === 'open' || s.status === 'active'));
      setOrders(o);
    } catch {
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

  const filteredListings =
    selectedCrops.length === 0
      ? listings
      : listings.filter((l) =>
          selectedCrops.some((c) => (l.cropName || '').toLowerCase().includes(c.toLowerCase()))
        );

  const filteredUnitSales =
    selectedCrops.length === 0
      ? unitSales
      : unitSales.filter((s) =>
          selectedCrops.some((c) => (s.cropType || '').toLowerCase().includes(c.toLowerCase()))
        );

  const addCrop = (crop) => {
    if (selectedCrops.includes(crop)) {
      setSelectedCrops((prev) => prev.filter((c) => c !== crop));
    } else {
      setSelectedCrops((prev) => [...prev, crop]);
    }
  };

  const removeCrop = (crop) => {
    setSelectedCrops((prev) => prev.filter((c) => c !== crop));
  };

  const openBuyModal = (type, item) => {
    setBuyQuantity('');
    setBuyTarget({ type, item });
  };

  const handleBuy = async () => {
    const qty = parseFloat(buyQuantity);
    if (!qty || qty <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid quantity.');
      return;
    }
    const { type, item } = buyTarget;
    if (type === 'listing' && qty > item.quantity) {
      Alert.alert('Exceeds Available', `Only ${item.quantity} ${item.unit} available.`);
      return;
    }
    if (type === 'wholesale' && qty > item.currentQuantity) {
      Alert.alert('Exceeds Available', `Only ${item.currentQuantity} kg available.`);
      return;
    }

    const totalPrice = type === 'listing'
      ? qty * item.pricePerUnit
      : qty * item.pricePerUnit;

    Alert.alert(
      'Confirm Purchase',
      `Buy ${qty} ${type === 'listing' ? item.unit : 'kg'} of ${type === 'listing' ? item.cropName : item.cropType} for ${formatPrice(totalPrice, userProfile?.currency)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setSubmitting(true);
            try {
              if (type === 'listing') {
                await buyListing(item.id, user.uid, userProfile?.name || 'Buyer', qty, totalPrice);
              } else {
                await buyUnitSale(item.id, user.uid, userProfile?.name || 'Buyer', qty, item.pricePerUnit);
              }
              setBuyTarget(null);
              Alert.alert('Purchase Confirmed!', 'Contact the seller to arrange delivery. Check My Orders for details.');
              load();
            } catch (err) {
              Alert.alert('Purchase Failed', err.message);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const renderListingCard = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji}>{item.cropEmoji || '🌱'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.cropName}</Text>
          <Text style={styles.sellerName}>Sold by {item.farmerName}</Text>
        </View>
        <View style={styles.priceTag}>
          <Text style={styles.priceText}>{formatPrice(item.pricePerUnit, userProfile?.currency)}</Text>
          <Text style={styles.priceUnit}>/{item.unit}</Text>
        </View>
      </View>
      <View style={styles.stockRow}>
        <Ionicons name="cube-outline" size={14} color={colors.textMuted} />
        <Text style={styles.stockText}>{item.quantity} {item.unit} available</Text>
      </View>
      {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}
      <TouchableOpacity style={styles.buyBtn} onPress={() => openBuyModal('listing', item)}>
        <Ionicons name="cart-outline" size={16} color="#fff" />
        <Text style={styles.buyBtnText}>Buy Now</Text>
      </TouchableOpacity>
    </View>
  );

  const renderUnitSaleCard = ({ item }) => {
    const pct = Math.min(100, Math.round((item.currentQuantity / item.targetQuantity) * 100));
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>{item.cropEmoji || '🌾'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.cropType}</Text>
            <Text style={styles.sellerName}>{item.contributors?.length || 1} farmer(s) contributing</Text>
          </View>
          <View style={styles.priceTag}>
            <Text style={styles.priceText}>{formatPrice(item.pricePerUnit, userProfile?.currency)}</Text>
            <Text style={styles.priceUnit}>/kg</Text>
          </View>
        </View>

        <View style={[styles.badge, { backgroundColor: '#E3F2FD', alignSelf: 'flex-start', marginBottom: spacing.sm }]}>
          <Ionicons name="people-outline" size={12} color="#1565C0" />
          <Text style={[styles.badgeText, { color: '#1565C0' }]}>Wholesale Group Sale</Text>
        </View>

        <View style={styles.progressRow}>
          <Text style={styles.progressText}>{item.currentQuantity} kg available of {item.targetQuantity} kg target</Text>
          <Text style={styles.progressPct}>{pct}%</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>

        {item.description ? <Text style={[styles.cardDesc, { marginTop: spacing.sm }]}>{item.description}</Text> : null}

        <TouchableOpacity
          style={[styles.buyBtn, { backgroundColor: '#1565C0' }]}
          onPress={() => openBuyModal('wholesale', item)}
        >
          <Ionicons name="bag-outline" size={16} color="#fff" />
          <Text style={styles.buyBtnText}>Buy Wholesale</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderOrderCard = ({ item }) => {
    const statusColor = item.status === 'confirmed' ? colors.primary : item.status === 'delivered' ? colors.earth : colors.textMuted;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>{item.type === 'wholesale' ? '🌾' : '🛒'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              {item.type === 'wholesale' ? 'Wholesale Purchase' : 'Crop Purchase'}
            </Text>
            <Text style={styles.sellerName}>
              {item.quantity} kg • {formatPrice(item.totalPrice, userProfile?.currency)}
            </Text>
            <Text style={styles.orderDate}>
              {item.createdAt?.toDate
                ? item.createdAt.toDate().toLocaleDateString()
                : new Date(item.createdAt || Date.now()).toLocaleDateString()}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>
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
          style={[styles.tab, tab === 'individual' && styles.tabActive]}
          onPress={() => setTab('individual')}
        >
          <Text style={[styles.tabText, tab === 'individual' && styles.tabTextActive]}>Crops</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'wholesale' && styles.tabActive]}
          onPress={() => setTab('wholesale')}
        >
          <Text style={[styles.tabText, tab === 'wholesale' && styles.tabTextActive]}>Wholesale</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'orders' && styles.tabActive]}
          onPress={() => setTab('orders')}
        >
          <Text style={[styles.tabText, tab === 'orders' && styles.tabTextActive]}>
            Orders ({orders.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Crop filter (only for individual/wholesale): dropdown + selected chips */}
      {tab !== 'orders' && (
        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterBarContent}
          >
            <TouchableOpacity
              style={styles.filterDropdown}
              onPress={() => setCropDropdownVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.filterDropdownText}>Select crop</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {selectedCrops.map((cropName) => {
              const crop = CROP_OPTIONS.find((c) => c.name === cropName);
              return (
                <View key={cropName} style={styles.filterChipActive}>
                  {crop ? <Text style={styles.filterChipEmoji}>{crop.emoji}</Text> : null}
                  <Text style={styles.filterChipTextActive}>{cropName}</Text>
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => removeCrop(cropName)}
                    style={styles.filterChipRemove}
                  >
                    <Ionicons name="close-circle" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Crop dropdown modal */}
      <Modal
        visible={cropDropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCropDropdownVisible(false)}
      >
        <TouchableOpacity
          style={styles.dropdownBackdrop}
          activeOpacity={1}
          onPress={() => setCropDropdownVisible(false)}
        >
          <TouchableOpacity
            style={styles.dropdownBox}
            activeOpacity={1}
            onPress={() => {}}
          >
            <Text style={styles.dropdownTitle}>Select a crop to filter</Text>
            <ScrollView style={styles.dropdownList} keyboardShouldPersistTaps="handled">
              {CROP_OPTIONS.map((crop) => (
                <TouchableOpacity
                  key={crop.id}
                  style={[
                    styles.dropdownItem,
                    selectedCrops.includes(crop.name) && styles.dropdownItemSelected,
                  ]}
                  onPress={() => addCrop(crop.name)}
                >
                  <Text style={styles.dropdownItemEmoji}>{crop.emoji}</Text>
                  <Text
                    style={[
                      styles.dropdownItemText,
                      selectedCrops.includes(crop.name) && styles.dropdownItemTextSelected,
                    ]}
                  >
                    {crop.name}
                  </Text>
                  {selectedCrops.includes(crop.name) && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {tab === 'individual' && (
        <FlatList
          data={filteredListings}
          keyExtractor={(item) => item.id}
          renderItem={renderListingCard}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyEmoji}>🌿</Text>
              <Text style={styles.emptyTitle}>No crops listed yet</Text>
              <Text style={styles.emptySubtitle}>Farmers haven't listed any crops yet. Check back soon!</Text>
            </View>
          }
        />
      )}

      {tab === 'wholesale' && (
        <FlatList
          data={filteredUnitSales}
          keyExtractor={(item) => item.id}
          renderItem={renderUnitSaleCard}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyEmoji}>🤝</Text>
              <Text style={styles.emptyTitle}>No wholesale sales available</Text>
              <Text style={styles.emptySubtitle}>Farmers haven't created any group sales yet.</Text>
            </View>
          }
        />
      )}

      {tab === 'orders' && (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderCard}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyEmoji}>📦</Text>
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySubtitle}>Your purchases will appear here.</Text>
            </View>
          }
        />
      )}

      {/* Buy Modal */}
      <Modal visible={!!buyTarget} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Buy{' '}
              {buyTarget?.type === 'listing'
                ? `${buyTarget?.item?.cropEmoji} ${buyTarget?.item?.cropName}`
                : `🌾 ${buyTarget?.item?.cropType}`}
            </Text>
            <Text style={styles.modalPrice}>
              {formatPrice(buyTarget?.item?.pricePerUnit, userProfile?.currency)}/{buyTarget?.type === 'listing' ? buyTarget?.item?.unit : 'kg'} wholesale
            </Text>
            <Text style={styles.modalLabel}>Quantity (kg):</Text>
            <TextInput
              style={styles.quantityInput}
              value={buyQuantity}
              onChangeText={setBuyQuantity}
              keyboardType="decimal-pad"
              placeholder={`Max: ${buyTarget?.type === 'listing' ? buyTarget?.item?.quantity : buyTarget?.item?.currentQuantity} kg`}
              placeholderTextColor={colors.textMuted}
              autoFocus
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={Keyboard.dismiss}
            />
            <TouchableOpacity onPress={Keyboard.dismiss} style={{ alignSelf: 'flex-end', marginBottom: spacing.sm }}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
            {buyQuantity && parseFloat(buyQuantity) > 0 && (
              <Text style={styles.totalPrice}>
                Total: {formatPrice(parseFloat(buyQuantity) * (buyTarget?.item?.pricePerUnit || 0), userProfile?.currency)}
              </Text>
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setBuyTarget(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, submitting && { opacity: 0.7 }]}
                onPress={handleBuy}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Confirm Purchase</Text>
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, minHeight: 300 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.md },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  filterBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
    maxHeight: 52,
  },
  filterBarContent: { paddingHorizontal: spacing.md, gap: 8, alignItems: 'center' },
  filterDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 4,
  },
  filterDropdownText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  filterChipRemove: { marginLeft: 2 },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    paddingLeft: spacing.md,
    paddingVertical: 6,
    paddingRight: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  filterChipEmoji: { fontSize: 16, marginRight: 4 },
  filterChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.sm },
  cardEmoji: { fontSize: 36 },
  cardTitle: { ...typography.h4, color: colors.textPrimary, marginBottom: 2 },
  sellerName: { fontSize: 12, color: colors.textMuted },
  orderDate: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  priceTag: { alignItems: 'flex-end' },
  priceText: { fontSize: 18, fontWeight: '800', color: colors.primary },
  priceUnit: { fontSize: 11, color: colors.textMuted },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm },
  stockText: { fontSize: 12, color: colors.textMuted },
  cardDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 3, gap: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progressText: { fontSize: 12, color: colors.textMuted },
  progressPct: { fontSize: 12, color: '#1565C0', fontWeight: '700' },
  progressBar: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: spacing.sm },
  progressFill: { height: '100%', backgroundColor: '#1565C0', borderRadius: 3 },
  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: 6,
    marginTop: spacing.sm,
    ...shadow.sm,
  },
  buyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { ...typography.h3, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  emptySubtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: 36,
  },
  modalTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: 4 },
  modalPrice: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.lg },
  modalLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },
  quantityInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    height: 52,
  },
  totalPrice: { fontSize: 16, fontWeight: '700', color: colors.primary, marginBottom: spacing.md },
  modalBtns: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  modalCancelBtn: { flex: 1, padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600' },
  modalSubmitBtn: { flex: 2, padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.primary, alignItems: 'center' },
  modalSubmitText: { color: '#fff', fontWeight: '700' },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  dropdownBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    minWidth: 220,
    maxHeight: 320,
    ...shadow.md,
  },
  dropdownTitle: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownList: { maxHeight: 260 },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  dropdownItemSelected: { backgroundColor: colors.primaryLighter + '40' },
  dropdownItemEmoji: { fontSize: 22, marginRight: spacing.sm },
  dropdownItemText: { fontSize: 15, color: colors.textPrimary, fontWeight: '500', flex: 1 },
  dropdownItemTextSelected: { color: colors.primary, fontWeight: '600' },
});
