import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
  Dimensions,
} from 'react-native';
import MapView, { Marker, Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getWeatherData, formatWeatherSummary } from '../../services/weatherService';
import { generateFarmingPlan } from '../../services/aiService';
import { savePlantingPlan, calculateFarmArea } from '../../services/plantService';
import { colors, spacing, borderRadius, typography, shadow } from '../../config/theme';

const { width } = Dimensions.get('window');

const CROPS = [
  { id: 'maize', name: 'Maize', emoji: '🌽' },
  { id: 'cassava', name: 'Cassava', emoji: '🥔' },
  { id: 'yam', name: 'Yam', emoji: '🍠' },
  { id: 'rice', name: 'Rice', emoji: '🌾' },
  { id: 'sorghum', name: 'Sorghum', emoji: '🌾' },
  { id: 'tomato', name: 'Tomato', emoji: '🍅' },
  { id: 'onion', name: 'Onion', emoji: '🧅' },
  { id: 'pepper', name: 'Pepper', emoji: '🌶️' },
  { id: 'groundnut', name: 'Groundnut', emoji: '🥜' },
  { id: 'cowpea', name: 'Cowpea', emoji: '🫘' },
  { id: 'plantain', name: 'Plantain', emoji: '🍌' },
  { id: 'okra', name: 'Okra', emoji: '🌿' },
  { id: 'millet', name: 'Millet', emoji: '🌾' },
  { id: 'cotton', name: 'Cotton', emoji: '🌱' },
  { id: 'sugarcane', name: 'Sugarcane', emoji: '🎋' },
  { id: 'cocoa', name: 'Cocoa', emoji: '🍫' },
];

const STEPS = ['Draw Farm', 'Select Crop', 'AI Plan', 'Review & Save'];

export default function PlantScreen() {
  const { user, userProfile } = useAuth();
  const mapRef = useRef(null);

  const [step, setStep] = useState(0);
  const [farmBoundary, setFarmBoundary] = useState([]);
  const [selectedCrop, setSelectedCrop] = useState(null);
  const [aiPlan, setAiPlan] = useState('');
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [region, setRegion] = useState({
    latitude: 6.5244,
    longitude: 3.3792,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });

  const farmArea = calculateFarmArea(farmBoundary);
  const farmCenter =
    farmBoundary.length > 0
      ? {
          lat: farmBoundary.reduce((s, c) => s + c.latitude, 0) / farmBoundary.length,
          lon: farmBoundary.reduce((s, c) => s + c.longitude, 0) / farmBoundary.length,
        }
      : null;

  const goToCurrentLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Location permission is needed to center the map on your farm.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const newRegion = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    };
    setRegion(newRegion);
    mapRef.current?.animateToRegion(newRegion, 800);
  };

  const handleMapPress = (e) => {
    const coord = e.nativeEvent.coordinate;
    setFarmBoundary((prev) => [...prev, coord]);
  };

  const undoLastPoint = () => {
    setFarmBoundary((prev) => prev.slice(0, -1));
  };

  const clearBoundary = () => {
    Alert.alert('Clear Boundary', 'Are you sure you want to clear all points?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => setFarmBoundary([]) },
    ]);
  };

  const proceedToStep2 = () => {
    if (farmBoundary.length < 3) {
      Alert.alert('Draw Your Farm', 'Please tap at least 3 points on the map to outline your farm boundary.');
      return;
    }
    setStep(1);
  };

  const generatePlan = async () => {
    if (!selectedCrop) return;
    setStep(2);
    setLoading(true);
    try {
      let weatherData = null;
      let weatherSummary = 'Weather data unavailable';
      if (farmCenter) {
        try {
          weatherData = await getWeatherData(farmCenter.lat, farmCenter.lon);
          weatherSummary = formatWeatherSummary(weatherData);
          setWeather(weatherData);
        } catch {
          // Weather optional – continue without it
        }
      }
      const plan = await generateFarmingPlan({
        crop: selectedCrop.name,
        farmAreaHectares: farmArea,
        lat: farmCenter?.lat || region.latitude,
        lon: farmCenter?.lon || region.longitude,
        weatherSummary,
      });
      setAiPlan(plan);
    } catch (error) {
      Alert.alert(
        'Plan Generation Failed',
        error.message || 'Could not generate plan. Check your OpenAI API key in src/config/api.js.',
        [{ text: 'OK', onPress: () => setStep(1) }]
      );
    } finally {
      setLoading(false);
    }
  };

  const savePlan = async () => {
    setSaving(true);
    try {
      await savePlantingPlan(user.uid, {
        farmerName: userProfile?.name || 'Farmer',
        cropType: selectedCrop.id,
        cropName: selectedCrop.name,
        cropEmoji: selectedCrop.emoji,
        farmBoundary,
        farmAreaHectares: farmArea,
        centerLat: farmCenter?.lat || region.latitude,
        centerLon: farmCenter?.lon || region.longitude,
        aiPlan,
        weatherSummary: weather ? formatWeatherSummary(weather) : null,
      });
      Alert.alert('Plan Saved!', 'Your planting plan is now active. Track it in the Inventory tab.', [
        {
          text: 'OK',
          onPress: () => {
            setStep(0);
            setFarmBoundary([]);
            setSelectedCrop(null);
            setAiPlan('');
            setWeather(null);
          },
        },
      ]);
    } catch (error) {
      Alert.alert('Save Failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Step Indicator ─────────────────────────────────────────────────────
  const StepIndicator = () => (
    <View style={styles.stepIndicator}>
      {STEPS.map((label, idx) => (
        <View key={idx} style={styles.stepItem}>
          <View style={[styles.stepDot, idx <= step && styles.stepDotActive, idx === step && styles.stepDotCurrent]}>
            {idx < step ? (
              <Ionicons name="checkmark" size={12} color="#fff" />
            ) : (
              <Text style={[styles.stepDotText, idx <= step && { color: '#fff' }]}>{idx + 1}</Text>
            )}
          </View>
          {idx < STEPS.length - 1 && (
            <View style={[styles.stepLine, idx < step && styles.stepLineActive]} />
          )}
        </View>
      ))}
    </View>
  );

  // ─── Step 0: Map Drawing ─────────────────────────────────────────────────
  if (step === 0) {
    return (
      <View style={{ flex: 1 }}>
        <StepIndicator />
        <View style={styles.mapInstructions}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text style={styles.mapInstructionText}>
            {farmBoundary.length === 0
              ? 'Tap on the map to mark your farm boundary'
              : `${farmBoundary.length} point${farmBoundary.length !== 1 ? 's' : ''} added${
                  farmBoundary.length >= 3 ? ` — Area: ~${farmArea.toFixed(2)} ha` : ' (need at least 3)'
                }`}
          </Text>
        </View>

        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          region={region}
          onRegionChangeComplete={setRegion}
          onPress={handleMapPress}
          onMapReady={() => setMapReady(true)}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {farmBoundary.map((coord, idx) => (
            <Marker
              key={idx}
              coordinate={coord}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.mapMarker}>
                <Text style={styles.mapMarkerText}>{idx + 1}</Text>
              </View>
            </Marker>
          ))}
          {farmBoundary.length >= 3 && (
            <Polygon
              coordinates={farmBoundary}
              fillColor="rgba(46,125,50,0.2)"
              strokeColor={colors.primary}
              strokeWidth={2}
            />
          )}
        </MapView>

        {/* Map controls */}
        <View style={styles.mapControls}>
          <TouchableOpacity style={styles.mapControlBtn} onPress={goToCurrentLocation}>
            <Ionicons name="locate" size={22} color={colors.primary} />
          </TouchableOpacity>
          {farmBoundary.length > 0 && (
            <TouchableOpacity style={styles.mapControlBtn} onPress={undoLastPoint}>
              <Ionicons name="arrow-undo" size={22} color={colors.warning} />
            </TouchableOpacity>
          )}
          {farmBoundary.length > 0 && (
            <TouchableOpacity style={styles.mapControlBtn} onPress={clearBoundary}>
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.stepFooter}>
          <TouchableOpacity
            style={[styles.nextBtn, farmBoundary.length < 3 && styles.nextBtnDisabled]}
            onPress={proceedToStep2}
            disabled={farmBoundary.length < 3}
          >
            <Text style={styles.nextBtnText}>Next: Select Crop</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Step 1: Crop Selection ───────────────────────────────────────────────
  if (step === 1) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StepIndicator />
        <Text style={styles.stepTitle}>What do you want to plant?</Text>
        <FlatList
          data={CROPS}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.cropGrid}
          renderItem={({ item }) => {
            const isSelected = selectedCrop?.id === item.id;
            return (
              <TouchableOpacity
                style={[styles.cropCard, isSelected && styles.cropCardSelected]}
                onPress={() => setSelectedCrop(item)}
                activeOpacity={0.75}
              >
                <Text style={styles.cropEmoji}>{item.emoji}</Text>
                <Text style={[styles.cropName, isSelected && { color: colors.primary, fontWeight: '700' }]}>
                  {item.name}
                </Text>
                {isSelected && (
                  <View style={styles.cropCheck}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
        <View style={styles.stepFooter}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(0)}>
            <Ionicons name="arrow-back" size={18} color={colors.primary} />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.nextBtn, !selectedCrop && styles.nextBtnDisabled]}
            onPress={generatePlan}
            disabled={!selectedCrop}
          >
            <Text style={styles.nextBtnText}>Generate AI Plan</Text>
            <Ionicons name="sparkles" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Step 2: AI Plan ─────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StepIndicator />
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingTitle}>Generating Your Plan</Text>
            <Text style={styles.loadingSubtitle}>
              Analyzing weather, soil conditions, and best practices for {selectedCrop?.name}...
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.md }}>
            {/* Summary card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryEmoji}>{selectedCrop?.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryTitle}>{selectedCrop?.name} Plan</Text>
                  <Text style={styles.summaryMeta}>
                    Farm area: ~{farmArea.toFixed(2)} ha
                  </Text>
                </View>
              </View>
              {weather && (
                <View style={styles.weatherChip}>
                  <Ionicons name="partly-sunny-outline" size={14} color={colors.earth} />
                  <Text style={styles.weatherText}>{formatWeatherSummary(weather)}</Text>
                </View>
              )}
            </View>

            {/* AI Plan text */}
            <View style={styles.planCard}>
              <Text style={styles.planText}>{aiPlan}</Text>
            </View>

            <View style={[styles.stepFooter, { paddingHorizontal: 0 }]}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                <Ionicons name="arrow-back" size={18} color={colors.primary} />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(3)}>
                <Text style={styles.nextBtnText}>Review & Save</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    );
  }

  // ─── Step 3: Review & Save ────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StepIndicator />
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.stepTitle}>Review Your Plan</Text>

        <View style={styles.reviewCard}>
          <ReviewRow icon="leaf-outline" label="Crop" value={`${selectedCrop?.emoji} ${selectedCrop?.name}`} />
          <ReviewRow icon="map-outline" label="Farm Area" value={`~${farmArea.toFixed(2)} hectares`} />
          <ReviewRow icon="pin-outline" label="Boundary Points" value={`${farmBoundary.length} points marked`} />
          {weather && (
            <ReviewRow
              icon="partly-sunny-outline"
              label="Current Weather"
              value={formatWeatherSummary(weather)}
            />
          )}
        </View>

        <View style={[styles.planCard, { maxHeight: 200 }]}>
          <Text style={[styles.planText, { fontSize: 13 }]} numberOfLines={10}>
            {aiPlan}
          </Text>
        </View>

        <Text style={styles.reviewNote}>
          Once saved, this plan will appear in your Inventory tab. Mark it as harvested when your crop is ready to add to your inventory.
        </Text>

        <View style={[styles.stepFooter, { paddingHorizontal: 0 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
            <Ionicons name="arrow-back" size={18} color={colors.primary} />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.nextBtn, saving && { opacity: 0.7 }]}
            onPress={savePlan}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.nextBtnText}>Save Plan</Text>
                <Ionicons name="checkmark" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function ReviewRow({ icon, label, value }) {
  return (
    <View style={styles.reviewRow}>
      <Ionicons name={icon} size={18} color={colors.primary} style={{ marginRight: spacing.sm }} />
      <Text style={styles.reviewLabel}>{label}:</Text>
      <Text style={styles.reviewValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: { backgroundColor: colors.primaryLight },
  stepDotCurrent: { backgroundColor: colors.primary, ...shadow.sm },
  stepDotText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  stepLine: { width: 28, height: 2, backgroundColor: colors.border, marginHorizontal: 2 },
  stepLineActive: { backgroundColor: colors.primaryLight },

  mapInstructions: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: '#E8F5E9',
    gap: 6,
  },
  mapInstructionText: { fontSize: 13, color: colors.primaryDark, flex: 1 },
  mapMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  mapMarkerText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  mapControls: {
    position: 'absolute',
    right: spacing.md,
    top: 100,
    gap: 8,
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.md,
  },

  stepTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  stepFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    gap: 4,
  },
  backBtnText: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: 6,
    ...shadow.sm,
  },
  nextBtnDisabled: { backgroundColor: colors.border },
  nextBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  cropGrid: { padding: spacing.md, gap: spacing.sm },
  cropCard: {
    flex: 1,
    margin: 4,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    position: 'relative',
    minHeight: 80,
    justifyContent: 'center',
    ...shadow.sm,
  },
  cropCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#E8F5E9',
  },
  cropEmoji: { fontSize: 30, marginBottom: 4 },
  cropName: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  cropCheck: { position: 'absolute', top: 4, right: 4 },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  loadingTitle: { ...typography.h3, color: colors.textPrimary, textAlign: 'center' },
  loadingSubtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },

  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  summaryEmoji: { fontSize: 40 },
  summaryTitle: { ...typography.h3, color: colors.textPrimary },
  summaryMeta: { ...typography.caption, color: colors.textMuted },
  weatherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.sand,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    gap: 4,
    alignSelf: 'flex-start',
  },
  weatherText: { fontSize: 12, color: colors.earth },

  planCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  planText: { fontSize: 14, color: colors.textPrimary, lineHeight: 22 },

  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reviewLabel: { fontSize: 13, color: colors.textMuted, width: 110 },
  reviewValue: { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  reviewNote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
    padding: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.sand,
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    paddingLeft: spacing.md,
  },
});
