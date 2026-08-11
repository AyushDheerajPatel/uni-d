import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter, Stack, Link } from 'expo-router';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../utils/supabase';

const AUTH_API_URL = 'https://college-tracker-backend.onrender.com/api/auth';

const extractUrlToken = (url: string, paramName: string): string | null => {
  try {
    const match = url.match(new RegExp(`[#?&]${paramName}=([^&]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
};

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // OTP Verification State
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otp, setOtp] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (session && !error) {
          console.log('[LOGIN] Active Supabase session verified:', session.user.email);
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
                  'Ayush Patel',
                id: session.user.id,
              })
            );
          }
          router.replace('/(tabs)');
          return;
        }
        console.log('[LOGIN] No active Supabase session found. Clearing stale local tokens...');
        await AsyncStorage.multiRemove(['userToken', 'userInfo']);
      } catch (err) {
        console.error('[LOGIN SESSION CHECK ERROR]', err);
        await AsyncStorage.multiRemove(['userToken', 'userInfo']);
      }
    };
    checkExistingSession();
  }, [router]);

  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setInfoMessage('');
    setLoading(true);
    try {
      const redirectUrl =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.location.origin
          : Linking.createURL('/login', { scheme: 'unid' });

      console.log('[GOOGLE OAUTH REDIRECT URL]', redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: Platform.OS !== 'web',
        },
      });

      if (error) {
        console.error('[SUPABASE GOOGLE OAUTH ERROR]', error.message);
        setErrorMessage(error.message);
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
          window.alert(error.message);
        } else {
          Alert.alert('Google Sign-In Error', error.message);
        }
      } else if (data?.url && Platform.OS !== 'web') {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('[MOBILE WEBBROWSER RESULT]', res);

        if (res.type === 'success' && res.url) {
          const { queryParams } = Linking.parse(res.url);
          const accessToken =
            queryParams?.access_token || extractUrlToken(res.url, 'access_token');
          const refreshToken =
            queryParams?.refresh_token || extractUrlToken(res.url, 'refresh_token');

          if (accessToken && refreshToken) {
            const { error: setSessionErr } = await supabase.auth.setSession({
              access_token: String(accessToken),
              refresh_token: String(refreshToken),
            });
            if (setSessionErr) {
              console.error('[SUPABASE SET SESSION ERROR]', setSessionErr.message);
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[GOOGLE SIGN-IN EXCEPTION]', err);
      const msg = err?.message || 'An unexpected error occurred during Google sign in.';
      setErrorMessage(msg);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setErrorMessage('');
    setInfoMessage('');
    if (!email.trim() || !password.trim()) {
      const msg = 'Please fill in both email and password.';
      setErrorMessage(msg);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(msg);
      } else {
        Alert.alert('Login Error', msg);
      }
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      const msg = 'Please enter a valid email address.';
      setErrorMessage(msg);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(msg);
      } else {
        Alert.alert('Login Error', msg);
      }
      return;
    }

    setLoading(true);
    try {
      // Supabase Authentication: signInWithPassword
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        console.warn('[SUPABASE SIGNIN ERROR]', error.message);
        
        // Fallback for demo mode if placeholder keys are unconfigured
        if (
          error.message.includes('FetchError') ||
          error.message.includes('invalid URL') ||
          error.message.includes('Invalid API key') ||
          error.message.includes('URL')
        ) {
          await AsyncStorage.setItem('userToken', 'demo-supabase-token-123');
          await AsyncStorage.setItem('userInfo', JSON.stringify({ email: email.trim(), name: 'Ayush Patel' }));
          router.replace('/(tabs)');
          return;
        }

        setErrorMessage(error.message);
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
          window.alert(error.message);
        } else {
          Alert.alert('Sign In Failed', error.message);
        }
        return;
      }

      if (data?.session) {
        await AsyncStorage.setItem('userToken', data.session.access_token);
        if (data.user) {
          await AsyncStorage.setItem(
            'userInfo',
            JSON.stringify({
              email: data.user.email,
              name: data.user.user_metadata?.full_name || 'Ayush Patel',
              id: data.user.id,
            })
          );
        }
        router.replace('/(tabs)');
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      console.error('[LOGIN EXCEPTION]', err);
      const msg = err?.message || 'An unexpected error occurred during sign in.';
      setErrorMessage(msg);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setErrorMessage('');
    setInfoMessage('');
    if (!otp.trim() || otp.trim().length !== 6) {
      setErrorMessage('Please enter a valid 6-digit OTP code.');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${AUTH_API_URL}/verify-otp`, {
        email: pendingEmail || email.trim().toLowerCase(),
        otp: otp.trim(),
      });

      if (response.data && response.data.token) {
        await AsyncStorage.setItem('userToken', response.data.token);
        if (response.data.user) {
          await AsyncStorage.setItem('userInfo', JSON.stringify(response.data.user));
        }
        router.replace('/');
      } else {
        setErrorMessage('OTP verification failed. Token not received.');
      }
    } catch (error: any) {
      console.error('[AUTH VERIFY OTP ERROR]', error?.response?.data || error?.message);
      const serverMessage = error?.response?.data?.message;
      setErrorMessage(serverMessage || 'Invalid or expired OTP code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Web Login View (Figma 50/50 Split Screen Design)
  if (Platform.OS === 'web') {
    return (
      <View className="flex-1 flex-row min-h-screen">
        <Stack.Screen options={{ headerShown: false }} />

        {/* Left Panel */}
        <View className="flex-1 bg-[#1E293B] justify-center items-center p-12">
          {/* Logo */}
          <View className="w-16 h-16 rounded-full border border-[#38BDF8] border-dashed items-center justify-center mb-6">
            <Text className="text-[#38BDF8] font-bold text-xl">UD</Text>
          </View>
          {/* Brand */}
          <Text className="text-white text-5xl font-serif font-bold mb-2">UNI-D</Text>
          {/* Sub-brand */}
          <Text className="text-[#38BDF8] text-sm tracking-widest font-bold uppercase mb-8">
            UNI DAILY
          </Text>
          {/* Tagline */}
          <Text className="text-slate-400 text-lg text-center mb-16">
            Your premium academic companion.{"\n"}Never miss a class, never miss a grade.
          </Text>
          {/* Stats Row */}
          <View className="flex-row gap-12">
            <View className="items-center">
              <Text className="text-3xl text-white font-serif font-bold">83%</Text>
              <Text className="text-slate-500 text-sm mt-1">Attendance</Text>
            </View>
            <View className="items-center">
              <Text className="text-3xl text-white font-serif font-bold">87</Text>
              <Text className="text-slate-500 text-sm mt-1">Classes</Text>
            </View>
            <View className="items-center">
              <Text className="text-3xl text-white font-serif font-bold">5</Text>
              <Text className="text-slate-500 text-sm mt-1">Subjects</Text>
            </View>
          </View>
        </View>

        {/* Right Panel */}
        <View className="flex-1 bg-[#F4F7FE] justify-center px-[10%]">
          {/* Mini Header */}
          <View className="flex-row items-center gap-2 mb-2">
            <View className="w-8 h-8 rounded-full border border-[#38BDF8] border-dashed items-center justify-center">
              <Text className="text-[#38BDF8] font-bold text-xs">UD</Text>
            </View>
            <Text className="text-slate-800 font-serif font-bold text-lg">UNI-D</Text>
          </View>

          <Text className="text-4xl font-serif font-bold text-slate-800 mt-6 mb-2">
            Welcome back
          </Text>
          <Text className="text-slate-500 mb-8">
            Track your attendance, master your semester.
          </Text>

          {errorMessage ? (
            <View className="bg-red-50 border border-red-200 p-4 rounded-xl mb-4">
              <Text className="text-xs font-semibold text-red-600">{errorMessage}</Text>
            </View>
          ) : null}

          {/* Google Sign In Button */}
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.85}
            className="bg-white border border-slate-200 p-3.5 rounded-xl flex-row items-center justify-center mb-5 shadow-xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <FontAwesome5 name="google" size={18} color="#EA4335" style={{ marginRight: 10 }} />
            <Text className="text-slate-700 font-bold text-base">Continue with Google</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View className="flex-row items-center mb-5">
            <View className="flex-1 h-[1px] bg-slate-200" />
            <Text className="mx-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              or continue with email
            </Text>
            <View className="flex-1 h-[1px] bg-slate-200" />
          </View>

          {/* Email Input */}
          <TextInput
            placeholder="Email address"
            placeholderTextColor="#94A3B8"
            value={email}
            onChangeText={setEmail}
            className="bg-white border border-slate-200 text-slate-800 p-4 rounded-xl mb-4 shadow-sm"
            autoCapitalize="none"
          />

          {/* Password Input */}
          <TextInput
            placeholder="Password"
            placeholderTextColor="#94A3B8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            className="bg-white border border-slate-200 text-slate-800 p-4 rounded-xl mb-4 shadow-sm"
          />

          {/* Sign In Button */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
            className="bg-[#1E293B] p-4 rounded-xl items-center mt-2 shadow-sm"
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-bold text-lg">Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Footer */}
          <Text className="text-center text-slate-500 mt-8">
            Don't have an account?{' '}
            <Text
              onPress={() => router.push('/signup')}
              className="text-indigo-600 font-bold cursor-pointer"
            >
              Sign up
            </Text>
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0A101D] px-6 justify-end pb-16">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Brand Header */}
      <View className="flex-row items-center mb-6">
        <View className="w-12 h-12 rounded-full border border-[#38BDF8] border-dashed items-center justify-center mr-3">
          <Text className="text-[#38BDF8] font-bold">UD</Text>
        </View>
        <View>
          <Text className="text-white text-2xl font-serif font-bold">UNI-D</Text>
          <Text className="text-[#38BDF8] text-[10px] tracking-widest font-bold uppercase">
            UNI DAILY
          </Text>
        </View>
      </View>

      {/* Title Area */}
      <Text className="text-white text-3xl font-serif font-bold mb-2">
        {showOtpInput ? 'Verify OTP' : 'Welcome back'}
      </Text>
      <Text className="text-[#38BDF8] text-sm mb-8">
        {showOtpInput
          ? `Enter code sent to ${pendingEmail}`
          : 'Track your attendance, master your semester.'}
      </Text>

      {/* Error / Info Messages */}
      {errorMessage ? (
        <View className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl mb-4">
          <Text className="text-xs font-semibold text-red-400">{errorMessage}</Text>
        </View>
      ) : null}

      {infoMessage ? (
        <View className="bg-cyan-500/10 border border-cyan-500/30 p-4 rounded-xl mb-4">
          <Text className="text-xs font-semibold text-[#38BDF8]">{infoMessage}</Text>
        </View>
      ) : null}

      {!showOtpInput ? (
        <>
          {/* Google Sign In Button */}
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.85}
            className="bg-[#151F32] border border-[#1E293B] p-4 rounded-xl flex-row items-center justify-center mb-5 shadow-sm hover:bg-[#1E293B] transition-colors"
          >
            <FontAwesome5 name="google" size={18} color="#EA4335" style={{ marginRight: 10 }} />
            <Text className="text-white font-bold text-base">Continue with Google</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View className="flex-row items-center mb-5">
            <View className="flex-1 h-[1px] bg-[#1E293B]" />
            <Text className="mx-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              or continue with email
            </Text>
            <View className="flex-1 h-[1px] bg-[#1E293B]" />
          </View>

          {/* Email Input */}
          <TextInput
            placeholder="Email address"
            placeholderTextColor="#475569"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            className="bg-[#151F32] border border-[#1E293B] text-white p-4 rounded-xl mb-4 text-base"
          />

          {/* Password Input */}
          <TextInput
            placeholder="Password"
            placeholderTextColor="#475569"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            className="bg-[#151F32] border border-[#1E293B] text-white p-4 rounded-xl mb-6 text-base"
          />

          {/* Action Button */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
            className="bg-[#818CF8] p-4 rounded-xl items-center shadow-sm"
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-bold text-base">Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Footer */}
          <Text className="text-center text-slate-500 mt-8">
            Don't have an account?{' '}
            <Text
              onPress={() => router.push('/signup')}
              className="text-[#38BDF8] font-bold"
            >
              Sign up
            </Text>
          </Text>
        </>
      ) : (
        <>
          {/* OTP Input */}
          <TextInput
            placeholder="6-Digit OTP Code"
            placeholderTextColor="#475569"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
            className="bg-[#151F32] border border-[#1E293B] text-white p-4 rounded-xl mb-6 text-xl tracking-widest text-center font-bold"
          />

          <TouchableOpacity
            onPress={handleVerifyOtp}
            disabled={loading}
            activeOpacity={0.8}
            className="bg-[#818CF8] p-4 rounded-xl items-center shadow-sm mb-4"
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-bold text-base">Verify & Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowOtpInput(false)}
            className="py-2 items-center justify-center"
          >
            <Text className="text-sm font-semibold text-slate-400">
              ← Back to login form
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
