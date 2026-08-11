import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../utils/supabase';

interface AttendanceLog {
  id?: string;
  user_id?: string;
  subject: string;
  status: string;
  date: string;
  notes?: string;
}

interface MonthlyData {
  month: string;
  value: number;
  heightClass: string;
  isCurrent?: boolean;
}

interface SubjectRisk {
  name: string;
  statusText: string;
  percentage: string;
  isAtRisk: boolean;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function AnalyticsScreen() {
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchAnalyticsData = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('user_id', user.id);
          if (data) setAttendanceLogs(data);
        }
      } catch (err) {
        console.error('[ANALYTICS FETCH ERROR]', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalyticsData();
  }, []);

  // Compute monthly trend data dynamically from attendance_logs
  const monthlyTrendData: MonthlyData[] = (() => {
    const now = new Date();
    const currentMonthIdx = now.getMonth();

    const monthsList: { name: string; year: number; monthIdx: number }[] = [];
    for (let i = 8; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthsList.push({
        name: MONTH_NAMES[d.getMonth()],
        year: d.getFullYear(),
        monthIdx: d.getMonth(),
      });
    }

    return monthsList.map((m) => {
      const logsForMonth = attendanceLogs.filter((log) => {
        if (!log.date) return false;
        const logDate = new Date(log.date);
        return logDate.getFullYear() === m.year && logDate.getMonth() === m.monthIdx;
      });

      let percentage = 0;
      if (logsForMonth.length > 0) {
        const attended = logsForMonth.filter((l) => {
          const s = String(l.status || '').toLowerCase();
          return s === 'present' || s === 'late';
        }).length;
        percentage = Math.round((attended / logsForMonth.length) * 100);
      }

      const barHeightPx = Math.max(16, Math.round((percentage / 100) * 135));
      const isCurrentMonth = m.monthIdx === currentMonthIdx;

      return {
        month: m.name,
        value: percentage,
        heightClass: `h-[${barHeightPx}px]`,
        isCurrent: isCurrentMonth,
      };
    });
  })();

  // Compute subject risk analysis dynamically from attendance_logs
  const subjectRiskData: SubjectRisk[] = (() => {
    if (attendanceLogs.length === 0) return [];

    const subjectMap: Record<string, { total: number; attended: number }> = {};

    attendanceLogs.forEach((log) => {
      const subj = log.subject || 'General';
      if (!subjectMap[subj]) {
        subjectMap[subj] = { total: 0, attended: 0 };
      }
      subjectMap[subj].total += 1;
      const s = String(log.status || '').toLowerCase();
      if (s === 'present' || s === 'late') {
        subjectMap[subj].attended += 1;
      }
    });

    return Object.keys(subjectMap).map((subjectName) => {
      const { total, attended } = subjectMap[subjectName];
      const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
      const isAtRisk = pct < 75;

      let statusText = 'On track ✓';
      if (isAtRisk) {
        const classesNeeded = Math.max(1, 3 * total - 4 * attended);
        statusText = `Attend ${classesNeeded} more to reach 75%`;
      }

      return {
        name: subjectName,
        statusText,
        percentage: `${pct}%`,
        isAtRisk,
      };
    });
  })();

  return (
    <ScrollView className="flex-1 bg-[#F4F7FE] p-8" showsVerticalScrollIndicator={true}>
      {/* Page Header */}
      <Text className="text-4xl font-serif font-bold text-slate-800 mb-1">Analytics</Text>
      <Text className="text-slate-500 text-sm font-medium mb-8">
        Attendance trends and insights
      </Text>

      {loading ? (
        <View className="py-20 items-center justify-center">
          <ActivityIndicator size="large" color="#6366F1" />
          <Text className="text-slate-500 text-xs font-semibold mt-3">
            Loading analytics from Supabase...
          </Text>
        </View>
      ) : (
        /* Main Layout Grid */
        <View className="flex-col lg:flex-row gap-6">
          {/* Left Card: Monthly Attendance Trend */}
          <View className="flex-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6 lg:mb-0">
            <Text className="text-lg font-bold text-slate-800 mb-10">
              Monthly Attendance Trend
            </Text>

            {/* Bar Chart Container */}
            <View className="flex-row items-end justify-between px-2 h-48">
              {monthlyTrendData.map((item, idx) => (
                <View key={idx} className="items-center">
                  <Text className="text-xs text-slate-400 mb-2">{item.value}%</Text>
                  <View
                    style={{ height: Math.max(12, Math.round((item.value / 100) * 135)) }}
                    className={`w-8 md:w-10 rounded-t-md ${
                      item.isCurrent ? 'bg-[#6366F1]' : 'bg-[#E0E7FF]'
                    }`}
                  />
                  <Text className="text-xs text-slate-400 mt-3">{item.month}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Right Card: Subject Risk Analysis */}
          <View className="flex-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <Text className="text-lg font-bold text-slate-800 mb-6">
              Subject Risk Analysis
            </Text>

            {subjectRiskData.length === 0 ? (
              <View className="py-12 items-center justify-center">
                <Text className="text-2xl mb-2">📊</Text>
                <Text className="text-slate-600 font-bold text-sm">
                  No attendance records logged yet
                </Text>
                <Text className="text-slate-400 text-xs mt-1 text-center">
                  Mark your attendance on classes to calculate subject risk analysis.
                </Text>
              </View>
            ) : (
              /* Subject Risk List */
              subjectRiskData.map((subject, index) => (
                <View
                  key={index}
                  className="flex-row justify-between items-center bg-slate-50 p-4 rounded-xl mb-3 border border-slate-100"
                >
                  <View className="flex-1 pr-2">
                    <Text className="font-bold text-slate-800">{subject.name}</Text>
                    <Text
                      className={`text-xs mt-1 ${
                        subject.isAtRisk ? 'text-red-500 font-medium' : 'text-emerald-500 font-medium'
                      }`}
                    >
                      {subject.statusText}
                    </Text>
                  </View>

                  <Text
                    className={`text-2xl font-bold ${
                      subject.isAtRisk ? 'text-red-500' : 'text-emerald-600'
                    }`}
                  >
                    {subject.percentage}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
