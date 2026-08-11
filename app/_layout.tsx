import React, { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import '../global.css';
import { Stack, useRouter, ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../utils/supabase';

WebBrowser.maybeCompleteAuthSession();

// Set react-native-css-interop flag for dark mode class support on web
if (typeof (StyleSheet as any).setFlag === 'function') {
  (StyleSheet as any).setFlag('darkMode', 'class');
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 bg-slate-900 justify-center items-center p-6">
      <View className="bg-slate-800 p-8 rounded-3xl max-w-md w-full border border-slate-700 items-center shadow-xl">
        <Text className="text-4xl mb-3">⚠️</Text>
        <Text className="text-xl font-bold text-white text-center font-serif mb-2">
          Something went wrong
        </Text>
        <Text className="text-xs text-slate-400 text-center mb-6">
          {error?.message || 'An unexpected error occurred in the application.'}
        </Text>
        <TouchableOpacity
          onPress={retry}
          className="bg-indigo-600 px-6 py-3 rounded-xl w-full items-center"
        >
          <Text className="text-white font-bold text-sm">Try Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    const checkInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (!session || error) {
          console.log('[ROOT AUTH GUARD] No active session found. Redirecting to /login...');
          await AsyncStorage.multiRemove(['userToken', 'userInfo', '@custom_time_slots']);
          router.replace('/login');
        }
      } catch (err) {
        console.error('[ROOT AUTH GUARD EXCEPTION]', err);
      }
    };

    checkInitialSession();

    // Listen for Supabase auth state changes (OAuth redirects, login, logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[SUPABASE AUTH EVENT]', event, session?.user?.email);
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
        await AsyncStorage.setItem('userToken', session.access_token);
        if (session.user) {
          await AsyncStorage.setItem(
            'userInfo',
            JSON.stringify({
              email: session.user.email,
              name:
                session.user.user_metadata?.full_name ||
                session.user.user_metadata?.name ||
                session.user.email?.split('@')[0] ||
                'Student',
              id: session.user.id,
            })
          );
        }
        if (event === 'SIGNED_IN') {
          router.replace('/(tabs)');
        }
      } else if (event === 'SIGNED_OUT' || !session) {
        await AsyncStorage.multiRemove(['userToken', 'userInfo', '@custom_time_slots']);
        router.replace('/login');
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [router]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#ffffff' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ title: 'Dashboard' }} />
        <Stack.Screen name="login" options={{ title: 'Login' }} />
        <Stack.Screen name="signup" options={{ title: 'Signup' }} />
        <Stack.Screen name="profile" options={{ title: 'Analytics & Profile' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
      </Stack>
    </>
  );
}
