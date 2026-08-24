import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { SafeAreaView } from '@/components/ui/safe-area-view';

// Splash screen inspired by popular delivery apps (UberEats, Glovo, etc.)
// Dark background, bold accent-colored logo, subtle fade & scale animation

const COLORS = {
  background: '#000000', // Dark background
  accent: '#FFC107',     // Blink brand yellow accent
  text: '#FFFFFF',
};

export default function BlinkSplash() {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    // Fade & scale in parallel
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Animated.View style={[styles.logoWrapper, { opacity, transform: [{ scale }] }]}>
        <Text style={styles.logo}>BLINK</Text>
        <Text style={styles.subtitle}>RIDERS</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    fontSize: 48,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 2,
  },
  subtitle: {
    marginTop: Platform.OS === 'ios' ? 4 : 2,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 4,
  },
});

