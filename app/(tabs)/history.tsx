import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../utils/supabase';

interface AttendanceLogRow {
  id: string;
  subject: string;
  status: string;
  statusType: 'present' | 'absent' | 'bunk' | 'late' | 'cancelled';
  notes?: string;
}

interface DayGroup {
  dateStr: string; // YYYY-MM-DD
  dayName: string; // e.g. Wednesday
  dateBadge: string; // e.g. Aug 6
  fullDateLabel: string; // e.g. Wednesday, Aug 6, 2026
  logs: AttendanceLogRow[];
}

const FILTER_OPTIONS = ['All', 'Present', 'Absent', 'Bunk', 'Late'] as const;
type FilterType = typeof FILTER_OPTIONS[number];

// Date formatter helper
const formatDateDetails = (dateStr: string) => {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);

      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      const dateBadge = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const fullDateLabel = d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      return { dayName, dateBadge, fullDateLabel };
    }
  } catch (e) {
    console.error('[DATE FORMAT ERROR]', e);
  }
  return { dayName: 'Log Date', dateBadge: dateStr, fullDateLabel: dateStr };
};

export default function HistoryScreen() {
  const router = useRouter();

  const [activeFilter, setActiveFilter] = useState<FilterType>('All');
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAttendanceHistory = useCallback(async () => {
    try {
      setError(null);
      console.log('[SUPABASE HISTORY FETCH] Fetching attendance logs...');
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        console.warn('[SUPABASE HISTORY AUTH WARNING]', authError?.message);
        setDayGroups([]);
        return;
      }

      const { data, error: sbError } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (sbError) {
        console.error('[SUPABASE HISTORY FETCH ERROR]', sbError.message);
        setError(sbError.message);
        setDayGroups([]);
      } else if (data) {
        console.log('[SUPABASE HISTORY FETCH SUCCESS] Total rows:', data.length);

        const groupedMap: Record<string, DayGroup> = {};

        data.forEach((row: any) => {
          const dateStr = row.date;
          if (!dateStr) return;

          if (!groupedMap[dateStr]) {
            const { dayName, dateBadge, fullDateLabel } = formatDateDetails(dateStr);
            groupedMap[dateStr] = {
              dateStr,
              dayName,
              dateBadge,
              fullDateLabel,
              logs: [],
            };
          }

          const rawStatus = (row.status || 'present').toLowerCase();
          let statusStr = 'Present';
          let statusType: AttendanceLogRow['statusType'] = 'present';

          if (rawStatus === 'absent') {
            statusStr = 'Absent';
            statusType = 'absent';
          } else if (rawStatus === 'bunk' || rawStatus === 'bunked') {
            statusStr = 'Bunk';
            statusType = 'bunk';
          } else if (rawStatus === 'late') {
            statusStr = 'Late';
            statusType = 'late';
          } else if (rawStatus === 'teacher_absent' || rawStatus === 'cancelled') {
            statusStr = 'Cancelled';
            statusType = 'cancelled';
          }

          groupedMap[dateStr].logs.push({
            id: row.id || Math.random().toString(),
            subject: row.subject || 'Subject',
            status: statusStr,
            statusType,
            notes: row.notes,
          });
        });

        // Convert grouped object to array sorted by date descending
        const sortedGroups = Object.values(groupedMap).sort((a, b) =>
          b.dateStr.localeCompare(a.dateStr)
        );

        setDayGroups(sortedGroups);
      }
    } catch (err: any) {
      console.error('[SUPABASE HISTORY EXCEPTION]', err);
      setError(err?.message || 'Could not load attendance history');
      setDayGroups([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendanceHistory();
  }, [fetchAttendanceHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAttendanceHistory();
  };

  // Helper for badge styling on Web
  const renderWebStatusBadge = (log: AttendanceLogRow) => {
    let badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
    if (log.statusType === 'absent') {
      badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200/80';
    } else if (log.statusType === 'bunk' || log.statusType === 'late') {
      badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200/80';
    } else if (log.statusType === 'cancelled') {
      badgeStyle = 'bg-slate-100 text-slate-600 border-slate-200';
    }

    return (
      <View className={`px-3.5 py-1.5 rounded-full border flex-row items-center space-x-1.5 gap-1.5 ${badgeStyle}`}>
        <Text className="text-xs font-bold">
          {log.subject} · {log.status}
        </Text>
      </View>
    );
  };

  // Helper for badge styling on Mobile (Dark Theme)
  const renderMobileStatusBadge = (log: AttendanceLogRow) => {
    let badgeStyle = 'bg-[#4ADE80]/15 text-[#4ADE80] border-[#4ADE80]/30';
    if (log.statusType === 'absent') {
      badgeStyle = 'bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30';
    } else if (log.statusType === 'bunk' || log.statusType === 'late') {
      badgeStyle = 'bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30';
    } else if (log.statusType === 'cancelled') {
      badgeStyle = 'bg-slate-800 text-slate-400 border-slate-700';
    }

    return (
      <View className={`px-3 py-1.5 rounded-full border ${badgeStyle}`}>
        <Text className="text-xs font-bold">
          {log.subject} · {log.status}
        </Text>
      </View>
    );
  };

  // WEB VIEW RENDER
  if (Platform.OS === 'web') {
    return (
      <ScrollView className="flex-1 bg-[#F4F7FE] p-8 min-h-screen" showsVerticalScrollIndicator={true}>
        {/* Screen Header */}
        <View className="flex-row justify-between items-center mb-6">
          <View>
            <Text className="text-4xl font-serif font-bold text-slate-800 mb-1">
              Attendance History
            </Text>
            <Text className="text-slate-500 text-sm font-medium">
              Day-wise breakdown of logged lectures & attendance statuses
            </Text>
          </View>

          {/* Filter Pills Row */}
          <View className="flex-row bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm gap-1.5">
            {FILTER_OPTIONS.map((f) => {
              const isActive = activeFilter === f;
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => setActiveFilter(f)}
                  className={`px-4 py-2 rounded-xl cursor-pointer ${
                    isActive ? 'bg-indigo-600' : 'bg-transparent hover:bg-slate-50'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isActive ? 'text-white' : 'text-slate-600'
                    }`}
                  >
                    {f}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Loading Indicator */}
        {loading && (
          <View className="py-16 items-center justify-center">
            <ActivityIndicator size="large" color="#6366F1" />
            <Text className="text-xs text-slate-400 font-medium mt-3">
              Loading attendance logs from Supabase...
            </Text>
          </View>
        )}

        {/* Error Alert */}
        {!loading && error && (
          <View className="bg-rose-50 border border-rose-200 p-4 rounded-2xl mb-6 max-w-3xl">
            <Text className="text-xs font-bold text-rose-700">Failed to load history</Text>
            <Text className="text-xs text-rose-600 mt-1">{error}</Text>
          </View>
        )}

        {/* Empty State */}
        {!loading && !error && dayGroups.length === 0 && (
          <View className="bg-white p-12 rounded-3xl border border-slate-100 items-center justify-center max-w-3xl shadow-sm my-6">
            <View className="w-16 h-16 rounded-2xl bg-indigo-50 items-center justify-center mb-4">
              <Feather name="calendar" size={32} color="#6366F1" />
            </View>
            <Text className="text-lg font-bold text-slate-800 font-serif mb-1">
              No Attendance Records Found
            </Text>
            <Text className="text-xs text-slate-400 text-center max-w-md">
              Attendance records logged from your daily timetable schedule will automatically show up here grouped day by day.
            </Text>
          </View>
        )}

        {/* Day-wise Cards List */}
        {!loading &&
          !error &&
          dayGroups.map((group) => {
            const filteredLogs =
              activeFilter === 'All'
                ? group.logs
                : group.logs.filter((l) => l.status === activeFilter);

            if (filteredLogs.length === 0) return null;

            return (
              <View
                key={group.dateStr}
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm mb-5 max-w-4xl"
              >
                {/* Card Header: Day Name + Date Badge */}
                <View className="flex-row justify-between items-center pb-4 mb-4 border-b border-slate-100">
                  <View className="flex-row items-center space-x-2 gap-2">
                    <Text className="text-xl font-bold font-serif text-slate-800">
                      {group.dayName}
                    </Text>
                    <Text className="text-xs text-slate-400 font-medium">
                      ({filteredLogs.length} {filteredLogs.length === 1 ? 'class' : 'classes'})
                    </Text>
                  </View>

                  {/* Date Badge */}
                  <View className="bg-indigo-50 border border-indigo-100 px-3.5 py-1.5 rounded-full">
                    <Text className="text-xs font-bold text-indigo-600">
                      {group.dateBadge}
                    </Text>
                  </View>
                </View>

                {/* Subject Badges Row / Wrap */}
                <View className="flex-row flex-wrap gap-2.5">
                  {filteredLogs.map((log) => (
                    <View key={log.id}>
                      {renderWebStatusBadge(log)}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
      </ScrollView>
    );
  }

  // MOBILE VIEW RENDER (Dark Theme)
  return (
    <SafeAreaView className="flex-1 bg-[#0A101D]">
      <StatusBar barStyle="light-content" />

      {/* Screen Header */}
      <View className="px-5 pt-4 pb-3">
        <Text className="text-white text-3xl font-serif font-bold mb-1">Attendance History</Text>
        <Text className="text-slate-400 text-xs mb-4">Your day-wise lecture attendance log</Text>

        {/* Filter Scroll Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          {FILTER_OPTIONS.map((f) => {
            const isActive = activeFilter === f;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setActiveFilter(f)}
                className={`px-4 py-2 rounded-full mr-2.5 ${
                  isActive ? 'bg-[#818CF8]' : 'bg-[#151F32]'
                }`}
              >
                <Text
                  className={`font-bold text-xs ${
                    isActive ? 'text-white' : 'text-slate-400'
                  }`}
                >
                  {f}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content ScrollView */}
      <ScrollView
        className="flex-1 px-5 pt-2"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#818CF8" />
        }
      >
        {/* Loading Indicator */}
        {loading && (
          <View className="py-12 items-center justify-center">
            <ActivityIndicator size="large" color="#818CF8" />
            <Text className="text-xs text-slate-400 font-medium mt-3">
              Loading attendance history...
            </Text>
          </View>
        )}

        {/* Error State */}
        {!loading && error && (
          <View className="bg-rose-950/60 border border-rose-800 p-4 rounded-2xl my-4">
            <Text className="text-xs font-bold text-rose-300">Error loading logs</Text>
            <Text className="text-xs text-rose-400 mt-1">{error}</Text>
          </View>
        )}

        {/* Empty State */}
        {!loading && !error && dayGroups.length === 0 && (
          <View className="bg-[#151F32] rounded-3xl p-8 items-center justify-center my-6 border border-[#1E293B]">
            <View className="w-14 h-14 rounded-2xl bg-[#818CF8]/20 items-center justify-center mb-3">
              <Feather name="calendar" size={26} color="#818CF8" />
            </View>
            <Text className="text-white font-bold text-base text-center">
              No Attendance Logs Found
            </Text>
            <Text className="text-slate-400 text-xs text-center mt-1">
              Mark attendance on your dashboard timeline to view records here.
            </Text>
          </View>
        )}

        {/* Day Cards */}
        {!loading &&
          !error &&
          dayGroups.map((group) => {
            const filteredLogs =
              activeFilter === 'All'
                ? group.logs
                : group.logs.filter((l) => l.status === activeFilter);

            if (filteredLogs.length === 0) return null;

            return (
              <View
                key={group.dateStr}
                className="bg-[#151F32] rounded-3xl p-5 mb-4 border border-[#1E293B]"
              >
                {/* Header Row: Day Name + Date Badge */}
                <View className="flex-row justify-between items-center border-b border-[#1E293B] pb-3 mb-3.5">
                  <Text className="text-white font-bold text-lg font-serif">
                    {group.dayName}
                  </Text>

                  {/* Date Badge */}
                  <View className="bg-[#818CF8]/20 px-3 py-1 rounded-full border border-[#818CF8]/30">
                    <Text className="text-[#818CF8] text-xs font-bold">
                      {group.dateBadge}
                    </Text>
                  </View>
                </View>

                {/* Pill-Shaped Status Badges */}
                <View className="flex-row flex-wrap gap-2">
                  {filteredLogs.map((log) => (
                    <View key={log.id}>
                      {renderMobileStatusBadge(log)}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}

        <View className="h-16" />
      </ScrollView>
    </SafeAreaView>
  );
}
