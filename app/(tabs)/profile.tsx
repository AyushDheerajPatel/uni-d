import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../utils/supabase';

export interface SubjectStat {
  subject: string;
  totalClasses: number;
  attendedClasses: number;
  bunkedClasses: number;
  absentClasses: number;
  teacherAbsentClasses: number;
  percentage: number;
  isBelow75: boolean;
}

export default function ProfileScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overallPercentage, setOverallPercentage] = useState(100);
  const [grandTotal, setGrandTotal] = useState(0);
  const [grandAttended, setGrandAttended] = useState(0);
  const [grandBunked, setGrandBunked] = useState(0);
  const [grandAbsent, setGrandAbsent] = useState(0);
  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);

  // Mobile Edit Profile Modal State
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [profileName, setProfileName] = useState('Ayush Patel');
  const [profileCourse, setProfileCourse] = useState('B.Tech Computer Science');
  const [profileEnroll, setProfileEnroll] = useState('23100BTCSE14814');

  useEffect(() => {
    const fetchSupabaseProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          if (user.user_metadata?.full_name) setProfileName(user.user_metadata.full_name);
          if (user.user_metadata?.course) setProfileCourse(user.user_metadata.course);

          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (profile) {
            if (profile.full_name) setProfileName(profile.full_name);
            if (profile.course) setProfileCourse(profile.course);
          }
        }
      } catch (err) {
        console.error('Error fetching Supabase profile:', err);
      }
    };
    fetchSupabaseProfile();
  }, []);

  const handleSaveMobileProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').upsert({
          id: user.id,
          full_name: profileName,
          course: profileCourse,
          updated_at: new Date().toISOString(),
        });
      }
      setEditModalVisible(false);
    } catch (e) {
      console.error('Error updating mobile profile:', e);
      setEditModalVisible(false);
    }
  };

  // Default subject list fallback if backend has no logs yet
  const defaultSubjects: SubjectStat[] = [
    {
      subject: 'Higher Mathematics III',
      totalClasses: 12,
      attendedClasses: 10,
      bunkedClasses: 2,
      absentClasses: 0,
      teacherAbsentClasses: 0,
      percentage: 83,
      isBelow75: false,
    },
    {
      subject: 'Quantum & Applied Physics',
      totalClasses: 10,
      attendedClasses: 6,
      bunkedClasses: 3,
      absentClasses: 1,
      teacherAbsentClasses: 0,
      percentage: 60,
      isBelow75: true,
    },
    {
      subject: 'Data Structures & Algorithms',
      totalClasses: 15,
      attendedClasses: 13,
      bunkedClasses: 1,
      absentClasses: 1,
      teacherAbsentClasses: 0,
      percentage: 87,
      isBelow75: false,
    },
    {
      subject: 'Digital Systems & Microcontrollers',
      totalClasses: 8,
      attendedClasses: 5,
      bunkedClasses: 2,
      absentClasses: 1,
      teacherAbsentClasses: 0,
      percentage: 63,
      isBelow75: true,
    },
  ];

  const fetchStats = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: logs } = await supabase
          .from('attendance_logs')
          .select('*')
          .eq('user_id', user.id);

        if (logs && logs.length > 0) {
          const total = logs.length;
          const attended = logs.filter((l) => l.status === 'present' || l.status === 'late').length;
          const bunked = logs.filter((l) => l.status === 'bunk').length;
          const absent = logs.filter((l) => l.status === 'absent').length;
          const rate = total > 0 ? Math.round((attended / total) * 100) : 100;

          setOverallPercentage(rate);
          setGrandTotal(total);
          setGrandAttended(attended);
          setGrandBunked(bunked);
          setGrandAbsent(absent);
        } else {
          setSubjectStats(defaultSubjects);
        }
      } else {
        setSubjectStats(defaultSubjects);
      }
    } catch (error) {
      console.log('[SUPABASE STATS ERROR]', error);
      setSubjectStats(defaultSubjects);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const below75Count = subjectStats.filter((s) => s.isBelow75).length;

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('userToken');
      await AsyncStorage.removeItem('userInfo');
      router.replace('/login');
    } catch (err) {
      router.replace('/login');
    }
  };

  const mobileSubjectBreakdown = [
    {
      name: 'Mathematics',
      percentage: '82%',
      percentNum: 82,
      subtext: '18/22 · Dr. Priya Sharma',
      dotColor: 'bg-[#818CF8]',
      barColor: '#818CF8',
      textColor: 'text-[#4ADE80]',
    },
    {
      name: 'Computer Science',
      percentage: '95%',
      percentNum: 95,
      subtext: '19/20 · Dr. Rahul Verma',
      dotColor: 'bg-[#22D3EE]',
      barColor: '#22D3EE',
      textColor: 'text-[#4ADE80]',
    },
    {
      name: 'Physics',
      percentage: '70%',
      percentNum: 70,
      subtext: '14/20 · Mr. Arjun Mehta',
      dotColor: 'bg-[#FBBF24]',
      barColor: '#F87171',
      textColor: 'text-[#F87171]',
    },
    {
      name: 'English Literature',
      percentage: '100%',
      percentNum: 100,
      subtext: '15/15 · Ms. Kavya Nair',
      dotColor: 'bg-[#F472B6]',
      barColor: '#F472B6',
      textColor: 'text-[#4ADE80]',
    },
    {
      name: 'Data Structures',
      percentage: '70%',
      percentNum: 70,
      subtext: '14/20 · Prof. Vikram Shah',
      dotColor: 'bg-[#34D399]',
      barColor: '#F87171',
      textColor: 'text-[#F87171]',
    },
  ];

  const mobileDetailsGrid = [
    { value: '5th', label: 'Semester' },
    { value: '3rd Year', label: 'Year' },
    { value: 'CS', label: 'Branch' },
    { value: 'B', label: 'Section' },
  ];

  // Web View
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView className="flex-1 min-h-screen bg-slate-50 dark:bg-slate-950">
        <StatusBar barStyle="dark-content" />

        {/* Top Header Bar */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <TouchableOpacity
            onPress={() => router.back()}
            className="flex-row items-center py-1 pr-3"
          >
            <Text className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mr-1">
              ←
            </Text>
            <Text className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
              Back
            </Text>
          </TouchableOpacity>

          <Text className="text-base font-bold text-slate-900 dark:text-white">
            Analytics & Profile
          </Text>

          <TouchableOpacity
            onPress={fetchStats}
            className="p-1"
          >
            <Text className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
              Refresh
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          className="flex-1 w-full"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100, flexGrow: 1 }}
          showsVerticalScrollIndicator={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
          }
        >
          {loading && !refreshing ? (
            <View className="py-12 items-center justify-center">
              <ActivityIndicator size="large" color="#4f46e5" />
              <Text className="text-xs text-slate-500 mt-3 font-medium">
                Calculating 75% Attendance Stats...
              </Text>
            </View>
          ) : (
            <>
              {/* Top Summary Card */}
              <View className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm mb-6">
                <View className="flex-row items-center justify-between mb-4">
                  <View>
                    <Text className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                      Student Performance
                    </Text>
                    <Text className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                      Overall Attendance
                    </Text>
                  </View>

                  {/* Overall Percentage Badge */}
                  <View
                    className={`px-4 py-2 rounded-2xl border items-center ${
                      overallPercentage >= 75
                        ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800'
                        : 'bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800'
                    }`}
                  >
                    <Text
                      className={`text-2xl font-black ${
                        overallPercentage >= 75
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {overallPercentage}%
                    </Text>
                    <Text
                      className={`text-[9px] font-extrabold uppercase ${
                        overallPercentage >= 75
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {overallPercentage >= 75 ? 'Safe Status' : 'Action Needed'}
                    </Text>
                  </View>
                </View>

                {/* 75% Threshold Alert Banner inside Summary */}
                {below75Count > 0 ? (
                  <View className="bg-rose-500/10 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl p-3.5 flex-row items-center mb-4">
                    <Text className="text-xl mr-3">🚨</Text>
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-rose-700 dark:text-rose-300">
                        75% Attendance Warning Triggered!
                      </Text>
                      <Text className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                        {below75Count} {below75Count === 1 ? 'subject' : 'subjects'} falling below the mandatory 75% criteria.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View className="bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-2xl p-3.5 flex-row items-center mb-4">
                    <Text className="text-xl mr-3">🎉</Text>
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        All Subjects Above 75%!
                      </Text>
                      <Text className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                        Great job! Your attendance is currently safe across all registered subjects.
                      </Text>
                    </View>
                  </View>
                )}

                {/* Quick Summary Grid */}
                <View className="flex-row items-center justify-between bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <View className="items-center flex-1">
                    <Text className="text-[10px] font-bold text-slate-400 uppercase">Total</Text>
                    <Text className="text-sm font-black text-slate-800 dark:text-slate-100 mt-0.5">
                      {grandTotal}
                    </Text>
                  </View>
                  <View className="w-[1px] h-6 bg-slate-200 dark:bg-slate-700" />
                  <View className="items-center flex-1">
                    <Text className="text-[10px] font-bold text-emerald-500 uppercase">Attended</Text>
                    <Text className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {grandAttended}
                    </Text>
                  </View>
                  <View className="w-[1px] h-6 bg-slate-200 dark:bg-slate-700" />
                  <View className="items-center flex-1">
                    <Text className="text-[10px] font-bold text-amber-500 uppercase">Bunked</Text>
                    <Text className="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">
                      {grandBunked}
                    </Text>
                  </View>
                  <View className="w-[1px] h-6 bg-slate-200 dark:bg-slate-700" />
                  <View className="items-center flex-1">
                    <Text className="text-[10px] font-bold text-rose-500 uppercase">Absent</Text>
                    <Text className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">
                      {grandAbsent}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Subject-Wise Attendance Breakdown */}
              <View className="mb-4 flex-row items-center justify-between">
                <Text className="text-base font-bold text-slate-900 dark:text-white">
                  Subject Breakdown
                </Text>
                <Text className="text-xs font-semibold text-slate-400">
                  Mandatory 75% Target
                </Text>
              </View>

              {subjectStats.map((item, idx) => (
                <View
                  key={idx}
                  className={`bg-white dark:bg-slate-900 rounded-3xl p-5 border shadow-sm mb-4 ${
                    item.isBelow75
                      ? 'border-rose-300 dark:border-rose-900/80 bg-rose-50/10'
                      : 'border-slate-200/80 dark:border-slate-800'
                  }`}
                >
                  {/* Card Title & Badge */}
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-base font-bold text-slate-900 dark:text-white flex-1 mr-2">
                      {item.subject}
                    </Text>

                    {item.isBelow75 ? (
                      <View className="bg-rose-100 dark:bg-rose-950 px-3 py-1 rounded-full border border-rose-300 dark:border-rose-800">
                        <Text className="text-[11px] font-extrabold text-rose-700 dark:text-rose-300">
                          Below 75%
                        </Text>
                      </View>
                    ) : (
                      <View className="bg-emerald-100 dark:bg-emerald-950 px-3 py-1 rounded-full border border-emerald-300 dark:border-emerald-800">
                        <Text className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                          Safe ✓
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Progress Bar Container */}
                  <View className="mt-2 mb-3">
                    <View className="flex-row justify-between items-center mb-1.5">
                      <Text className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        Attendance Ratio
                      </Text>
                      <Text className="text-xs font-extrabold text-slate-900 dark:text-white">
                        {item.percentage}% ({item.attendedClasses}/{item.totalClasses})
                      </Text>
                    </View>

                    <View className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <View
                        className={`h-full rounded-full ${
                          item.isBelow75 ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(item.percentage, 100)}%` }}
                      />
                    </View>
                  </View>

                  {/* PROMINENT 75% WARNING BANNER OR SAFE BADGE */}
                  {item.isBelow75 ? (
                    <View className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-2xl p-3 flex-row items-center mt-1">
                      <Text className="text-base mr-2">⚠️</Text>
                      <View className="flex-1">
                        <Text className="text-xs font-bold text-rose-700 dark:text-rose-300">
                          Warning: Below 75%!
                        </Text>
                        <Text className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                          You need to attend next {Math.ceil((0.75 * item.totalClasses - item.attendedClasses) / 0.25) || 1} consecutive classes to reach 75%.
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 rounded-2xl p-3 flex-row items-center mt-1">
                      <Text className="text-base mr-2">🛡️</Text>
                      <View className="flex-1">
                        <Text className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                          Safe: Attendance criteria met
                        </Text>
                        <Text className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                          You can safely bunk {Math.floor((item.attendedClasses - 0.75 * item.totalClasses) / 0.75)} more classes while maintaining 75%.
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const mobileInitials =
    profileName
      .trim()
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'AP';

  // Mobile Profile UI (Dark Theme Figma Design)
  return (
    <View className="flex-1 bg-[#0A101D] relative">
      <ScrollView
        className="flex-1 px-5 pt-12 pb-24"
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <Text className="text-white text-4xl font-serif font-bold mb-1">Profile</Text>
        <Text className="text-slate-400 text-sm mb-6">Student details & subject breakdown</Text>

        {/* Main Profile Card */}
        <View className="bg-[#151F32] rounded-3xl p-5 mb-5 shadow-xs relative">
          {/* Edit Button */}
          <TouchableOpacity
            onPress={() => setEditModalVisible(true)}
            activeOpacity={0.8}
            className="absolute top-5 right-5 bg-white/10 px-3 py-1.5 rounded-full z-10"
          >
            <Text className="text-white text-xs font-bold">✏️ Edit</Text>
          </TouchableOpacity>

          {/* Student Info Row */}
          <View className="flex-row items-center mb-5">
            {/* Avatar */}
            <View className="w-16 h-16 rounded-2xl bg-cyan-500 items-center justify-center mr-4 shadow-sm">
              <Text className="text-white text-2xl font-bold">{mobileInitials}</Text>
            </View>
            {/* Text Info Box */}
            <View className="flex-1 pr-12">
              <Text className="text-white text-xl font-serif font-bold">{profileName}</Text>
              <Text className="text-slate-400 text-xs mt-1">{profileCourse}</Text>
              <Text className="text-slate-500 text-[10px] mt-0.5">
                Enroll: {profileEnroll}
              </Text>
            </View>
          </View>

          {/* Status Badge */}
          <View className="bg-[#064E3B]/30 border border-[#047857]/50 rounded-2xl p-4 flex-row items-center">
            {/* Glowing Dot */}
            <View className="w-3 h-3 rounded-full bg-[#4ADE80] shadow-[0_0_8px_#4ADE80] mr-3" />
            <View>
              <Text className="text-[#4ADE80] font-bold text-sm">On Track</Text>
              <Text className="text-slate-400 text-xs mt-0.5">83% overall attendance</Text>
            </View>
          </View>
        </View>

        {/* Subject Breakdown Card */}
        <View className="bg-[#151F32] rounded-3xl p-6 mb-5 shadow-xs">
          <Text className="text-white font-bold text-lg mb-6">Subject Breakdown</Text>
          {mobileSubjectBreakdown.map((item, idx) => {
            const isLast = idx === mobileSubjectBreakdown.length - 1;

            return (
              <View key={idx} className={isLast ? '' : 'mb-5'}>
                {/* Header Row */}
                <View className="flex-row justify-between items-center mb-1">
                  <View className="flex-row items-center">
                    <View className={`w-2 h-2 rounded-full mr-2 ${item.dotColor}`} />
                    <Text className="text-white font-medium text-sm">{item.name}</Text>
                  </View>
                  <Text className={`font-bold text-sm ${item.textColor}`}>
                    {item.percentage}
                  </Text>
                </View>

                {/* Progress Bar */}
                <View className="h-1.5 bg-[#0A101D] rounded-full mt-2 mb-1.5 overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${item.percentNum}%`,
                      backgroundColor: item.barColor,
                    }}
                  />
                </View>

                {/* Subtext */}
                <Text className="text-slate-500 text-[10px]">{item.subtext}</Text>
              </View>
            );
          })}
        </View>

        {/* 2x2 Details Grid */}
        <View className="flex-row flex-wrap justify-between mb-5">
          {mobileDetailsGrid.map((item, idx) => (
            <View
              key={idx}
              className="w-[48%] bg-[#151F32] p-4 rounded-2xl items-center mb-3 shadow-xs"
            >
              <Text className="text-white font-serif text-xl font-bold">{item.value}</Text>
              <Text className="text-slate-400 text-xs mt-1 font-medium">{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity
          onPress={handleLogout}
          activeOpacity={0.8}
          className="border border-red-500/30 bg-red-500/5 p-4 rounded-2xl items-center mb-8"
        >
          <Text className="text-red-500 font-bold text-lg">Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Profile Bottom Sheet Modal */}
      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/80">
          <View className="bg-[#151F32] rounded-t-[32px] p-6 pt-4">
            {/* Header */}
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-white text-2xl font-serif font-bold">Edit Profile</Text>
              <TouchableOpacity
                onPress={() => setEditModalVisible(false)}
                className="w-8 h-8 rounded-full bg-[#1E293B] items-center justify-center"
              >
                <Text className="text-slate-400 font-bold text-sm">✕</Text>
              </TouchableOpacity>
            </View>

            {/* Inputs */}
            <View className="mb-4">
              <Text className="text-[#38BDF8] text-[10px] font-bold uppercase tracking-widest mb-2">
                NAME
              </Text>
              <TextInput
                value={profileName}
                onChangeText={setProfileName}
                className="bg-[#1E293B] text-white p-4 rounded-xl text-sm font-medium"
                placeholder="Enter full name..."
                placeholderTextColor="#64748B"
              />
            </View>

            <View className="mb-4">
              <Text className="text-[#38BDF8] text-[10px] font-bold uppercase tracking-widest mb-2">
                COURSE
              </Text>
              <TextInput
                value={profileCourse}
                onChangeText={setProfileCourse}
                className="bg-[#1E293B] text-white p-4 rounded-xl text-sm font-medium"
                placeholder="Enter course..."
                placeholderTextColor="#64748B"
              />
            </View>

            <View className="mb-4">
              <Text className="text-[#38BDF8] text-[10px] font-bold uppercase tracking-widest mb-2">
                ENROLLMENT NO.
              </Text>
              <TextInput
                value={profileEnroll}
                onChangeText={setProfileEnroll}
                className="bg-[#1E293B] text-white p-4 rounded-xl text-sm font-medium"
                placeholder="Enter enrollment number..."
                placeholderTextColor="#64748B"
              />
            </View>

            {/* Save Button */}
            <TouchableOpacity
              onPress={handleSaveMobileProfile}
              activeOpacity={0.8}
              className="bg-indigo-500 p-4 rounded-2xl items-center mt-4 mb-4 shadow-sm"
            >
              <Text className="text-white font-bold text-lg">Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
