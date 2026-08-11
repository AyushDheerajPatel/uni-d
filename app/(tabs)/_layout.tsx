import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Tabs, Slot, useRouter, usePathname, ErrorBoundaryProps } from 'expo-router';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../utils/supabase';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 bg-slate-900 justify-center items-center p-6">
      <View className="bg-slate-800 p-8 rounded-3xl max-w-md w-full border border-slate-700 items-center shadow-xl">
        <Text className="text-4xl mb-3">⚠️</Text>
        <Text className="text-xl font-bold text-white text-center font-serif mb-2">
          Tab View Error
        </Text>
        <Text className="text-xs text-slate-400 text-center mb-6">
          {error?.message || 'An unexpected error occurred in this view.'}
        </Text>
        <TouchableOpacity
          onPress={retry}
          className="bg-indigo-600 px-6 py-3 rounded-xl w-full items-center"
        >
          <Text className="text-white font-bold text-sm">Reload View</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Helper to ensure proper capitalization of names (e.g. "john doe" -> "John Doe")
const formatName = (str?: string | null): string => {
  if (!str || typeof str !== 'string') return 'Student';
  const trimmed = str.trim();
  if (!trimmed) return 'Student';
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [userName, setUserName] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    const verifyAuthSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error || !session) {
          console.log('[TAB AUTH GUARD] No active session found. Redirecting to /login...');
          setIsAuthenticated(false);
          await AsyncStorage.multiRemove(['userToken', 'userInfo', '@custom_time_slots']);
          router.replace('/login');
        } else {
          console.log('[TAB AUTH GUARD] Active session verified:', session.user.email);
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error('[TAB AUTH GUARD EXCEPTION]', err);
        if (isMounted) {
          setIsAuthenticated(false);
          await AsyncStorage.multiRemove(['userToken', 'userInfo', '@custom_time_slots']);
          router.replace('/login');
        }
      } finally {
        if (isMounted) setIsCheckingAuth(false);
      }
    };

    verifyAuthSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[TAB AUTH GUARD EVENT]', event, session?.user?.email);
      if (!session || event === 'SIGNED_OUT') {
        if (isMounted) setIsAuthenticated(false);
        await AsyncStorage.multiRemove(['userToken', 'userInfo', '@custom_time_slots']);
        router.replace('/login');
      } else if (session) {
        if (isMounted) setIsAuthenticated(true);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const authName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            (user.email ? user.email.split('@')[0] : '');

          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, name')
            .eq('id', user.id)
            .maybeSingle();

          const finalName = profile?.full_name || profile?.name || authName || 'Student';
          setUserName(finalName);
          return;
        }

        const userInfoStr = await AsyncStorage.getItem('userInfo');
        if (userInfoStr) {
          const u = JSON.parse(userInfoStr);
          if (u.name) setUserName(u.name);
        }
      } catch (e) {
        console.error('Error reading user info in sidebar:', e);
      }
    };
    loadUser();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleProfileUpdate = () => loadUser();
      window.addEventListener('user-profile-updated', handleProfileUpdate);
      return () => {
        window.removeEventListener('user-profile-updated', handleProfileUpdate);
      };
    }
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.multiRemove(['userToken', 'userInfo', '@custom_time_slots']);
      router.replace('/login');
    } catch (err) {
      await AsyncStorage.multiRemove(['userToken', 'userInfo', '@custom_time_slots']);
      router.replace('/login');
    }
  };

  const formattedUserName = formatName(userName);
  const initials = formattedUserName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const handleComingSoon = (label: string) => {
    const msg = `Coming Soon: ${label} feature is under development.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
      window.alert(msg);
    } else {
      Alert.alert('Coming Soon', msg);
    }
  };

  // Protected Route Render Check
  if (isCheckingAuth || isAuthenticated === null) {
    return (
      <View className="flex-1 bg-slate-950 justify-center items-center">
        <ActivityIndicator size="large" color="#818CF8" />
        <Text className="text-slate-400 text-xs mt-3 font-medium">Verifying session...</Text>
      </View>
    );
  }

  if (isAuthenticated === false) {
    return null;
  }

  // Web Layout with Fixed Left Sidebar Navigation & Independent Content ScrollView
  if (Platform.OS === 'web') {
    const navItems = [
      { label: 'Dashboard', icon: 'grid', route: '/' },
      { label: 'My Schedule', icon: 'calendar', route: '/schedule' },
      { label: 'Mark Attendance', icon: 'check-square', route: '/mark-attendance' },
      { label: 'Analytics', icon: 'pie-chart', route: '/analytics' },
      { label: 'Attendance History', icon: 'clock', route: '/history' },
      { label: 'Subjects', icon: 'book', route: '/subjects' },
      { label: 'Timetable', icon: 'list', route: '/timetable' },
      { label: 'Export/Backup', icon: 'download', route: '/export-backup' },
      { label: 'Settings', icon: 'settings', route: '/settings' },
    ];

    return (
      <View className="flex-1 flex-row h-[100vh] overflow-hidden bg-slate-50">
        {/* Fixed Left Web Sidebar */}
        <View className="w-64 h-full bg-white border-r border-gray-100 p-5 flex-col justify-between pb-4">
          <View className="flex-1">
            {/* Top Brand with FontAwesome5 fallback icon */}
            <View className="mb-8">
              <View className="flex-row items-center space-x-2.5 gap-2.5 mb-1">
                <FontAwesome5 name="graduation-cap" size={26} color="#2563EB" />
                <Text className="text-2xl font-extrabold text-gray-900 tracking-tight">
                  UNI-D
                </Text>
              </View>
              <Text className="text-xs text-gray-400 font-medium ml-1">
                uni daily
              </Text>
            </View>

            {/* Navigation Links */}
            <ScrollView showsVerticalScrollIndicator={false} className="flex-1 space-y-1.5">
              {navItems.map((item, index) => {
                const isActive =
                  item.route === '/'
                    ? pathname === '/' ||
                      pathname === '/(tabs)' ||
                      pathname === '/(tabs)/index' ||
                      pathname === ''
                    : item.route &&
                      (pathname === item.route ||
                        pathname === `/(tabs)${item.route}` ||
                        (item.route !== '/' && pathname.includes(item.route)));

                return (
                  <TouchableOpacity
                    key={index}
                    onPress={() => {
                      if ((item as any).action === 'coming_soon') {
                        handleComingSoon(item.label);
                      } else if ((item as any).action === 'mark') {
                        Alert.alert(
                          'Mark Attendance',
                          'Select any class status directly on your dashboard timeline!'
                        );
                      } else if (item.route) {
                        router.push(item.route as any);
                      } else {
                        handleComingSoon(item.label);
                      }
                    }}
                    className={`flex-row items-center px-3.5 py-3 rounded-xl mb-1 ${
                      isActive
                        ? 'bg-blue-50 border border-blue-100'
                        : 'bg-transparent hover:bg-gray-50'
                    }`}
                  >
                    <Feather
                      name={item.icon as any}
                      size={18}
                      color={isActive ? '#2563eb' : '#6b7280'}
                      style={{ marginRight: 12 }}
                    />
                    <Text
                      className={`text-sm ${
                        isActive ? 'text-blue-600 font-bold' : 'text-gray-600 font-semibold'
                      }`}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Bottom Profile Row */}
          <View className="pt-4 mt-auto border-t border-gray-100 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 mr-2">
              <View className="w-10 h-10 rounded-full bg-blue-600 items-center justify-center mr-3 shadow-sm">
                <Text className="text-white font-bold text-sm">{initials}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-gray-800" numberOfLines={1}>
                  {formattedUserName}
                </Text>
                <Text className="text-[11px] text-gray-400 font-medium">Student Account</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleLogout}
              className="p-2 rounded-xl bg-red-50 hover:bg-red-100"
            >
              <Feather name="log-out" size={16} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Right Content Area (Independent Dashboard ScrollView) */}
        <View className="flex-1 h-full">
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, padding: 20 }}
            showsVerticalScrollIndicator={false}
          >
            <Slot />
          </ScrollView>
        </View>
      </View>
    );
  }

  // Mobile Bottom Tabs Setup
  return (
    <View className="flex-1 min-h-screen bg-slate-100 dark:bg-slate-950">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#2563eb',
          tabBarInactiveTintColor: '#9ca3af',
          tabBarStyle: {
            backgroundColor: '#ffffff',
            borderTopWidth: 0,
            height: Platform.OS === 'ios' ? 80 : 65,
            paddingBottom: Platform.OS === 'ios' ? 24 : 10,
            paddingTop: 8,
            elevation: 10,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Feather name="home" size={size || 22} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="schedule"
          options={{
            title: 'Schedule',
            tabBarIcon: ({ color, size }) => (
              <Feather name="calendar" size={size || 22} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="add"
          options={{
            title: '',
            tabBarIcon: () => (
              <View className="w-11 h-11 rounded-full bg-blue-600 items-center justify-center -mt-5 shadow-md shadow-blue-500/40 border-2 border-white">
                <Feather name="plus" size={22} color="#ffffff" />
              </View>
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              Alert.alert(
                'Quick Action',
                'Select any class on your dashboard timeline to mark attendance!'
              );
            },
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: 'Analytics',
            tabBarIcon: ({ color, size }) => (
              <Feather name="pie-chart" size={size || 22} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
