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
  getActiveListings,
  getAllUnitSales,
  buyListing,
  buyUnitSale,
  getMyOrders,
} from '../../services/marketService';
import { colors, spacing, borderRadius, typography, shadow } from '../../config/theme';

const CROP_FILTERS = ['All', 'Maize', 'Rice', 'Tomato', 'Cassava', 'Yam', 'Onion', 'Pepper', 'Groundnut'];

export default function BuyerMarketScreen() {
  const { user, userProfile } = useAuth();
  const [tab, setTab] = useState('individual'); // 'individual' | 'wholesale' | 'orders'
  const [listings, setListings] = useState([]);
  const [unitSales, setUnitSales] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cropFilter, setCropFilter] = useState('All');

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

  const filteredListings = cropFilter === 'All'
    ? listings
    : listings.filter((l) => l.cropName?.toLowerCase().includes(cropFilter.toLowerCase()));

  const filteredUnitSales = cropFilter === 'All'
    ? unitSales
    : unitSales.filter((s) => s.cropType?.toLowerCase().includes(cropFilter.toLowerCase()));

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
      `Buy ${qty} ${type === 'listing' ? item.unit : 'kg'} of ${type === 'listing' ? item.cropName : item.cropType} for GH₵${totalPrice.toFixed(2)}?`,
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
          <Text style={styles.priceText}>GH₵{item.pricePerUnit}</Text>
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
            <Text style={styles.priceText}>GH₵{item.pricePerUnit}</Text>
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
              {item.quantity} kg • GH₵{item.totalPrice?.toFixed(2)}
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

      {/* Crop filter (only for individual/wholesale) */}
      {tab !== 'orders' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterBar}
          contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 8 }}
        >
          {CROP_FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, cropFilter === f && styles.filterChipActive]}
              onPress={() => setCropFilter(f)}
            >
              <Text style={[styles.filterChipText, cropFilter === f && styles.filterChipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

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
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Buy{' '}
              {buyTarget?.type === 'listing'
                ? `${buyTarget?.item?.cropEmoji} ${buyTarget?.item?.cropName}`
                : `🌾 ${buyTarget?.item?.cropType}`}
            </Text>
            <Text style={styles.modalPrice}>
              GH₵{buyTarget?.item?.pricePerUnit}/{buyTarget?.type === 'listing' ? buyTarget?.item?.unit : 'kg'} wholesale
            </Text>
            <Text style={styles.modalLabel}>Quantity (kg):</Text>
            <TextInput
              style={styles.quantityInput}
              value={buyQuantity}
              onChangeText={setBuyQuantity}
              keyboardType="numeric"
              placeholder={`Max: ${buyTarget?.type === 'listing' ? buyTarget?.item?.quantity : buyTarget?.item?.currentQuantity} kg`}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            {buyQuantity && parseFloat(buyQuantity) > 0 && (
              <Text style={styles.totalPrice}>
                Total: GH₵{(parseFloat(buyQuantity) * (buyTarget?.item?.pricePerUnit || 0)).toFixed(2)}
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
  filterBar: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm, maxHeight: 52 },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
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
});
