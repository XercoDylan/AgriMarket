import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import MapView, { Marker, Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getWeatherData, formatWeatherSummary } from '../../services/weatherService';
import { generateFarmingPlan } from '../../services/aiService';
import { savePlantingPlan, calculateFarmArea, orderBoundaryPoints } from '../../services/plantService';
import { colors, spacing, borderRadius, typography, shadow } from '../../config/theme';

// Edge padding when fitting map to boundary so the last corner isn't hidden by footer/controls
const MAP_FIT_PADDING = { top: 80, right: 60, bottom: 120, left: 40 };

const CROPS = [
  { id: 'maize', name: 'Maize', emoji: '\u{1F33D}' },
  { id: 'cassava', name: 'Cassava', emoji: '\u{1F954}' },
  { id: 'yam', name: 'Yam', emoji: '\u{1F360}' },
  { id: 'rice', name: 'Rice', emoji: '\u{1F35A}' },
  { id: 'sorghum', name: 'Sorghum', emoji: '\u{1F33E}' },
  { id: 'tomato', name: 'Tomato', emoji: '\u{1F345}' },
  { id: 'onion', name: 'Onion', emoji: '\u{1F9C5}' },
  { id: 'pepper', name: 'Pepper', emoji: '\u{1F336}\uFE0F' },
  { id: 'groundnut', name: 'Groundnut', emoji: '\u{1F95C}' },
  { id: 'cowpea', name: 'Cowpea', emoji: '\u{1FAD8}' },
  { id: 'plantain', name: 'Plantain', emoji: '\u{1F34C}' },
  { id: 'okra', name: 'Okra', emoji: '\u{1F33F}' },
  { id: 'millet', name: 'Millet', emoji: '\u{1F33E}' },
  { id: 'cotton', name: 'Cotton', emoji: '\u{1F331}' },
  { id: 'sugarcane', name: 'Sugarcane', emoji: '\u{1F38B}' },
  { id: 'cocoa', name: 'Cocoa', emoji: '\u{1F36B}' },
];

const STEPS = ['Draw Farm', 'Select Crop', 'AI Plan', 'Review & Save'];

function parsePlanSections(planText) {
  if (!planText || typeof planText !== 'string') return [];

  const lines = planText.replace(/\r/g, '').split('\n');
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headingMatch =
      line.match(/^\d+\.\s*\*\*(.+?)\*\*\s*-?\s*(.*)$/) ||
      line.match(/^\d+\.\s*(.+?):\s*(.*)$/) ||
      line.match(/^(?:step\s*)?\d+\s*[-.:)]\s*(.+?)(?::\s*(.*))?$/i);

    if (headingMatch) {
      if (current) sections.push(current);
      current = {
        title: headingMatch[1].trim(),
        content: headingMatch[2]?.trim() || '',
        actionItems: [],
      };
      continue;
    }

    const actionMatch = line.match(/^(?:[-*]\s+|\d+[\).]\s+)(.+)$/);
    if (actionMatch) {
      if (!current) {
        current = { title: 'Plan Overview', content: '', actionItems: [] };
      }
      current.actionItems.push(actionMatch[1].trim());
      continue;
    }

    if (!current) {
      current = { title: 'Plan Overview', content: line, actionItems: [] };
    } else {
      current.content = `${current.content}${current.content ? '\n' : ''}${line}`.trim();
    }
  }

  if (current) sections.push(current);
  return sections
    .map((section) => {
      if (section.actionItems.length > 0) return section;

      const fallbackActions = section.content
        .split(/\n|;\s+|\.\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 8)
        .slice(0, 3);

      return {
        ...section,
        actionItems: fallbackActions,
      };
    })
    .filter((s) => s.content || s.actionItems.length > 0);
}
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

  const orderedBoundary = orderBoundaryPoints(farmBoundary);
  const farmArea = calculateFarmArea(orderedBoundary);
  const planSections = parsePlanSections(aiPlan);
  const [completedActions, setCompletedActions] = useState({});
  const [expandedSections, setExpandedSections] = useState({});

  const farmCenter =
    farmBoundary.length > 0
      ? {
          lat: farmBoundary.reduce((s, c) => s + c.latitude, 0) / farmBoundary.length,
          lon: farmBoundary.reduce((s, c) => s + c.longitude, 0) / farmBoundary.length,
        }
      : null;

  useEffect(() => {
    if (planSections.length > 0) {
      setCompletedActions({});
      setExpandedSections({ 0: true });
      return;
    }
    setCompletedActions({});
    setExpandedSections({});
  }, [aiPlan]);

  const getActionKey = (sectionIdx, actionIdx) => `${sectionIdx}-${actionIdx}`;
  const getCompletedActionsForSection = (section, sectionIdx) =>
    section.actionItems.filter((_, actionIdx) => completedActions[getActionKey(sectionIdx, actionIdx)]).length;
  const isSectionCompleted = (section, sectionIdx) =>
    section.actionItems.length > 0 &&
    getCompletedActionsForSection(section, sectionIdx) === section.actionItems.length;
  const totalActionCount = planSections.reduce((sum, section) => sum + section.actionItems.length, 0);
  const completedActionCount = planSections.reduce(
    (sum, section, sectionIdx) => sum + getCompletedActionsForSection(section, sectionIdx),
    0
  );
  const progressPercent = totalActionCount > 0 ? Math.round((completedActionCount / totalActionCount) * 100) : 0;
  const nextIncompleteSectionIdx = planSections.findIndex((section, idx) => !isSectionCompleted(section, idx));
  const getSectionTip = (section) => {
    const source = section?.content?.trim();
    if (!source) return null;
    const firstSentence = source.split(/(?<=[.!?])\s+/)[0]?.trim() || source;
    return firstSentence.length > 140 ? `${firstSentence.slice(0, 137)}...` : firstSentence;
  };

  // Fit map to show all boundary points so the last numbered corner is visible.
  // Only fit when the new point is outside the current view (or first point) to avoid delay on tap.
  useEffect(() => {
    if (step !== 0 || farmBoundary.length === 0 || !mapRef.current) return;
    const lastPoint = farmBoundary[farmBoundary.length - 1];
    // If we already have points and the new one is within the visible region (with margin), skip fit
    const margin = 0.3;
    const latHalf = region.latitudeDelta * (0.5 - margin);
    const lonHalf = region.longitudeDelta * (0.5 - margin);
    const isNewPointVisible =
      Math.abs(lastPoint.latitude - region.latitude) <= latHalf &&
      Math.abs(lastPoint.longitude - region.longitude) <= lonHalf;
    if (farmBoundary.length > 1 && isNewPointVisible) return;

    mapRef.current.fitToCoordinates(farmBoundary, {
      edgePadding: MAP_FIT_PADDING,
      animated: false,
    });
  }, [step, farmBoundary.length]);

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
          // Weather optional - continue without it
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
      const message =
        typeof error === 'string'
          ? error
          : error?.message || 'Could not generate plan. Verify Claude API key, model, and internet connection.';
      console.error('Plan generation error:', error);
      Alert.alert(
        'Plan Generation Failed',
        message,
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
        farmBoundary: orderedBoundary,
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

  // Step Indicator
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

  // Step 0: Map Drawing
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
                  farmBoundary.length >= 3 ? ` - Area: ~${farmArea.toFixed(2)} ha` : ' (need at least 3)'
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
          {orderedBoundary.length >= 3 && (
            <Polygon
              coordinates={orderedBoundary}
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

  // Step 1: Crop Selection
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

  // Step 2: AI Plan
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

            {/* Interactive AI plan */}
            {planSections.length > 0 ? (
<<<<<<< HEAD
              <>
                <View style={styles.progressCard}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressTitle}>Plan Progress</Text>
                    <Text style={styles.progressMeta}>
                      {completedActionCount}/{totalActionCount} tasks complete
                    </Text>
=======
              planSections.map((section, idx) => (
                <View key={`${section.title}-${idx}`} style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionIndexCircle}>
                      <Text style={styles.sectionIndexText}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
>>>>>>> 110819eed8d562189b7d2893abeb1777c963b73f
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                  </View>
                  <Text style={styles.progressSubtitle}>
                    {progressPercent === 100
                      ? 'All action items completed. You can save this plan.'
                      : `Complete the checklist below to stay on track (${progressPercent}%).`}
                  </Text>
                  {nextIncompleteSectionIdx >= 0 && (
                    <TouchableOpacity
                      style={styles.jumpBtn}
                      onPress={() =>
                        setExpandedSections((prev) => ({ ...prev, [nextIncompleteSectionIdx]: true }))
                      }
                    >
                      <Ionicons name="navigate" size={15} color={colors.info} />
                      <Text style={styles.jumpBtnText}>
                        Focus next step: {nextIncompleteSectionIdx + 1}. {planSections[nextIncompleteSectionIdx].title}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {planSections.map((section, idx) => {
                  const completedInSection = getCompletedActionsForSection(section, idx);
                  const done = isSectionCompleted(section, idx);
                  const isExpanded = !!expandedSections[idx];

                  const toggleAction = (actionIdx) => {
                    setCompletedActions((prev) => {
                      const key = getActionKey(idx, actionIdx);
                      return { ...prev, [key]: !prev[key] };
                    });
                  };

                  const markStepDone = () => {
                    setCompletedActions((prev) => {
                      const next = { ...prev };
                      section.actionItems.forEach((_, actionIdx) => {
                        next[getActionKey(idx, actionIdx)] = true;
                      });
                      return next;
                    });
                  };

                  const goNextStep = () => {
                    if (idx >= planSections.length - 1) return;
                    setExpandedSections((prev) => ({ ...prev, [idx + 1]: true }));
                  };

                  return (
                    <View
                      key={`${section.title}-${idx}`}
                      style={[styles.sectionCard, done && styles.sectionCardCompleted]}
                    >
                      <TouchableOpacity
                        style={styles.sectionHeader}
                        onPress={() =>
                          setExpandedSections((prev) => ({ ...prev, [idx]: !prev[idx] }))
                        }
                      >
                        <Text style={styles.sectionIndex}>{idx + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.sectionTitle}>{section.title}</Text>
                          <Text style={styles.sectionMeta}>
                            {completedInSection}/{section.actionItems.length} completed
                          </Text>
                        </View>
                        {done && (
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color={colors.primary}
                            style={{ marginRight: 6 }}
                          />
                        )}
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.textMuted}
                        />
                      </TouchableOpacity>

                      {isExpanded && (
                        <View>
                          {getSectionTip(section) ? (
                            <Text style={styles.sectionBody}>Tip: {getSectionTip(section)}</Text>
                          ) : null}

                          {section.actionItems.map((item, actionIdx) => {
                            const checked = !!completedActions[getActionKey(idx, actionIdx)];
                            return (
                              <TouchableOpacity
                                key={`${idx}-action-${actionIdx}`}
                                style={styles.actionRow}
                                onPress={() => toggleAction(actionIdx)}
                              >
                                <Ionicons
                                  name={checked ? 'checkbox' : 'square-outline'}
                                  size={20}
                                  color={checked ? colors.primary : colors.textMuted}
                                  style={{ marginRight: spacing.sm }}
                                />
                                <Text style={[styles.actionText, checked && styles.actionTextDone]}>{item}</Text>
                              </TouchableOpacity>
                            );
                          })}

                          <View style={styles.sectionActions}>
                            <TouchableOpacity style={styles.sectionBtn} onPress={markStepDone}>
                              <Ionicons name="checkmark-done" size={16} color={colors.primary} />
                              <Text style={styles.sectionBtnText}>Mark Step Done</Text>
                            </TouchableOpacity>
                            {idx < planSections.length - 1 && (
                              <TouchableOpacity style={styles.sectionBtn} onPress={goNextStep}>
                                <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                                <Text style={styles.sectionBtnText}>Next Step</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            ) : (
              <View style={styles.planCard}>
                <Text style={styles.planText}>
                  No actionable steps were extracted from this response. Tap Back and regenerate the plan.
                </Text>
              </View>
            )}

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

  // Step 3: Review & Save
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

        <View style={styles.planCard}>
          <Text style={[styles.planText, { fontSize: 13, marginBottom: spacing.xs }]}>
            {planSections.length} interactive step{planSections.length === 1 ? '' : 's'} prepared
          </Text>
          <Text style={[styles.planText, { fontSize: 13, marginBottom: spacing.sm }]}>
            {completedActionCount}/{totalActionCount} checklist items completed
          </Text>
          <Text style={[styles.planText, { fontSize: 13 }]} numberOfLines={8}>
            {planSections.map((s, i) => `${i + 1}. ${s.title}`).join('\n')}
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
  progressCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryLighter,
    ...shadow.sm,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTitle: { ...typography.h4, color: colors.textPrimary },
  progressMeta: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  progressTrack: {
    marginTop: spacing.sm,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressSubtitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  jumpBtn: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#E3F2FD',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  jumpBtnText: { fontSize: 12, color: colors.info, fontWeight: '700' },

  planCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  planText: { fontSize: 14, color: colors.textPrimary, lineHeight: 22 },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
<<<<<<< HEAD
  sectionHeader: { flexDirection: 'row', alignItems: 'center' },
  sectionIndex: {
=======
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  sectionIndexCircle: {
>>>>>>> 110819eed8d562189b7d2893abeb1777c963b73f
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  sectionIndexText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  sectionTitle: { ...typography.h4, color: colors.textPrimary, flex: 1 },
  sectionMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sectionBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 21, marginTop: spacing.sm },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
  },
  actionText: { flex: 1, fontSize: 13, color: colors.textPrimary, lineHeight: 20 },
  actionTextDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  sectionActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  sectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primaryLighter,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 4,
    backgroundColor: '#F1F8F1',
  },
  sectionBtnText: { fontSize: 12, color: colors.primaryDark, fontWeight: '700' },
  sectionCardCompleted: {
    backgroundColor: '#F8FFF8',
  },

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

