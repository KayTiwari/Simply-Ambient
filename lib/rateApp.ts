// React Native wiring for the rate-app feature. The decision logic lives in
// rateGate.ts (pure, unit-tested); this module owns storage and the platform
// calls (expo-store-review, Play Store links).
//
// Data notes: everything here is a handful of counters in AsyncStorage under
// the @simply_ambient_ prefix, so "WIPE ALL DATA" clears it. Nothing is sent
// anywhere; the in-app review dialog itself is drawn by Google Play services.

import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import {
  markPrompted,
  normalizeRateState,
  recordOpen,
  recordSession,
  shouldRequestReview,
  type RateState,
} from './rateGate';

const STORAGE_KEY_RATE = '@simply_ambient_rate_v1';

const ANDROID_PACKAGE = 'com.likechess.simplyambient';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
const PLAY_MARKET_URL = `market://details?id=${ANDROID_PACKAGE}`;

async function loadState(): Promise<RateState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_RATE);
    return normalizeRateState(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeRateState(null);
  }
}

async function saveState(state: RateState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_RATE, JSON.stringify(state));
  } catch {}
}

/** Call once per cold start (App.tsx mount). */
export async function recordAppOpen(): Promise<void> {
  const state = await loadState();
  await saveState(recordOpen(state, Date.now()));
}

/**
 * Call when the user finishes something whole: a breath session runs to its
 * target cycles, the mala reaches 108, or a sleep timer fades the audio out.
 */
export async function recordSessionCompleted(): Promise<void> {
  const state = await loadState();
  await saveState(recordSession(state));
}

/**
 * Show the Play in-app review dialog if, and only if, the meaningful-use gate
 * passes. Fires at most once ever; Google Play may still decide not to show
 * the dialog (quota), which is fine, we do not retry.
 */
export async function maybeRequestReview(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const state = await loadState();
    if (!shouldRequestReview(state, Date.now())) return;
    // Persist first so a crash or double trigger can never prompt twice.
    await saveState(markPrompted(state, Date.now()));
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
    }
  } catch {}
}

/**
 * Manual "Rate Simply Ambient" action: deep-link to the Play listing.
 * Google's guidance is that the in-app review dialog should not be wired to
 * a button (it is quota-limited and may silently not appear), so the manual
 * path always goes to the store page where a review is guaranteed possible.
 */
export async function openStoreListing(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Linking.openURL(PLAY_MARKET_URL);
      return;
    } catch {}
  }
  try {
    await Linking.openURL(PLAY_STORE_URL);
  } catch {}
}
