import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  Switch,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../utils/supabase';
import { pickImageFromLibrary, uploadImageToStorage } from '../../utils/imagePickerHelper';

interface TimetableItem {
  id?: string;
  user_id?: string;
  subject: string;
  day: string;
  start_time?: string;
  end_time?: string;
  room?: string;
  class_type?: string;
}

interface AttendanceLog {
  id?: string;
  user_id?: string;
  subject: string;
  status: string;
  date: string;
  notes?: string;
}

interface SubjectStat {
  name: string;
  attended: number;
  total: number;
  percentage: number;
  isAtRisk: boolean;
}

const formatName = (str?: string | null): string => {
  if (!str || typeof str !== 'string') return 'User';
  const trimmed = str.trim();
  if (!trimmed) return 'User';
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

export default function HomeScreen() {
  const router = useRouter();
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [userName, setUserName] = useState('User');
  const [loadingData, setLoadingData] = useState(true);

  const [todayClasses, setTodayClasses] = useState<TimetableItem[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);

  // Mobile Bottom Sheet Modal State
  const [mobileActiveSubject, setMobileActiveSubject] = useState<{
    name: string;
    time: string;
    borderColor: string;
  } | null>(null);
  const [mobileMarkStatus, setMobileMarkStatus] = useState<
    'present' | 'absent' | 'bunk' | 'teacher_off' | null
  >(null);
  const [mobileIsSaved, setMobileIsSaved] = useState(false);
  const [mobileApplyAll, setMobileApplyAll] = useState(false);
  const [mobileNotesInput, setMobileNotesInput] = useState('');
  const [mobileReasonInput, setMobileReasonInput] = useState('');

  const closeMobileModal = () => {
    setMobileActiveSubject(null);
    setMobileMarkStatus(null);
    setMobileIsSaved(false);
    setMobileApplyAll(false);
    setMobileNotesInput('');
    setMobileReasonInput('');
  };

  // Check auth and user info
  useEffect(() => {
    const checkUserAuth = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          router.replace('/login');
          return;
        }
        const userInfoStr = await AsyncStorage.getItem('userInfo');
        if (userInfoStr) {
          try {
            const u = JSON.parse(userInfoStr);
            if (u.name) setUserName(u.name.split(' ')[0]);
          } catch (e) {
            console.error('Error parsing userInfo:', e);
          }
        }
        setIsAuthChecked(true);
      } catch (err) {
        console.error('Error checking user token:', err);
        router.replace('/login');
      }
    };
    checkUserAuth();
  }, []);

  // Fetch real-time data from Supabase: timetable + attendance_logs
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoadingData(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadingData(false);
        return;
      }

      // 1. Query timetable for classes matching current day of week and user_id
      const dayCodes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const dayFullNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayObj = new Date();
      const currentDayCode = dayCodes[todayObj.getDay()];
      const currentDayFull = dayFullNames[todayObj.getDay()];

      const { data: ttData, error: ttError } = await supabase
        .from('timetable')
        .select('*')
        .eq('user_id', user.id);

      if (ttError) {
        console.error('[SUPABASE DASHBOARD TIMETABLE ERROR]', ttError.message);
      } else if (ttData) {
        const filteredToday = ttData.filter((item: any) => {
          if (!item.day) return false;
          const d = item.day.toString().trim().toUpperCase();
          return (
            d === currentDayCode ||
            d === currentDayFull.toUpperCase() ||
            d.startsWith(currentDayCode)
          );
        });
        setTodayClasses(filteredToday);
      }

      // 2. Query attendance_logs for the user to dynamically calculate overall attendance
      const { data: logData, error: logError } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_id', user.id);

      if (logError) {
        console.error('[SUPABASE DASHBOARD LOGS ERROR]', logError.message);
      } else if (logData) {
        setAttendanceLogs(logData);
      }
    } catch (err) {
      console.error('[SUPABASE DASHBOARD FETCH EXCEPTION]', err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthChecked) {
      fetchDashboardData();
    }
  }, [isAuthChecked, fetchDashboardData]);

  const [mobilePhotoUrl, setMobilePhotoUrl] = useState<string | null>(null);

  // Handle saving attendance log from mobile bottom sheet modal
  const handleMobileSaveAttendance = async () => {
    if (!mobileActiveSubject) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const todayStr = new Date().toISOString().split('T')[0];
        const statusMap: Record<string, string> = {
          present: 'present',
          absent: 'absent',
          bunk: 'bunk',
          teacher_off: 'teacher_off',
        };
        const mappedStatus = statusMap[mobileMarkStatus || 'present'] || 'present';
        const notesStr = mobileNotesInput || mobileReasonInput || (mobilePhotoUrl ? `Photo: ${mobilePhotoUrl}` : '');

        const cleanPayload = {
          user_id: user.id,
          subject: mobileActiveSubject.name,
          date: todayStr,
          status: mappedStatus,
          notes: notesStr,
        };

        // Check if log entry exists for subject + date
        const { data: existingLogs } = await supabase
          .from('attendance_logs')
          .select('id')
          .eq('user_id', user.id)
          .eq('subject', mobileActiveSubject.name)
          .eq('date', todayStr);

        if (existingLogs && existingLogs.length > 0) {
          const existingId = existingLogs[0].id;
          const { error: updateErr } = await supabase
            .from('attendance_logs')
            .update(cleanPayload)
            .eq('id', existingId);

          if (updateErr) {
            console.error('[INDEX MOBILE ATTENDANCE UPDATE ERROR]', updateErr.message);
          }
        } else {
          const { error: insertErr } = await supabase
            .from('attendance_logs')
            .insert([cleanPayload]);

          if (insertErr) {
            console.error('[INDEX MOBILE ATTENDANCE INSERT ERROR]', insertErr.message);
          }
        }

        fetchDashboardData();
      }
    } catch (e) {
      console.error('Error saving mobile attendance to Supabase:', e);
    }
    setMobileIsSaved(true);
  };

  // Date and Time calculation helpers
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  const todayFormattedStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Calculate dynamic stats from attendance_logs
  const totalClassesCount = attendanceLogs.length;
  const presentClassesCount = attendanceLogs.filter((l) => {
    const s = String(l.status || '').toLowerCase();
    return s === 'present' || s === 'late';
  }).length;
  const absentClassesCount = attendanceLogs.filter(
    (l) => String(l.status || '').toLowerCase() === 'absent'
  ).length;
  const bunkedClassesCount = attendanceLogs.filter(
    (l) => String(l.status || '').toLowerCase() === 'bunk'
  ).length;
  const lateClassesCount = attendanceLogs.filter(
    (l) => String(l.status || '').toLowerCase() === 'late'
  ).length;

  const overallPercentage =
    totalClassesCount > 0 ? Math.round((presentClassesCount / totalClassesCount) * 100) : 100;

  // Calculate subject-wise stats dynamically from attendance_logs
  const subjectStatsList: SubjectStat[] = (() => {
    const map: Record<string, { attended: number; total: number }> = {};

    attendanceLogs.forEach((log) => {
      const subj = log.subject || 'General';
      if (!map[subj]) map[subj] = { attended: 0, total: 0 };
      map[subj].total += 1;
      const s = String(log.status || '').toLowerCase();
      if (s === 'present' || s === 'late') {
        map[subj].attended += 1;
      }
    });

    return Object.keys(map).map((subj) => {
      const { attended, total } = map[subj];
      const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
      return {
        name: subj,
        attended,
        total,
        percentage: pct,
        isAtRisk: pct < 75,
      };
    });
  })();

  const atRiskCount = subjectStatsList.filter((s) => s.isAtRisk).length;

  if (!isAuthChecked) {
    return (
      <View className="flex-1 bg-slate-100 dark:bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Web UI: Dynamic Data from Supabase
  if (Platform.OS === 'web') {
    return (
      <ScrollView className="flex-1 bg-[#F4F7FE] p-8">
        {/* Header Section */}
        <Text className="text-4xl font-serif font-bold text-slate-800 mb-1">
          {greeting}, {formatName(userName)}
        </Text>
        <Text className="text-slate-500 text-sm font-medium mb-8">
          {todayFormattedStr} • Semester 5
        </Text>

        {loadingData ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="text-slate-500 text-xs font-semibold mt-3">
              Loading dashboard data from Supabase...
            </Text>
          </View>
        ) : (
          <>
            {/* Top Stats Grid (4 Columns) */}
            <View className="flex-row gap-6 mb-8">
              {/* Card 1: Overall */}
              <View className="flex-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <Text className="text-xs text-slate-400 font-bold tracking-wider uppercase">
                  OVERALL ATTENDANCE
                </Text>
                <Text className="text-4xl font-serif text-slate-800 mt-2 mb-1">
                  {overallPercentage}%
                </Text>
                <Text className="text-xs text-slate-400 font-medium">
                  {presentClassesCount} of {totalClassesCount} classes
                </Text>
              </View>

              {/* Card 2: Present */}
              <View className="flex-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <Text className="text-xs text-slate-400 font-bold tracking-wider uppercase">
                  CLASSES PRESENT
                </Text>
                <Text className="text-4xl font-serif text-[#10B981] mt-2 mb-1">
                  {presentClassesCount}
                </Text>
                <Text className="text-xs text-slate-400 font-medium">this semester</Text>
              </View>

              {/* Card 3: Absent */}
              <View className="flex-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <Text className="text-xs text-slate-400 font-bold tracking-wider uppercase">
                  CLASSES ABSENT
                </Text>
                <Text className="text-4xl font-serif text-[#EF4444] mt-2 mb-1">
                  {absentClassesCount + bunkedClassesCount}
                </Text>
                <Text className="text-xs text-slate-400 font-medium">this semester</Text>
              </View>

              {/* Card 4: At Risk */}
              <View className="flex-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <Text className="text-xs text-slate-400 font-bold tracking-wider uppercase">
                  AT RISK SUBJECTS
                </Text>
                <Text className="text-4xl font-serif text-[#F59E0B] mt-2 mb-1">
                  {atRiskCount}
                </Text>
                <Text className="text-xs text-slate-400 font-medium">below 75%</Text>
              </View>
            </View>

            {/* Main Content Grid (2 Columns) */}
            <View className="flex-row gap-6">
              {/* Left Column (Subject-wise Attendance - 60% width) */}
              <View className="flex-[3] bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <Text className="text-lg font-bold text-slate-800 mb-6">
                  Subject-wise Attendance
                </Text>

                {subjectStatsList.length === 0 ? (
                  <View className="py-12 items-center justify-center">
                    <Text className="text-2xl mb-2">📚</Text>
                    <Text className="text-slate-600 font-bold text-sm">
                      No attendance logs recorded yet
                    </Text>
                    <Text className="text-slate-400 text-xs mt-1 text-center">
                      Mark class attendance to see subject-wise progress breakdown.
                    </Text>
                  </View>
                ) : (
                  subjectStatsList.map((stat, idx) => {
                    const barColor = stat.isAtRisk
                      ? 'bg-red-500'
                      : stat.percentage >= 90
                      ? 'bg-[#10B981]'
                      : 'bg-indigo-500';
                    const textColor = stat.isAtRisk ? 'text-[#EF4444]' : 'text-[#10B981]';

                    return (
                      <View key={idx} className="mb-5">
                        <View className="flex-row justify-between items-center">
                          <Text className="text-slate-800 font-semibold text-sm">
                            {stat.name}
                          </Text>
                          <Text className={`${textColor} font-bold text-sm`}>
                            {stat.percentage}%
                          </Text>
                        </View>
                        <View className="h-2 w-full bg-slate-100 rounded-full mt-2 overflow-hidden">
                          <View
                            style={{ width: `${Math.min(100, Math.max(0, stat.percentage))}%` }}
                            className={`h-full ${barColor} rounded-full`}
                          />
                        </View>
                        <Text className="text-xs text-slate-400 mt-1.5 font-medium">
                          {stat.attended}/{stat.total} classes
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>

              {/* Right Column (Today's Schedule - 40% width) */}
              <View className="flex-[2] bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <Text className="text-lg font-bold text-slate-800 mb-6">
                  Today's Schedule
                </Text>

                {todayClasses.length === 0 ? (
                  <View className="py-12 items-center justify-center">
                    <Text className="text-2xl mb-2">🗓️</Text>
                    <Text className="text-slate-600 font-bold text-sm">
                      No classes scheduled for today
                    </Text>
                    <Text className="text-slate-400 text-xs mt-1 text-center">
                      Enjoy your day off or add classes in the Schedule tab!
                    </Text>
                  </View>
                ) : (
                  todayClasses.map((item, idx) => {
                    const matchedLog = attendanceLogs.find(
                      (l) => l.date === todayStr && l.subject === item.subject
                    );

                    let statusText = 'Upcoming';
                    let badgeBg = 'bg-blue-100';
                    let badgeColor = 'text-blue-500';

                    if (matchedLog) {
                      if (matchedLog.status === 'present' || matchedLog.status === 'late') {
                        statusText = 'Attended';
                        badgeBg = 'bg-green-100';
                        badgeColor = 'text-green-600';
                      } else if (matchedLog.status === 'absent') {
                        statusText = 'Absent';
                        badgeBg = 'bg-red-100';
                        badgeColor = 'text-red-600';
                      } else if (matchedLog.status === 'bunk') {
                        statusText = 'Bunked';
                        badgeBg = 'bg-amber-100';
                        badgeColor = 'text-amber-600';
                      } else if (matchedLog.status === 'teacher_off') {
                        statusText = 'Teacher Off';
                        badgeBg = 'bg-purple-100';
                        badgeColor = 'text-purple-600';
                      }
                    }

                    const timeStr = item.start_time && item.end_time
                      ? `${item.start_time} - ${item.end_time}`
                      : 'Scheduled';

                    const borderColors = [
                      'border-indigo-500',
                      'border-cyan-400',
                      'border-amber-400',
                      'border-emerald-400',
                      'border-pink-400',
                    ];
                    const borderColor = borderColors[idx % borderColors.length];

                    return (
                      <View
                        key={item.id || idx}
                        className={`flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-xl border-l-4 ${borderColor}`}
                      >
                        <View className="flex-1 pr-2">
                          <Text className="text-slate-800 font-bold text-sm">
                            {item.subject}
                          </Text>
                          <Text className="text-slate-500 text-xs mt-0.5">
                            {timeStr} {item.room ? `• ${item.room}` : ''}
                          </Text>
                        </View>
                        <View className={`${badgeBg} px-3 py-1 rounded-full`}>
                          <Text className={`${badgeColor} text-xs font-bold`}>
                            {statusText}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    );
  }

  // Mobile UI: Dynamic Data from Supabase
  return (
    <ScrollView className="flex-1 bg-[#0A101D] px-5 pt-12 pb-24" showsVerticalScrollIndicator={false}>
      {/* Header Section */}
      <View className="flex-row justify-between items-center mb-2">
        <View>
          <Text className="text-[#38BDF8] text-[10px] font-bold tracking-widest uppercase mb-1">
            {todayFormattedStr}
          </Text>
          <Text className="text-white text-3xl font-serif tracking-tight">
            {greeting},{"\n"}{formatName(userName)} 👋
          </Text>
        </View>

        {/* Right Avatar Circle */}
        <View className="w-12 h-12 rounded-full bg-blue-500 items-center justify-center shadow-md">
          <Text className="text-white font-bold text-base">
            {formatName(userName).substring(0, 2).toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Stats Row */}
      <View className="flex-row justify-between gap-3 mt-6">
        <View className="flex-1 bg-[#151F32] rounded-2xl p-4 items-center">
          <Text className="text-[#4ADE80] text-2xl font-bold mb-1">
            {presentClassesCount}
          </Text>
          <Text className="text-slate-400 text-xs">Present</Text>
        </View>

        <View className="flex-1 bg-[#151F32] rounded-2xl p-4 items-center">
          <Text className="text-[#F87171] text-2xl font-bold mb-1">
            {absentClassesCount + bunkedClassesCount}
          </Text>
          <Text className="text-slate-400 text-xs">Absent</Text>
        </View>

        <View className="flex-1 bg-[#151F32] rounded-2xl p-4 items-center">
          <Text className="text-[#FBBF24] text-2xl font-bold mb-1">
            {lateClassesCount}
          </Text>
          <Text className="text-slate-400 text-xs">Late</Text>
        </View>
      </View>

      {/* Overall Progress Card */}
      <View className="bg-[#151F32] rounded-2xl p-5 mt-4">
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-white font-bold text-base">Overall Attendance</Text>
          <Text className="text-[#4ADE80] text-xl font-bold">{overallPercentage}%</Text>
        </View>

        <View className="h-2.5 bg-[#0A101D] rounded-full mt-4 mb-3 overflow-hidden">
          <View
            style={{ width: `${Math.min(100, Math.max(0, overallPercentage))}%` }}
            className="h-full bg-[#4ADE80] rounded-full"
          />
        </View>

        <View className="flex-row justify-between items-center">
          <Text className="text-slate-400 text-xs">{presentClassesCount} attended</Text>
          <Text className="text-slate-400 text-xs">{totalClassesCount} total</Text>
        </View>
      </View>

      {/* Today's Classes List Section */}
      <Text className="text-white text-2xl font-serif mt-8 mb-4">Today's Classes</Text>
      {todayClasses.length === 0 ? (
        <View className="bg-[#151F32] rounded-2xl p-8 items-center justify-center">
          <Text className="text-3xl mb-2">🗓️</Text>
          <Text className="text-white font-bold text-base text-center">
            No classes scheduled for today
          </Text>
          <Text className="text-slate-400 text-xs text-center mt-1">
            Enjoy your free day or add new classes in the Schedule tab!
          </Text>
        </View>
      ) : (
        todayClasses.map((item, idx) => {
          const matchedLog = attendanceLogs.find(
            (l) => l.date === todayStr && l.subject === item.subject
          );

          let statusText = 'Upcoming';
          let badgeBorderColor = 'border-[#38BDF8]';
          let badgeBgColor = 'bg-[#38BDF8]/10';
          let badgeTextColor = 'text-[#38BDF8]';

          if (matchedLog) {
            if (matchedLog.status === 'present' || matchedLog.status === 'late') {
              statusText = 'Attended';
              badgeBorderColor = 'border-[#4ADE80]';
              badgeBgColor = 'bg-[#4ADE80]/10';
              badgeTextColor = 'text-[#4ADE80]';
            } else if (matchedLog.status === 'absent') {
              statusText = 'Absent';
              badgeBorderColor = 'border-[#F87171]';
              badgeBgColor = 'bg-[#F87171]/10';
              badgeTextColor = 'text-[#F87171]';
            } else if (matchedLog.status === 'bunk') {
              statusText = 'Bunked';
              badgeBorderColor = 'border-[#FBBF24]';
              badgeBgColor = 'bg-[#FBBF24]/10';
              badgeTextColor = 'text-[#FBBF24]';
            } else if (matchedLog.status === 'teacher_off') {
              statusText = 'Teacher Off';
              badgeBorderColor = 'border-[#818CF8]';
              badgeBgColor = 'bg-[#818CF8]/10';
              badgeTextColor = 'text-[#818CF8]';
            }
          }

          const timeLoc = `${item.start_time || ''} - ${item.end_time || ''}\n${item.room || 'Classroom'}`;

          const borderColors = [
            'border-indigo-500',
            'border-cyan-400',
            'border-amber-400',
            'border-emerald-400',
            'border-pink-400',
          ];
          const borderColor = borderColors[idx % borderColors.length];

          return (
            <TouchableOpacity
              key={item.id || idx}
              onPress={() => {
                setMobileActiveSubject({
                  name: item.subject,
                  time: timeLoc,
                  borderColor,
                });
                setMobileMarkStatus(null);
                setMobileNotesInput('');
                setMobileReasonInput('');
                setMobileApplyAll(false);
              }}
              activeOpacity={0.85}
              className="bg-[#151F32] rounded-2xl p-4 mb-3 flex-row justify-between items-center shadow-xs"
            >
              {/* Left Content */}
              <View className={`border-l-4 pl-3 flex-1 mr-2 ${borderColor}`}>
                <Text className="text-white font-bold text-base">{item.subject}</Text>
                <Text className="text-slate-400 text-xs mt-1 leading-normal">
                  {timeLoc}
                </Text>
              </View>

              {/* Right Badge */}
              <View className={`border px-3 py-1 rounded-full ${badgeBorderColor} ${badgeBgColor}`}>
                <Text className={`text-xs font-bold ${badgeTextColor}`}>
                  {statusText}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      {/* Interactive Bottom Modal (Mobile Only) */}
      <Modal
        visible={!!mobileActiveSubject}
        animationType="slide"
        transparent={true}
        onRequestClose={closeMobileModal}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={closeMobileModal}
          className="flex-1 justify-end bg-black/80"
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            className="bg-[#151F32] rounded-t-[32px] p-6 pt-3"
          >
            {/* Drag Handle */}
            <View className="w-12 h-1 bg-slate-600 rounded-full self-center mb-6" />

            {/* Subject Info */}
            <View
              className={`border-l-4 ${
                mobileActiveSubject?.borderColor || 'border-indigo-500'
              } pl-3 mb-6`}
            >
              <Text className="text-white font-serif text-xl font-bold">
                {mobileActiveSubject?.name}
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5">
                {mobileActiveSubject?.time}
              </Text>
            </View>

            {!mobileIsSaved ? (
              <>
                {/* Section Title */}
                <Text className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-3">
                  Mark Status
                </Text>

                {/* 2x2 Status Grid */}
                <View className="flex-row flex-wrap justify-between gap-y-3 mb-6">
                  {/* Present */}
                  <TouchableOpacity
                    onPress={() => setMobileMarkStatus('present')}
                    activeOpacity={0.8}
                    className={`w-[48%] rounded-2xl p-4 items-center border ${
                      mobileMarkStatus === 'present'
                        ? 'bg-[#4ADE80]/10 border-[#4ADE80]'
                        : 'bg-[#1E293B] border-transparent'
                    }`}
                  >
                    <Text
                      className={`text-2xl font-bold mb-1 ${
                        mobileMarkStatus === 'present' ? 'text-[#4ADE80]' : 'text-slate-400'
                      }`}
                    >
                      ✓
                    </Text>
                    <Text
                      className={`text-xs font-bold ${
                        mobileMarkStatus === 'present' ? 'text-[#4ADE80]' : 'text-slate-300'
                      }`}
                    >
                      Present
                    </Text>
                  </TouchableOpacity>

                  {/* Absent */}
                  <TouchableOpacity
                    onPress={() => setMobileMarkStatus('absent')}
                    activeOpacity={0.8}
                    className={`w-[48%] rounded-2xl p-4 items-center border ${
                      mobileMarkStatus === 'absent'
                        ? 'bg-[#F87171]/10 border-[#F87171]'
                        : 'bg-[#1E293B] border-transparent'
                    }`}
                  >
                    <Text
                      className={`text-2xl font-bold mb-1 ${
                        mobileMarkStatus === 'absent' ? 'text-[#F87171]' : 'text-slate-400'
                      }`}
                    >
                      ✕
                    </Text>
                    <Text
                      className={`text-xs font-bold ${
                        mobileMarkStatus === 'absent' ? 'text-[#F87171]' : 'text-slate-300'
                      }`}
                    >
                      Absent
                    </Text>
                  </TouchableOpacity>

                  {/* Bunk */}
                  <TouchableOpacity
                    onPress={() => setMobileMarkStatus('bunk')}
                    activeOpacity={0.8}
                    className={`w-[48%] rounded-2xl p-4 items-center border ${
                      mobileMarkStatus === 'bunk'
                        ? 'bg-[#FBBF24]/10 border-[#FBBF24]'
                        : 'bg-[#1E293B] border-transparent'
                    }`}
                  >
                    <Text
                      className={`text-2xl font-bold mb-1 ${
                        mobileMarkStatus === 'bunk' ? 'text-[#FBBF24]' : 'text-slate-400'
                      }`}
                    >
                      ⬡
                    </Text>
                    <Text
                      className={`text-xs font-bold ${
                        mobileMarkStatus === 'bunk' ? 'text-[#FBBF24]' : 'text-slate-300'
                      }`}
                    >
                      Bunk
                    </Text>
                  </TouchableOpacity>

                  {/* Teacher Off */}
                  <TouchableOpacity
                    onPress={() => setMobileMarkStatus('teacher_off')}
                    activeOpacity={0.8}
                    className={`w-[48%] rounded-2xl p-4 items-center border ${
                      mobileMarkStatus === 'teacher_off'
                        ? 'bg-[#818CF8]/10 border-[#818CF8]'
                        : 'bg-[#1E293B] border-transparent'
                    }`}
                  >
                    <Text
                      className={`text-2xl font-bold mb-1 ${
                        mobileMarkStatus === 'teacher_off' ? 'text-[#818CF8]' : 'text-slate-400'
                      }`}
                    >
                      ⊘
                    </Text>
                    <Text
                      className={`text-xs font-bold ${
                        mobileMarkStatus === 'teacher_off' ? 'text-[#818CF8]' : 'text-slate-300'
                      }`}
                    >
                      Teacher Off
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Dynamic Form Fields */}
                {mobileMarkStatus === 'present' && (
                  <View className="mb-2">
                    <TextInput
                      placeholder="Class notes (optional)..."
                      placeholderTextColor="#64748B"
                      value={mobileNotesInput}
                      onChangeText={setMobileNotesInput}
                      className="bg-[#1E293B] text-white p-4 rounded-xl mb-3 h-20 text-sm"
                      multiline
                    />
                  </View>
                )}

                {(mobileMarkStatus === 'absent' || mobileMarkStatus === 'bunk') && (
                  <View className="mb-2">
                    <TextInput
                      placeholder={
                        mobileMarkStatus === 'absent'
                          ? 'Reason for absence...'
                          : 'Reason for bunking...'
                      }
                      placeholderTextColor="#64748B"
                      value={mobileReasonInput}
                      onChangeText={setMobileReasonInput}
                      className="bg-[#1E293B] text-white p-4 rounded-xl mb-3 text-sm"
                    />
                    <View className="bg-[#1E293B] p-4 rounded-xl flex-row justify-between items-center mb-4">
                      <Text className="text-white text-sm font-medium">
                        Apply to all remaining classes today
                      </Text>
                      <Switch
                        value={mobileApplyAll}
                        onValueChange={setMobileApplyAll}
                        trackColor={{ false: '#334155', true: '#818CF8' }}
                      />
                    </View>
                  </View>
                )}

                {/* Save Attendance Button */}
                <TouchableOpacity
                  onPress={handleMobileSaveAttendance}
                  activeOpacity={0.8}
                  className="bg-indigo-500 p-4 rounded-2xl items-center mb-4 shadow-sm"
                >
                  <Text className="text-white font-bold text-lg">Save Attendance</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* Success Confirmation State */
              <View className="items-center py-6">
                <Text className="text-6xl text-slate-800 font-light mb-6">✓</Text>
                <Text className="text-white text-2xl font-serif font-bold mb-2">
                  Attendance Saved
                </Text>
                <Text className="text-slate-400 mb-8 text-center text-sm">
                  {mobileActiveSubject?.name} marked as{' '}
                  <Text
                    className={`font-bold ${
                      mobileMarkStatus === 'present'
                        ? 'text-[#4ADE80]'
                        : mobileMarkStatus === 'absent'
                        ? 'text-[#F87171]'
                        : mobileMarkStatus === 'bunk'
                        ? 'text-[#FBBF24]'
                        : mobileMarkStatus === 'teacher_off'
                        ? 'text-slate-400'
                        : 'text-white'
                    }`}
                  >
                    {mobileMarkStatus === 'present'
                      ? 'Present'
                      : mobileMarkStatus === 'absent'
                      ? 'Absent'
                      : mobileMarkStatus === 'bunk'
                      ? 'Bunk'
                      : mobileMarkStatus === 'teacher_off'
                      ? 'Teacher Off'
                      : 'Saved'}
                  </Text>
                </Text>

                <TouchableOpacity
                  onPress={closeMobileModal}
                  activeOpacity={0.8}
                  className="bg-indigo-500 w-full p-4 rounded-2xl items-center shadow-sm"
                >
                  <Text className="text-white font-bold text-lg">Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}


