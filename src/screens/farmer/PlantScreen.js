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
  Animated,
  Easing,
} from 'react-native';
import MapView, { Marker, Polygon, Circle, Polyline } from 'react-native-maps';
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
const PLOT_ANALYSIS_STEPS = [
  'Reading boundary geometry',
  'Estimating soil and drainage profile',
  'Checking local weather patterns',
  'Scoring planting suitability',
  'Preparing optimization hints',
];

function sanitizePlainText(value) {
  if (!value) return '';
  return String(value)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .replace(/`+/g, '')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractLikelyJson(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  const direct = safeJsonParse(trimmed);
  if (direct) return direct;

  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const parsed = safeJsonParse(fenced[1].trim());
    if (parsed) return parsed;
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    const parsed = safeJsonParse(candidate);
    if (parsed) return parsed;

    // Last-pass cleanup for trailing commas from imperfect model output.
    const loosened = candidate.replace(/,\s*([}\]])/g, '$1');
    const parsedLoosened = safeJsonParse(loosened);
    if (parsedLoosened) return parsedLoosened;
  }

  return null;
}

function parseStructuredPlan(planText) {
  if (!planText || typeof planText !== 'string') return null;
  const raw = extractLikelyJson(planText);
  if (!raw) return null;

  try {
    if (!Array.isArray(raw?.steps) || raw.steps.length === 0) return null;

    const steps = raw.steps
      .map((step, stepIdx) => {
        const actions = Array.isArray(step?.actions)
          ? step.actions
              .map((action, actionIdx) => ({
                id: `${stepIdx}-${actionIdx}`,
                task: sanitizePlainText(action?.task),
                why: sanitizePlainText(action?.why),
                when: sanitizePlainText(action?.when),
                warning: sanitizePlainText(action?.warning),
              }))
              .filter((a) => a.task)
          : [];

        return {
          title: sanitizePlainText(step?.title) || `Step ${stepIdx + 1}`,
          phase: sanitizePlainText(step?.phase).toLowerCase(),
          startDay: Number.isFinite(Number(step?.start_day)) ? Number(step.start_day) : null,
          endDay: Number.isFinite(Number(step?.end_day)) ? Number(step.end_day) : null,
          priority: sanitizePlainText(step?.priority).toLowerCase() || 'medium',
          reason: sanitizePlainText(step?.reason),
          actions,
        };
      })
      .filter((s) => s.actions.length > 0);

    if (steps.length === 0) return null;

    const alerts = Array.isArray(raw?.alerts)
      ? raw.alerts
          .map((a) => ({
            title: sanitizePlainText(a?.title),
            message: sanitizePlainText(a?.message),
            severity: sanitizePlainText(a?.severity).toLowerCase() || 'info',
          }))
          .filter((a) => a.title || a.message)
      : [];

    return {
      summary: {
        objective: sanitizePlainText(raw?.summary?.objective),
        keyDecision: sanitizePlainText(raw?.summary?.key_decision),
      },
      alerts,
      steps,
    };
  } catch {
    return null;
  }
}

function parsePlanSections(planText) {
  if (!planText || typeof planText !== 'string') return [];
  // If response looks like JSON but failed structured parse, don't render broken JSON tokens as tasks.
  if (/"summary"\s*:/.test(planText) && /"steps"\s*:/.test(planText)) return [];

  const lines = planText.replace(/\r/g, '').split('\n');
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const isJsonNoise =
      /^```/.test(line) ||
      /^[{}\[\],]+$/.test(line) ||
      /^"[\w-]+"\s*:\s*[\[{]?$/.test(line) ||
      /^"[\w-]+"\s*:\s*.+,?$/.test(line);
    if (isJsonNoise) continue;

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
        .map((s) => sanitizePlainText(s))
        .filter((s) => s.length >= 8)
        .slice(0, 3);

      return {
        ...section,
        title: sanitizePlainText(section.title),
        content: sanitizePlainText(section.content),
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
  const structuredPlan = parseStructuredPlan(aiPlan);
  const planSections = structuredPlan
    ? structuredPlan.steps.map((step) => ({
        title: step.title,
        content: step.reason,
        actionItems: step.actions.map((a) => a.task),
      }))
    : parsePlanSections(aiPlan);
  const [completedActions, setCompletedActions] = useState({});
  const [currentTaskIdx, setCurrentTaskIdx] = useState(0);
  const taskOpacity = useRef(new Animated.Value(1)).current;
  const taskTranslateY = useRef(new Animated.Value(0)).current;
  const [isAnalyzingPlot, setIsAnalyzingPlot] = useState(false);
  const [analysisStepIdx, setAnalysisStepIdx] = useState(0);
  const [analysisTick, setAnalysisTick] = useState(0);
  const scanPulse = useRef(new Animated.Value(0)).current;

  const farmCenter =
    farmBoundary.length > 0
      ? {
          lat: farmBoundary.reduce((s, c) => s + c.latitude, 0) / farmBoundary.length,
          lon: farmBoundary.reduce((s, c) => s + c.longitude, 0) / farmBoundary.length,
        }
      : null;

  useEffect(() => {
    setCompletedActions({});
    setCurrentTaskIdx(0);
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
  const getSectionTip = (section) => {
    const source = section?.content?.trim();
    if (!source) return null;
    const firstSentence = source.split(/(?<=[.!?])\s+/)[0]?.trim() || source;
    return firstSentence.length > 140 ? `${firstSentence.slice(0, 137)}...` : firstSentence;
  };
  const walkthroughTasks = structuredPlan
    ? structuredPlan.steps.flatMap((step, sectionIdx) =>
        step.actions.map((action, actionIdx) => ({
          text: action.task,
          why: action.why,
          when: action.when,
          warning: action.warning,
          sectionIdx,
          actionIdx,
          sectionTitle: step.title,
          tip: step.reason || action.why,
          priority: step.priority || 'medium',
          phase: step.phase || 'planting',
          dayWindow:
            Number.isFinite(step.startDay) && Number.isFinite(step.endDay)
              ? `Day ${step.startDay}-${step.endDay}`
              : action.when || 'Schedule as advised',
        }))
      )
    : planSections.flatMap((section, sectionIdx) =>
        section.actionItems.map((text, actionIdx) => ({
          text,
          why: '',
          when: '',
          warning: '',
          sectionIdx,
          actionIdx,
          sectionTitle: section.title,
          tip: getSectionTip(section),
          priority: 'medium',
          phase: 'planting',
          dayWindow: 'Follow recommended timing',
        }))
      );
  const totalTaskCount = walkthroughTasks.length;
  const boundedTaskIdx = totalTaskCount > 0 ? Math.min(currentTaskIdx, totalTaskCount - 1) : 0;
  const currentTask = totalTaskCount > 0 ? walkthroughTasks[boundedTaskIdx] : null;
  const progressPercent = totalActionCount > 0 ? Math.round((completedActionCount / totalActionCount) * 100) : 0;
  useEffect(() => {
    if (totalTaskCount === 0) return;
    if (currentTaskIdx > totalTaskCount - 1) {
      setCurrentTaskIdx(totalTaskCount - 1);
    }
  }, [currentTaskIdx, totalTaskCount]);

  useEffect(() => {
    if (!currentTask) return;
    taskOpacity.setValue(0);
    taskTranslateY.setValue(16);
    Animated.parallel([
      Animated.timing(taskOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(taskTranslateY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [boundedTaskIdx]);

  useEffect(() => {
    if (!isAnalyzingPlot) {
      scanPulse.stopAnimation();
      scanPulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanPulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scanPulse, {
          toValue: 0,
          duration: 850,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isAnalyzingPlot]);

  useEffect(() => {
    if (!isAnalyzingPlot) return;
    const id = setInterval(() => setAnalysisTick((v) => v + 1), 120);
    return () => clearInterval(id);
  }, [isAnalyzingPlot]);

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

  const proceedToStep2 = async () => {
    if (farmBoundary.length < 3) {
      Alert.alert('Draw Your Farm', 'Please tap at least 3 points on the map to outline your farm boundary.');
      return;
    }
    setIsAnalyzingPlot(true);
    setAnalysisStepIdx(0);
    for (let i = 0; i < PLOT_ANALYSIS_STEPS.length; i += 1) {
      setAnalysisStepIdx(i);
      // Progressive analysis reveal to make the transition feel intentional.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, i === PLOT_ANALYSIS_STEPS.length - 1 ? 800 : 620));
    }
    setIsAnalyzingPlot(false);
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
    const analysisProgress = Math.min(1, (analysisStepIdx + 1) / PLOT_ANALYSIS_STEPS.length);
    const boundaryQuality =
      farmBoundary.length >= 6 ? 'High detail' : farmBoundary.length >= 4 ? 'Good' : 'Basic';
    const pulse = (Math.sin((analysisTick / 2.2) % (Math.PI * 2)) + 1) / 2;
    const scanPoint =
      isAnalyzingPlot && orderedBoundary.length > 0
        ? orderedBoundary[analysisTick % orderedBoundary.length]
        : null;
    const dynamicFillAlpha = isAnalyzingPlot ? 0.16 + pulse * 0.22 : 0.2;
    const dynamicStrokeWidth = isAnalyzingPlot ? 2 + pulse * 2.2 : 2;
    const scanRadius = isAnalyzingPlot ? 28 + pulse * 18 : 22;
    const scanPath =
      isAnalyzingPlot && scanPoint && farmCenter
        ? [
            { latitude: farmCenter.lat, longitude: farmCenter.lon },
            scanPoint,
          ]
        : null;

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
          onPress={isAnalyzingPlot ? undefined : handleMapPress}
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
              fillColor={`rgba(46,125,50,${dynamicFillAlpha.toFixed(3)})`}
              strokeColor={colors.primary}
              strokeWidth={dynamicStrokeWidth}
            />
          )}
          {isAnalyzingPlot && farmCenter && (
            <Circle
              center={{ latitude: farmCenter.lat, longitude: farmCenter.lon }}
              radius={scanRadius}
              fillColor="rgba(76,175,80,0.15)"
              strokeColor="rgba(27,94,32,0.35)"
              strokeWidth={1.2}
            />
          )}
          {scanPath && (
            <Polyline
              coordinates={scanPath}
              strokeColor="rgba(33,150,243,0.7)"
              strokeWidth={2}
              lineDashPattern={[6, 6]}
            />
          )}
          {scanPoint && (
            <Marker coordinate={scanPoint} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.scanMarker}>
                <Ionicons name="scan-circle-outline" size={18} color="#fff" />
              </View>
            </Marker>
          )}
        </MapView>

        {/* Map controls */}
        <View style={styles.mapControls}>
          <TouchableOpacity style={styles.mapControlBtn} onPress={goToCurrentLocation} disabled={isAnalyzingPlot}>
            <Ionicons name="locate" size={22} color={colors.primary} />
          </TouchableOpacity>
          {farmBoundary.length > 0 && (
            <TouchableOpacity style={styles.mapControlBtn} onPress={undoLastPoint} disabled={isAnalyzingPlot}>
              <Ionicons name="arrow-undo" size={22} color={colors.warning} />
            </TouchableOpacity>
          )}
          {farmBoundary.length > 0 && (
            <TouchableOpacity style={styles.mapControlBtn} onPress={clearBoundary} disabled={isAnalyzingPlot}>
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </TouchableOpacity>
          )}
        </View>
        {isAnalyzingPlot && (
          <View style={styles.analysisOverlay} pointerEvents="none">
            <Animated.View
              style={[
                styles.scanRingOuter,
                {
                  opacity: scanPulse.interpolate({ inputRange: [0, 1], outputRange: [0.26, 0.05] }),
                  transform: [{ scale: scanPulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.18] }) }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.scanRingInner,
                {
                  opacity: scanPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.12] }),
                  transform: [{ scale: scanPulse.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.1] }) }],
                },
              ]}
            />
              <View style={styles.analysisCard}>
              <View style={styles.analysisHeader}>
                <Ionicons name="analytics-outline" size={18} color={colors.primaryDark} />
                <Text style={styles.analysisTitle}>Analyzing Plot</Text>
              </View>
              <Text style={styles.analysisSubtitle}>{PLOT_ANALYSIS_STEPS[analysisStepIdx]}</Text>
              <View style={styles.analysisTrack}>
                <View style={[styles.analysisFill, { width: `${Math.round(analysisProgress * 100)}%` }]} />
              </View>
              <View style={styles.analysisMetaRow}>
                <Text style={styles.analysisMetaText}>Area: {farmArea.toFixed(2)} ha</Text>
                <Text style={styles.analysisMetaText}>Boundary: {boundaryQuality}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.stepFooter}>
          <TouchableOpacity
            style={[styles.nextBtn, farmBoundary.length < 3 && styles.nextBtnDisabled]}
            onPress={proceedToStep2}
            disabled={farmBoundary.length < 3 || isAnalyzingPlot}
          >
            <Text style={styles.nextBtnText}>{isAnalyzingPlot ? 'Analyzing...' : 'Next: Select Crop'}</Text>
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
    const goToTask = (nextIdx) => {
      if (totalTaskCount === 0) return;
      const bounded = Math.max(0, Math.min(nextIdx, totalTaskCount - 1));
      setCurrentTaskIdx(bounded);
    };

    const isCurrentTaskDone = currentTask
      ? !!completedActions[getActionKey(currentTask.sectionIdx, currentTask.actionIdx)]
      : false;

    const toggleCurrentTask = () => {
      if (!currentTask) return;
      const key = getActionKey(currentTask.sectionIdx, currentTask.actionIdx);
      const wasChecked = !!completedActions[key];
      setCompletedActions((prev) => ({ ...prev, [key]: !prev[key] }));
      if (!wasChecked && boundedTaskIdx < totalTaskCount - 1) {
        setTimeout(() => goToTask(boundedTaskIdx + 1), 180);
      }
    };

    const completeAndAdvance = () => {
      if (!currentTask) return;
      const key = getActionKey(currentTask.sectionIdx, currentTask.actionIdx);
      setCompletedActions((prev) => ({ ...prev, [key]: true }));
      if (boundedTaskIdx < totalTaskCount - 1) {
        goToTask(boundedTaskIdx + 1);
      }
    };
    const alertItems = structuredPlan?.alerts || [];
    const phaseIconMap = {
      soil: 'earth-outline',
      planting: 'leaf-outline',
      water: 'water-outline',
      fertilizer: 'flask-outline',
      protection: 'shield-checkmark-outline',
      harvest: 'nutrition-outline',
    };
    const phaseIcon = currentTask ? phaseIconMap[currentTask.phase] || 'leaf-outline' : 'leaf-outline';
    const priorityStyleMap = {
      low: { bg: '#E8F5E9', text: colors.primaryDark, label: 'Low Priority' },
      medium: { bg: '#FFF8E1', text: colors.warning, label: 'Medium Priority' },
      high: { bg: '#FFEBEE', text: colors.error, label: 'High Priority' },
    };
    const priorityMeta = currentTask ? priorityStyleMap[currentTask.priority] || priorityStyleMap.medium : priorityStyleMap.medium;
    const activeLat = farmCenter?.lat || region.latitude;
    const activeLon = farmCenter?.lon || region.longitude;
    const areaBand =
      farmArea < 0.5 ? 'Small Plot' : farmArea < 2 ? 'Medium Plot' : 'Large Plot';
    const currentWeatherSummary = weather ? formatWeatherSummary(weather) : 'Weather data unavailable';
    const weatherImpact =
      /rain|storm|showers/i.test(currentWeatherSummary)
        ? 'Water carefully, avoid oversaturation.'
        : /hot|heat|sun/i.test(currentWeatherSummary)
          ? 'Increase moisture retention and mulch.'
          : 'Maintain normal irrigation cadence.';

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
            {structuredPlan?.summary?.objective ? (
              <View style={styles.decisionCard}>
                <Text style={styles.decisionTitle}>AI Decision</Text>
                <Text style={styles.decisionBody}>{structuredPlan.summary.objective}</Text>
                {structuredPlan?.summary?.keyDecision ? (
                  <Text style={styles.decisionKey}>Key call: {structuredPlan.summary.keyDecision}</Text>
                ) : null}
              </View>
            ) : null}
            <View style={styles.regionCard}>
              <Text style={styles.regionTitle}>Region Insights</Text>
              <View style={styles.regionRow}>
                <View style={styles.regionPill}>
                  <Ionicons name="locate-outline" size={14} color={colors.primaryDark} />
                  <Text style={styles.regionPillText}>{activeLat.toFixed(3)}, {activeLon.toFixed(3)}</Text>
                </View>
                <View style={styles.regionPill}>
                  <Ionicons name="map-outline" size={14} color={colors.primaryDark} />
                  <Text style={styles.regionPillText}>{areaBand}</Text>
                </View>
              </View>
              <Text style={styles.regionHint}>{weatherImpact}</Text>
            </View>

            {/* Guided walkthrough */}
            {totalTaskCount > 0 ? (
              <>
                <View style={styles.progressCard}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressTitle}>Guided Walkthrough</Text>
                    <Text style={styles.progressMeta}>
                      {completedActionCount}/{totalActionCount} done
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                  </View>
                  <Text style={styles.progressSubtitle}>
                    Task {boundedTaskIdx + 1} of {totalTaskCount}
                  </Text>
                  <View style={styles.dotRow}>
                    {walkthroughTasks.slice(0, 16).map((_, idx) => (
                      <View
                        key={`dot-${idx}`}
                        style={[
                          styles.dot,
                          idx === boundedTaskIdx && styles.dotActive,
                          idx < boundedTaskIdx && styles.dotDone,
                        ]}
                      />
                    ))}
                  </View>
                </View>

                {alertItems.length > 0 && (
                  <View style={styles.alertCard}>
                    <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
                    <Text style={styles.alertText}>
                      {alertItems[0].title}: {alertItems[0].message}
                    </Text>
                  </View>
                )}

                {currentTask && (
                  <Animated.View
                    style={[
                      styles.walkCard,
                      {
                        opacity: taskOpacity,
                        transform: [{ translateY: taskTranslateY }],
                      },
                    ]}
                  >
                    <View style={styles.walkHeader}>
                      <View style={styles.walkStepBadge}>
                        <Text style={styles.walkStepBadgeText}>{currentTask.sectionIdx + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.walkTitle}>{currentTask.sectionTitle}</Text>
                        <Text style={styles.walkMeta}>One action at a time</Text>
                      </View>
                      <Ionicons name={phaseIcon} size={20} color={colors.primaryDark} />
                    </View>

                    <View style={styles.metaRow}>
                      <View style={styles.metaChip}>
                        <Ionicons name="calendar-outline" size={14} color={colors.info} />
                        <Text style={styles.metaChipText}>{currentTask.dayWindow}</Text>
                      </View>
                      <View style={[styles.metaChip, { backgroundColor: priorityMeta.bg }]}>
                        <Ionicons name="flag-outline" size={14} color={priorityMeta.text} />
                        <Text style={[styles.metaChipText, { color: priorityMeta.text }]}>
                          {priorityMeta.label}
                        </Text>
                      </View>
                    </View>

                    {currentTask.tip ? <Text style={styles.walkTip}>Tip: {currentTask.tip}</Text> : null}
                    {currentTask.why ? (
                      <View style={styles.whyCard}>
                        <Text style={styles.whyTitle}>Why this matters</Text>
                        <Text style={styles.whyText}>{currentTask.why}</Text>
                      </View>
                    ) : null}
                    {currentTask.warning ? (
                      <View style={styles.warnCard}>
                        <Ionicons name="warning-outline" size={16} color={colors.error} />
                        <Text style={styles.warnText}>{currentTask.warning}</Text>
                      </View>
                    ) : null}

                    <TouchableOpacity
                      style={[styles.taskRow, isCurrentTaskDone && styles.taskRowDone]}
                      onPress={toggleCurrentTask}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={isCurrentTaskDone ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isCurrentTaskDone ? colors.primary : colors.textMuted}
                        style={{ marginRight: spacing.sm }}
                      />
                      <Text style={[styles.taskText, isCurrentTaskDone && styles.taskTextDone]}>
                        {currentTask.text}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.walkActions}>
                      <TouchableOpacity
                        style={[styles.walkBtn, boundedTaskIdx === 0 && styles.walkBtnDisabled]}
                        onPress={() => goToTask(boundedTaskIdx - 1)}
                        disabled={boundedTaskIdx === 0}
                      >
                        <Ionicons name="arrow-back" size={16} color={colors.primaryDark} />
                        <Text style={styles.walkBtnText}>Previous</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.walkNextBtn} onPress={completeAndAdvance}>
                        <Text style={styles.walkNextBtnText}>
                          {boundedTaskIdx === totalTaskCount - 1 ? 'Complete Task' : 'Complete & Next'}
                        </Text>
                        <Ionicons
                          name={boundedTaskIdx === totalTaskCount - 1 ? 'checkmark' : 'arrow-forward'}
                          size={16}
                          color="#fff"
                        />
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                )}
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
  scanMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.info,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
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
  analysisOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,20,10,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  scanRingOuter: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: colors.primaryLighter,
    backgroundColor: 'rgba(76,175,80,0.12)',
  },
  scanRingInner: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1.5,
    borderColor: '#C8E6C9',
    backgroundColor: 'rgba(165,214,167,0.20)',
  },
  analysisCard: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryLighter,
    ...shadow.md,
  },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  analysisTitle: { ...typography.h4, color: colors.primaryDark },
  analysisSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  analysisTrack: {
    width: '100%',
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  analysisFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  analysisMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  analysisMetaText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

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
  dotRow: { flexDirection: 'row', marginTop: spacing.sm, gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 14 },
  dotDone: { backgroundColor: colors.primaryLight },
  alertCard: {
    marginBottom: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFE082',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  alertText: { flex: 1, color: colors.earth, fontSize: 12, lineHeight: 18 },
  decisionCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.info,
  },
  decisionTitle: { fontSize: 12, fontWeight: '700', color: colors.info, marginBottom: 2 },
  decisionBody: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  decisionKey: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
  regionCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryLighter,
  },
  regionTitle: { fontSize: 12, fontWeight: '700', color: colors.primaryDark, marginBottom: spacing.xs },
  regionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  regionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F8F1',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  regionPillText: { fontSize: 12, color: colors.primaryDark, fontWeight: '600' },
  regionHint: { marginTop: spacing.xs, fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  planText: { fontSize: 14, color: colors.textPrimary, lineHeight: 22 },
  walkCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryLighter,
    ...shadow.sm,
  },
  walkHeader: { flexDirection: 'row', alignItems: 'center' },
  walkStepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  walkStepBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  walkTitle: { ...typography.h4, color: colors.textPrimary },
  walkMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  walkTip: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.sm },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: spacing.sm, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E3F2FD',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  metaChipText: { fontSize: 12, color: colors.info, fontWeight: '600' },
  whyCard: {
    marginTop: spacing.sm,
    backgroundColor: '#F5F5F0',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.info,
  },
  whyTitle: { fontSize: 12, color: colors.info, fontWeight: '700', marginBottom: 2 },
  whyText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  warnCard: {
    marginTop: spacing.sm,
    backgroundColor: '#FFEBEE',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  warnText: { flex: 1, fontSize: 12, color: colors.error, lineHeight: 18 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: '#FAFAFA',
  },
  taskRowDone: {
    backgroundColor: '#E8F5E9',
    borderColor: colors.primaryLighter,
  },
  taskText: { flex: 1, fontSize: 14, color: colors.textPrimary, lineHeight: 21 },
  taskTextDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  walkActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  walkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primaryLighter,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 4,
    backgroundColor: '#F1F8F1',
    minWidth: 120,
  },
  walkBtnDisabled: { opacity: 0.45 },
  walkBtnText: { fontSize: 13, color: colors.primaryDark, fontWeight: '700' },
  walkNextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    gap: 4,
    backgroundColor: colors.primary,
  },
  walkNextBtnText: { fontSize: 13, color: '#fff', fontWeight: '700' },

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

