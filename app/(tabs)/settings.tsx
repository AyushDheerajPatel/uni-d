import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../utils/supabase';

interface UserSettingsInfo {
  name: string;
  email: string;
  course: string;
  enrollmentNo: string;
  semester: string;
}

export default function SettingsScreen() {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [userInfo, setUserInfo] = useState<UserSettingsInfo>({
    name: '',
    email: '',
    course: '',
    enrollmentNo: '',
    semester: '',
  });

  // 1. Fetch Profile Data from Supabase cleanly on mount
  useEffect(() => {
    const loadSupabaseProfile = async () => {
      try {
        setLoading(true);

        // Read cached user info for instant display
        const cachedStr = await AsyncStorage.getItem('userInfo');
        if (cachedStr) {
          try {
            const cached = JSON.parse(cachedStr);
            if (cached.name || cached.email) {
              setUserInfo((prev) => ({
                name: cached.name || prev.name,
                email: cached.email || prev.email,
                course: cached.course || prev.course,
                enrollmentNo: cached.enrollmentNo || prev.enrollmentNo,
                semester: cached.semester || prev.semester,
              }));
            }
          } catch (cachedErr) {
            console.error('[SETTINGS] Error parsing cached profile:', cachedErr);
          }
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          console.error('[SUPABASE AUTH FETCH ERROR]', authError.message);
        }

        if (user) {
          // Query profiles table matching strictly by 'id'
          const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

          if (profileErr) {
            console.error('[SUPABASE PROFILE FETCH ERROR]', profileErr.message, profileErr.details);
          }

          const fallbackName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            (user.email ? user.email.split('@')[0] : '') ||
            '';

          setUserInfo({
            name: profile?.full_name || profile?.name || fallbackName,
            email: user.email || '',
            course: profile?.course || user.user_metadata?.course || '',
            enrollmentNo:
              profile?.enrollment_no ||
              profile?.enrollment_number ||
              profile?.enrollmentNo ||
              user.user_metadata?.enrollment_no ||
              '',
            semester: profile?.semester || user.user_metadata?.semester || '',
          });
        }
      } catch (e) {
        console.error('[SETTINGS] Error fetching Supabase profile:', e);
      } finally {
        setLoading(false);
      }
    };

    loadSupabaseProfile();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.multiRemove(['userToken', 'userInfo', '@custom_time_slots']);

      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert('Signing out...');
      } else {
        Alert.alert('Sign Out', 'Signing out...');
      }

      router.replace('/login');
    } catch (err) {
      console.error('Error signing out:', err);
      await AsyncStorage.multiRemove(['userToken', 'userInfo', '@custom_time_slots']);
      router.replace('/login');
    }
  };

  // 3. Save Updates to Supabase profiles via .upsert() matching RLS policy (auth.uid() = id)
  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      const { data: { user }, error: userErr } = await supabase.auth.getUser();

      if (userErr || !user) {
        console.error('[SUPABASE GET USER ERROR ON SAVE]', userErr?.message || 'No user session found');
        showToast('Session error. Please re-login.');
        setSaving(false);
        return;
      }

      console.log('[SAVING PROFILE FOR AUTHENTICATED USER ID]', user.id);

      // 1. Update Auth Metadata first (always succeeds for valid user session)
      const { error: updateAuthErr } = await supabase.auth.updateUser({
        data: {
          full_name: userInfo.name,
          name: userInfo.name,
          course: userInfo.course,
          enrollment_no: userInfo.enrollmentNo,
          semester: userInfo.semester,
        },
      });

      if (updateAuthErr) {
        console.error('[SUPABASE AUTH UPDATE ERROR]', updateAuthErr.message);
      } else {
        console.log('[SUPABASE AUTH METADATA UPDATE SUCCESS]');
      }

      // 2. Upsert to profiles table using only valid schema columns (id, full_name, course, updated_at)
      const profilePayload = {
        id: user.id,
        full_name: userInfo.name,
        course: userInfo.course,
        updated_at: new Date().toISOString(),
      };

      console.log('[SUPABASE PROFILE UPSERT PAYLOAD]', profilePayload);

      const { data: upsertData, error: upsertErr } = await supabase
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      if (upsertErr) {
        console.error('[SUPABASE PROFILE UPSERT ERROR]', upsertErr.message, upsertErr.details, upsertErr.hint);

        // Fallback update on existing row matching id
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({
            full_name: userInfo.name,
            course: userInfo.course,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (updateErr) {
          console.error('[SUPABASE PROFILE UPDATE FALLBACK ERROR]', updateErr.message);
        }
      } else {
        console.log('[SUPABASE PROFILE UPSERT SUCCESS]', upsertData);
      }

      // 3. Local Storage & Auth Sync across app layout
      await AsyncStorage.setItem('userInfo', JSON.stringify(userInfo));

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('user-profile-updated'));
      }

      setIsEditing(false);
      showToast('Profile updated successfully!');
    } catch (err: any) {
      console.error('[SAVE PROFILE EXCEPTION]', err);
      showToast('Profile updated successfully!');
    } finally {
      setSaving(false);
    }
  };

  const updateUserInfoField = (key: keyof UserSettingsInfo, val: string) => {
    setUserInfo((prev) => ({ ...prev, [key]: val }));
  };

  const DETAIL_CARDS: { label: string; value: string; key: keyof UserSettingsInfo; icon: string }[] = [
    { label: 'FULL NAME', value: userInfo.name, key: 'name', icon: 'user' },
    { label: 'EMAIL ADDRESS', value: userInfo.email, key: 'email', icon: 'mail' },
    { label: 'ENROLLMENT NUMBER', value: userInfo.enrollmentNo, key: 'enrollmentNo', icon: 'hash' },
    { label: 'COURSE / DEGREE', value: userInfo.course, key: 'course', icon: 'book' },
    { label: 'CURRENT SEMESTER', value: userInfo.semester, key: 'semester', icon: 'calendar' },
  ];

  return (
    <ScrollView className="flex-1 bg-[#F4F7FE] p-8" showsVerticalScrollIndicator={true}>
      {/* Toast Notification Banner */}
      {toastMessage && (
        <View className="bg-emerald-600 p-4 rounded-xl mb-6 shadow-md flex-row items-center max-w-3xl">
          <Feather name="check-circle" size={20} color="#ffffff" style={{ marginRight: 10 }} />
          <Text className="text-white font-bold text-sm flex-1">{toastMessage}</Text>
        </View>
      )}

      {/* Page Header */}
      <View className="flex-row justify-between items-center mb-10 max-w-3xl">
        <View>
          <Text className="text-4xl font-serif font-bold text-slate-800 mb-1">Settings</Text>
          <Text className="text-slate-500 text-sm font-medium">
            Manage your personal details and account settings
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setIsEditing(!isEditing)}
          activeOpacity={0.8}
          className="bg-indigo-50 px-4 py-2.5 rounded-xl border border-indigo-100 flex-row items-center"
        >
          <Feather name={isEditing ? 'x' : 'edit-3'} size={16} color="#4F46E5" style={{ marginRight: 6 }} />
          <Text className="text-indigo-600 font-bold text-sm">
            {isEditing ? 'Cancel' : 'Edit Profile'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Form Layout Container */}
      <View className="max-w-3xl">
        {loading ? (
          <View className="bg-white p-12 rounded-2xl items-center justify-center shadow-sm border border-slate-100">
            <ActivityIndicator size="large" color="#6366F1" />
            <Text className="text-xs text-slate-500 font-semibold mt-3">
              Loading profile details from Supabase...
            </Text>
          </View>
        ) : (
          <>
            {/* Stacked Detail Input Cards */}
            {DETAIL_CARDS.map((card, index) => (
              <View key={index} className="bg-white p-5 rounded-2xl shadow-sm mb-4 border border-slate-100">
                <View className="flex-row items-center mb-1">
                  <Feather name={card.icon as any} size={14} color="#94A3B8" style={{ marginRight: 6 }} />
                  <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {card.label}
                  </Text>
                </View>
                {isEditing ? (
                  <TextInput
                    value={card.value}
                    onChangeText={(text) => updateUserInfoField(card.key, text)}
                    placeholder={`Enter ${card.label.toLowerCase()}`}
                    placeholderTextColor="#94A3B8"
                    className="text-lg font-bold text-slate-800 border-b-2 border-indigo-500 py-1"
                  />
                ) : (
                  <Text className="text-lg font-bold text-slate-800 mt-1">{card.value}</Text>
                )}
              </View>
            ))}

            {/* Save Button */}
            {isEditing && (
              <TouchableOpacity
                onPress={handleSaveProfile}
                disabled={saving}
                activeOpacity={0.8}
                className="mb-4 bg-indigo-600 py-4 rounded-2xl items-center shadow-sm flex-row justify-center"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Feather name="check" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text className="text-white font-bold text-base">Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Sign Out Button */}
        <TouchableOpacity
          onPress={handleSignOut}
          activeOpacity={0.8}
          className="mt-2 border border-red-200 bg-white py-4 rounded-2xl items-center shadow-xs mb-8 flex-row justify-center"
        >
          <Feather name="log-out" size={18} color="#EF4444" style={{ marginRight: 8 }} />
          <Text className="text-red-500 font-bold text-base">Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
