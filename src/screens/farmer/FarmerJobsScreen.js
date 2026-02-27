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
import { createJob, getMyJobs, acceptApplicant, closeJob } from '../../services/jobService';
import { colors, spacing, borderRadius, typography, shadow } from '../../config/theme';

const TASK_TYPES = [
  { id: 'planting', label: 'Planting', emoji: '🌱' },
  { id: 'harvesting', label: 'Harvesting', emoji: '🌾' },
  { id: 'irrigation', label: 'Irrigation', emoji: '💧' },
  { id: 'pest_control', label: 'Pest Control', emoji: '🐛' },
  { id: 'fertilizing', label: 'Fertilizing', emoji: '🧪' },
  { id: 'other', label: 'Other', emoji: '🔧' },
];

const PAY_PERIODS = ['per_day', 'per_task', 'per_kg'];

const STATUS_COLORS = {
  open: { color: colors.primary, bg: '#E8F5E9' },
  filled: { color: '#1565C0', bg: '#E3F2FD' },
  completed: { color: colors.textMuted, bg: colors.border },
};

export default function FarmerJobsScreen() {
  const { user, userProfile } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedJob, setExpandedJob] = useState(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    cropType: '',
    taskType: '',
    pay: '',
    payPeriod: 'per_day',
    location: '',
    duration: '',
  });

  const load = useCallback(async () => {
    try {
      const data = await getMyJobs(user.uid);
      setJobs(data);
    } catch {
      Alert.alert('Error', 'Failed to load jobs.');
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

  const resetForm = () => {
    setForm({ title: '', description: '', cropType: '', taskType: '', pay: '', payPeriod: 'per_day', location: '', duration: '' });
  };

  const submitJob = async () => {
    const { title, description, cropType, taskType, pay, payPeriod, location, duration } = form;
    if (!title || !taskType || !pay || !location) {
      Alert.alert('Missing Fields', 'Please fill in title, task type, pay, and location.');
      return;
    }
    setSubmitting(true);
    try {
      await createJob(user.uid, userProfile?.name || 'Farmer', {
        title,
        description,
        cropType,
        taskType,
        pay: parseFloat(pay),
        payPeriod,
        location,
        duration,
      });
      setShowModal(false);
      resetForm();
      Alert.alert('Job Posted!', 'Contractors can now see and apply for your job.');
      load();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = (job, applicant) => {
    Alert.alert(
      'Accept Applicant',
      `Accept ${applicant.contractorName} for this job?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            await acceptApplicant(job.id, applicant.contractorId);
            Alert.alert('Accepted!', `${applicant.contractorName} has been accepted for the job.`);
            load();
          },
        },
      ]
    );
  };

  const handleClose = (jobId) => {
    Alert.alert('Mark Completed', 'Mark this job as completed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: async () => {
          await closeJob(jobId);
          load();
        },
      },
    ]);
  };

  const renderJobCard = ({ item }) => {
    const statusCfg = STATUS_COLORS[item.status] || STATUS_COLORS.open;
    const taskType = TASK_TYPES.find((t) => t.id === item.taskType);
    const isExpanded = expandedJob === item.id;
    return (
      <View style={styles.card}>
        <TouchableOpacity onPress={() => setExpandedJob(isExpanded ? null : item.id)} activeOpacity={0.8}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>{taskType?.emoji || '🔧'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {item.location} • GH₵{item.pay}/{item.payPeriod.replace('_', ' ')}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: statusCfg.bg }]}>
              <Text style={[styles.badgeText, { color: statusCfg.color }]}>{item.status}</Text>
            </View>
          </View>
          {item.description ? (
            <Text style={styles.cardDesc} numberOfLines={isExpanded ? undefined : 2}>{item.description}</Text>
          ) : null}
          <View style={styles.cardTags}>
            {item.cropType ? (
              <View style={styles.tag}><Text style={styles.tagText}>{item.cropType}</Text></View>
            ) : null}
            {item.taskType ? (
              <View style={styles.tag}><Text style={styles.tagText}>{taskType?.label}</Text></View>
            ) : null}
            {item.duration ? (
              <View style={styles.tag}><Text style={styles.tagText}>{item.duration}</Text></View>
            ) : null}
            <View style={styles.tag}>
              <Ionicons name="people-outline" size={12} color={colors.textMuted} />
              <Text style={styles.tagText}>{item.applicants?.length || 0} applicant(s)</Text>
            </View>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <>
            {item.applicants?.length > 0 ? (
              <View style={styles.applicantsList}>
                <Text style={styles.applicantsTitle}>Applicants</Text>
                {item.applicants.map((applicant, idx) => (
                  <View key={idx} style={styles.applicantRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.applicantName}>{applicant.contractorName}</Text>
                      {applicant.message ? (
                        <Text style={styles.applicantMsg}>{applicant.message}</Text>
                      ) : null}
                    </View>
                    {item.status === 'open' && applicant.status === 'pending' && (
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => handleAccept(item, applicant)}
                      >
                        <Text style={styles.acceptBtnText}>Accept</Text>
                      </TouchableOpacity>
                    )}
                    {applicant.contractorId === item.acceptedContractorId && (
                      <View style={[styles.badge, { backgroundColor: '#E8F5E9' }]}>
                        <Text style={[styles.badgeText, { color: colors.primary }]}>Accepted</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.noApplicants}>No applicants yet.</Text>
            )}
            {item.status === 'filled' && (
              <TouchableOpacity style={styles.closeBtn} onPress={() => handleClose(item.id)}>
                <Text style={styles.closeBtnText}>Mark as Completed</Text>
              </TouchableOpacity>
            )}
          </>
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
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        renderItem={renderJobCard}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyEmoji}>💼</Text>
            <Text style={styles.emptyTitle}>No jobs posted yet</Text>
            <Text style={styles.emptySubtitle}>Post a job to hire contractors for your farm.</Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Post Job Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Post a Job</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <FormInput label="Job Title *" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="e.g., Need 5 workers for maize harvest" />
            <FormInput label="Description" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Describe the work in detail..." multiline />
            <FormInput label="Crop Type" value={form.cropType} onChangeText={(v) => setForm({ ...form, cropType: v })} placeholder="e.g., Maize, Tomato" />

            <Text style={styles.fieldLabel}>Task Type *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
              {TASK_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.taskChip, form.taskType === t.id && styles.taskChipActive]}
                  onPress={() => setForm({ ...form, taskType: t.id })}
                >
                  <Text style={styles.taskChipEmoji}>{t.emoji}</Text>
                  <Text style={[styles.taskChipText, form.taskType === t.id && { color: colors.primary, fontWeight: '700' }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <FormInput label="Pay (GH₵) *" value={form.pay} onChangeText={(v) => setForm({ ...form, pay: v })} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Pay Period</Text>
                {PAY_PERIODS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.radioRow, form.payPeriod === p && styles.radioRowActive]}
                    onPress={() => setForm({ ...form, payPeriod: p })}
                  >
                    <View style={[styles.radio, form.payPeriod === p && styles.radioActive]} />
                    <Text style={styles.radioText}>{p.replace('_', ' ')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <FormInput label="Location *" value={form.location} onChangeText={(v) => setForm({ ...form, location: v })} placeholder="Town, Region" />
            <FormInput label="Duration" value={form.duration} onChangeText={(v) => setForm({ ...form, duration: v })} placeholder="e.g., 3 days, 1 week" />

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={submitJob}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Post Job</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function FormInput({ label, value, onChangeText, placeholder, keyboardType, multiline }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
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
          minHeight: multiline ? 80 : 44,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, minHeight: 300 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  cardEmoji: { fontSize: 30 },
  cardTitle: { ...typography.h4, color: colors.textPrimary, marginBottom: 2 },
  cardMeta: { ...typography.caption, color: colors.textMuted },
  cardDesc: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm, lineHeight: 20 },
  cardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 3, gap: 3 },
  tagText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 3, gap: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  applicantsList: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  applicantsTitle: { ...typography.h4, color: colors.textPrimary, marginBottom: spacing.sm },
  applicantRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  applicantName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  applicantMsg: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  acceptBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.sm, paddingHorizontal: spacing.md, paddingVertical: 6 },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  noApplicants: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm, fontStyle: 'italic' },
  closeBtn: { marginTop: spacing.md, padding: spacing.sm, borderRadius: borderRadius.md, backgroundColor: colors.earth, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontWeight: '700' },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { ...typography.h3, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  emptySubtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.md,
  },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { ...typography.h3, color: colors.textPrimary },
  fieldLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 6, fontWeight: '600' },
  taskChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: 8, marginRight: spacing.sm, gap: 6, borderWidth: 1, borderColor: colors.border },
  taskChipActive: { borderColor: colors.primary, backgroundColor: '#E8F5E9' },
  taskChipEmoji: { fontSize: 16 },
  taskChipText: { fontSize: 13, color: colors.textSecondary },
  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 6 },
  radioRowActive: {},
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.border },
  radioActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  radioText: { fontSize: 13, color: colors.textSecondary },
  submitBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.sm, ...shadow.sm },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
