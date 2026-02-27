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
import { getOpenJobs, applyForJob } from '../../services/jobService';
import { colors, spacing, borderRadius, typography, shadow } from '../../config/theme';

const TASK_ICONS = {
  planting: '🌱', harvesting: '🌾', irrigation: '💧',
  pest_control: '🐛', fertilizing: '🧪', other: '🔧',
};

export default function ContractorJobsScreen() {
  const { user, userProfile } = useAuth();
  const [tab, setTab] = useState('browse'); // 'browse' | 'applied'
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applyingTo, setApplyingTo] = useState(null);
  const [applyMessage, setApplyMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getOpenJobs();
      setJobs(data);
    } catch {
      Alert.alert('Error', 'Failed to load jobs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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

  const myApplications = jobs.filter((j) =>
    j.applicants?.some((a) => a.contractorId === user.uid)
  );

  const alreadyApplied = (job) =>
    job.applicants?.some((a) => a.contractorId === user.uid);

  const isAccepted = (job) =>
    job.acceptedContractorId === user.uid;

  const handleApply = async () => {
    if (!applyingTo) return;
    setSubmitting(true);
    try {
      await applyForJob(
        applyingTo.id,
        user.uid,
        userProfile?.name || 'Contractor',
        applyMessage.trim()
      );
      setApplyingTo(null);
      setApplyMessage('');
      Alert.alert('Application Sent!', 'The farmer will review your application.');
      load();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderJobCard = ({ item, isApplied }) => {
    const taskEmoji = TASK_ICONS[item.taskType] || '🔧';
    const applied = isApplied || alreadyApplied(item);
    const accepted = isAccepted(item);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>{taskEmoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.farmerName}>Posted by {item.farmerName}</Text>
          </View>
          {accepted && (
            <View style={[styles.badge, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="checkmark-circle" size={12} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>Accepted</Text>
            </View>
          )}
          {applied && !accepted && (
            <View style={[styles.badge, { backgroundColor: '#FFF3E0' }]}>
              <Text style={[styles.badgeText, { color: colors.warning }]}>Applied</Text>
            </View>
          )}
        </View>

        {item.description ? (
          <Text style={styles.cardDesc} numberOfLines={3}>{item.description}</Text>
        ) : null}

        <View style={styles.infoGrid}>
          <InfoChip icon="location-outline" text={item.location} />
          <InfoChip icon="cash-outline" text={`GH₵${item.pay}/${item.payPeriod?.replace('_', ' ')}`} />
          {item.cropType ? <InfoChip icon="leaf-outline" text={item.cropType} /> : null}
          {item.duration ? <InfoChip icon="time-outline" text={item.duration} /> : null}
        </View>

        {!applied && (
          <TouchableOpacity
            style={styles.applyBtn}
            onPress={() => {
              setApplyMessage('');
              setApplyingTo(item);
            }}
          >
            <Ionicons name="send-outline" size={16} color="#fff" />
            <Text style={styles.applyBtnText}>Apply for this Job</Text>
          </TouchableOpacity>
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

  const displayData = tab === 'browse' ? jobs : myApplications;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'browse' && styles.tabActive]}
          onPress={() => setTab('browse')}
        >
          <Ionicons name="search-outline" size={16} color={tab === 'browse' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, tab === 'browse' && styles.tabTextActive]}>
            Browse Jobs ({jobs.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'applied' && styles.tabActive]}
          onPress={() => setTab('applied')}
        >
          <Ionicons name="document-text-outline" size={16} color={tab === 'applied' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, tab === 'applied' && styles.tabTextActive]}>
            My Applications ({myApplications.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => renderJobCard({ item, isApplied: tab === 'applied' })}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyEmoji}>{tab === 'browse' ? '🔍' : '📄'}</Text>
            <Text style={styles.emptyTitle}>
              {tab === 'browse' ? 'No jobs available' : 'No applications yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {tab === 'browse'
                ? 'Check back soon — farmers will post jobs here.'
                : 'Browse jobs and apply to see them here.'}
            </Text>
          </View>
        }
      />

      {/* Apply Modal */}
      <Modal visible={!!applyingTo} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apply: {applyingTo?.title}</Text>
              <TouchableOpacity onPress={() => setApplyingTo(null)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Send a message to {applyingTo?.farmerName} introducing yourself (optional):
            </Text>
            <TextInput
              style={styles.applyInput}
              value={applyMessage}
              onChangeText={setApplyMessage}
              placeholder="Introduce yourself, your experience, and why you're a good fit..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setApplyingTo(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, submitting && { opacity: 0.7 }]}
                onPress={handleApply}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Send Application</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoChip({ icon, text }) {
  return (
    <View style={styles.infoChip}>
      <Ionicons name={icon} size={13} color={colors.textMuted} />
      <Text style={styles.infoChipText}>{text}</Text>
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
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: 6,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  cardEmoji: { fontSize: 32 },
  cardTitle: { ...typography.h4, color: colors.textPrimary, marginBottom: 2 },
  farmerName: { fontSize: 12, color: colors.textMuted },
  cardDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    gap: 4,
  },
  infoChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 3, gap: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: 6,
    ...shadow.sm,
  },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
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
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  modalTitle: { ...typography.h3, color: colors.textPrimary, flex: 1 },
  modalSubtitle: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  applyInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
    minHeight: 120,
    marginBottom: spacing.md,
  },
  modalBtns: { flexDirection: 'row', gap: spacing.md },
  modalCancelBtn: { flex: 1, padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600' },
  modalSubmitBtn: { flex: 2, padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.primary, alignItems: 'center' },
  modalSubmitText: { color: '#fff', fontWeight: '700' },
});
