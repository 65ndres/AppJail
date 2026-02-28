import { useEffect, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Only load the native module on iOS to avoid crashes on web/Android
const isIOS = Platform.OS === 'ios';
let ReactNativeDeviceActivity: typeof import('react-native-device-activity') | null = null;

if (isIOS) {
  try {
    ReactNativeDeviceActivity = require('react-native-device-activity');
  } catch {
    // Module not linked or not available
  }
}

const SELECTION_ID = 'screen_time_test_selection';
const SHIELD_ID = 'screen_time_test_shield';
const ACTIVITY_NAME = 'screen_time_test_activity';

// Extract native component for JSX (avoids parsing issues with ! in JSX)
const DeviceActivitySelectionViewComponent =
  ReactNativeDeviceActivity?.DeviceActivitySelectionView ?? null;

export default function ScreenTimeTestScreen() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme ?? 'light'].tint;
  const [authStatus, setAuthStatus] = useState<string>('unknown');
  const [selectionSaved, setSelectionSaved] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [familyActivitySelection, setFamilyActivitySelection] = useState<string | null>(null);
  const [eventsLog, setEventsLog] = useState<string[]>([]);

  const hasModule = isIOS && ReactNativeDeviceActivity != null;

  useEffect(() => {
    if (!hasModule) return;
    try {
      const status = ReactNativeDeviceActivity!.getAuthorizationStatus?.();
      setAuthStatus(String(status ?? 'unknown'));
    } catch {
      setAuthStatus('error');
    }
  }, [hasModule]);

  const requestAuth = async () => {
    if (!hasModule) {
      Alert.alert('Unavailable', 'Screen Time APIs are only available on iOS with the native module linked.');
      return;
    }
    setLoading(true);
    try {
      const status = await ReactNativeDeviceActivity!.requestAuthorization();
      setAuthStatus(status);
      setEventsLog((prev) => [...prev, `Authorization result: ${status}`]);
    } catch (e) {
      setAuthStatus('error');
      setEventsLog((prev) => [...prev, `Authorization error: ${String(e)}`]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectionChange = (event: { nativeEvent: { familyActivitySelection?: string } }) => {
    const selection = event.nativeEvent.familyActivitySelection ?? null;
    setFamilyActivitySelection(selection);
    setEventsLog((prev) => [...prev, 'Selection changed']);
  };

  const saveSelectionAndConfigure = () => {
    if (!hasModule || !familyActivitySelection) {
      Alert.alert('Error', 'Select at least one app first (use the native picker below).');
      return;
    }
    try {
      ReactNativeDeviceActivity!.setFamilyActivitySelectionId({
        id: SELECTION_ID,
        familyActivitySelection,
      });
      setSelectionSaved(true);

      // Configure shield
      ReactNativeDeviceActivity!.updateShield(
        {
          title: 'App Blocked',
          subtitle: 'This app is unavailable during the test period.',
          primaryButtonLabel: 'OK',
          iconSystemName: 'moon.stars.fill',
        },
        {
          primary: { behavior: 'close' },
        }
      );

      // Block on interval start
      ReactNativeDeviceActivity!.configureActions({
        activityName: ACTIVITY_NAME,
        callbackName: 'intervalDidStart',
        actions: [{ type: 'blockSelection', familyActivitySelectionId: SELECTION_ID, shieldId: SHIELD_ID }],
      });

      // Unblock on interval end
      ReactNativeDeviceActivity!.configureActions({
        activityName: ACTIVITY_NAME,
        callbackName: 'intervalDidEnd',
        actions: [{ type: 'unblockSelection', familyActivitySelectionId: SELECTION_ID }],
      });

      setEventsLog((prev) => [...prev, 'Selection saved and shield configured']);
    } catch (e) {
      setEventsLog((prev) => [...prev, `Save error: ${String(e)}`]);
      Alert.alert('Error', String(e));
    }
  };

  const startTestSchedule = async () => {
    if (!hasModule) {
      Alert.alert('Unavailable', 'Screen Time APIs are only available on iOS.');
      return;
    }
    setLoading(true);
    try {
      const now = new Date();
      const startMin = now.getMinutes() + 1;
      const startHour = now.getHours() + Math.floor(startMin / 60);
      await ReactNativeDeviceActivity!.startMonitoring(
        ACTIVITY_NAME,
        {
          intervalStart: {
            hour: startHour % 24,
            minute: startMin % 60,
            second: 0,
          },
          intervalEnd: {
            hour: (startHour + 1) % 24,
            minute: startMin % 60,
            second: 59,
          },
          repeats: false,
        },
        []
      );
      setMonitoring(true);
      setEventsLog((prev) => [
        ...prev,
        `Monitoring started: ~${startHour % 24}:${String(startMin % 60).padStart(2, '0')} - ~${(startHour + 1) % 24}:${String(startMin % 60).padStart(2, '0')}`,
      ]);
    } catch (e) {
      setEventsLog((prev) => [...prev, `Start error: ${String(e)}`]);
      Alert.alert('Error', String(e));
    } finally {
      setLoading(false);
    }
  };

  const stopMonitoring = async () => {
    if (!hasModule) return;
    setLoading(true);
    try {
      await ReactNativeDeviceActivity!.stopMonitoring(ACTIVITY_NAME);
      setMonitoring(false);
      setEventsLog((prev) => [...prev, 'Monitoring stopped']);
    } catch (e) {
      setEventsLog((prev) => [...prev, `Stop error: ${String(e)}`]);
    } finally {
      setLoading(false);
    }
  };

  if (!isIOS) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle">Screen Time test</ThemedText>
        <ThemedText style={styles.muted}>
          Screen Time / Device Activity APIs are only available on iOS. Use an iOS device or simulator to test.
        </ThemedText>
      </ThemedView>
    );
  }

  if (!ReactNativeDeviceActivity) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle">Screen Time test</ThemedText>
        <ThemedText style={styles.muted}>
          Native module not linked. Run prebuild and ensure the plugin is configured in app.json.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle">1. Authorization</ThemedText>
        <ThemedText style={styles.muted}>Status: {authStatus}</ThemedText>
        <Pressable style={[styles.button, { backgroundColor: tint }]} onPress={requestAuth} disabled={loading}>
          <ThemedText>Request authorization</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle">2. Select apps to block</ThemedText>
        <ThemedText style={styles.muted}>
          Use the native picker below. If it crashes (known SwiftUI issue), restart the app and try again.
        </ThemedText>
        {DeviceActivitySelectionViewComponent && (
          <View style={styles.pickerContainer}>
            <DeviceActivitySelectionViewComponent
              familyActivitySelection={familyActivitySelection}
              onSelectionChange={handleSelectionChange}
              style={styles.picker}
            />
          </View>
        )}
        <Pressable
          style={[styles.button, { backgroundColor: tint }, !familyActivitySelection && styles.buttonDisabled]}
          onPress={saveSelectionAndConfigure}
          disabled={!familyActivitySelection || loading}
        >
          <ThemedText>Save selection & configure shield</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle">3. Schedule (test 1 hour block)</ThemedText>
        <ThemedText style={styles.muted}>
          Starts ~1 min from now, lasts 1 hour. Blocking uses the selection from step 2.
        </ThemedText>
        <Pressable
          style={[styles.button, { backgroundColor: tint }, !selectionSaved && styles.buttonDisabled]}
          onPress={startTestSchedule}
          disabled={!selectionSaved || loading || monitoring}
        >
          <ThemedText>Start monitoring</ThemedText>
        </Pressable>
        {monitoring && (
          <Pressable style={[styles.button, { backgroundColor: tint }]} onPress={stopMonitoring} disabled={loading}>
            <ThemedText>Stop monitoring</ThemedText>
          </Pressable>
        )}
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle">4. Event log</ThemedText>
        {eventsLog.length === 0 ? (
          <ThemedText style={styles.muted}>Events and status will appear here.</ThemedText>
        ) : (
          eventsLog.map((line, i) => (
            <ThemedText key={i} style={styles.logLine}>
              {line}
            </ThemedText>
          ))
        )}
      </ThemedView>

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },
  container: { padding: 16 },
  section: {
    marginBottom: 24,
  },
  muted: {
    opacity: 0.8,
    marginTop: 4,
    marginBottom: 8,
  },
  button: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  pickerContainer: {
    minHeight: 200,
    marginVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    flex: 1,
    width: '100%',
    minHeight: 200,
  },
  logLine: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    marginBottom: 2,
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});
