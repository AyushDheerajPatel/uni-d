import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../utils/supabase';

interface SubjectBadge {
  subject: string;
  status: 'Present' | 'Absent' | 'Bunk' | 'Late';
}

interface HistoryCardData {
  day: string;
  date: string;
  presentCountText: string;
  badges: SubjectBadge[];
}

export default function AttendanceHistoryScreen() {
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchHistoryLogs = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: false });
          if (data) setAttendanceLogs(data);
        }
      } catch (err) {
        console.error('[ATTENDANCE HISTORY FETCH ERROR]', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistoryLogs();
  }, []);

  // Dynamically compute history cards from Supabase attendance_logs
  const historyCards: HistoryCardData[] = (() => {
    if (attendanceLogs.length === 0) return [];

    const grouped: Record<string, { day: string; date: string; badges: SubjectBadge[]; presentCount: number; totalCount: number }> = {};

    attendanceLogs.forEach((log) => {
      const dateStr = log.date;
      if (!dateStr) return;

      if (!grouped[dateStr]) {
        const parts = dateStr.split('-');
        let dayName = 'Log Date';
        if (parts.length === 3) {
          const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        }

        grouped[dateStr] = {
          day: dayName,
          date: dateStr,
          badges: [],
          presentCount: 0,
          totalCount: 0,
        };
      }

      const statusFormatted: SubjectBadge['status'] =
        log.status === 'present'
          ? 'Present'
          : log.status === 'absent'
          ? 'Absent'
          : log.status === 'bunk'
          ? 'Bunk'
          : 'Late';

      grouped[dateStr].totalCount += 1;
      if (statusFormatted === 'Present' || statusFormatted === 'Late') {
        grouped[dateStr].presentCount += 1;
      }

      grouped[dateStr].badges.push({
        subject: log.subject,
        status: statusFormatted,
      });
    });

    return Object.values(grouped).map((g) => ({
      day: g.day,
      date: g.date,
      presentCountText: `${g.presentCount}/${g.totalCount} Present`,
      badges: g.badges,
    }));
  })();

  const getBadgeStyle = (status: SubjectBadge['status']) => {
    switch (status) {
      case 'Present':
        return {
          wrapper: 'border-emerald-300 bg-emerald-50',
          textSubject: 'text-emerald-600',
          textStatus: 'text-emerald-600 font-bold',
        };
      case 'Absent':
        return {
          wrapper: 'border-rose-300 bg-rose-50',
          textSubject: 'text-rose-500',
          textStatus: 'text-rose-500 font-bold',
        };
      case 'Bunk':
      case 'Late':
        return {
          wrapper: 'border-amber-300 bg-amber-50',
          textSubject: 'text-amber-500',
          textStatus: 'text-amber-500 font-bold',
        };
      default:
        return {
          wrapper: 'border-slate-300 bg-slate-50',
          textSubject: 'text-slate-600',
          textStatus: 'text-slate-600 font-bold',
        };
    }
  };

  return (
    <ScrollView className="flex-1 bg-[#F4F7FE] p-8" showsVerticalScrollIndicator={true}>
      {/* Page Header */}
      <Text className="text-4xl font-serif font-bold text-slate-800 mb-1">
        Attendance History
      </Text>
      <Text className="text-slate-500 text-sm font-medium mb-8">
        Full record of your attendance
      </Text>

      {/* History Cards List */}
      <View className="max-w-4xl">
        {loading ? (
          <View className="py-16 items-center justify-center bg-white rounded-2xl p-8 border border-slate-100 shadow-sm">
            <ActivityIndicator size="large" color="#6366F1" />
            <Text className="text-xs text-slate-500 font-semibold mt-3">
              Loading attendance history from Supabase...
            </Text>
          </View>
        ) : historyCards.length === 0 ? (
          <View className="bg-white rounded-2xl shadow-sm p-8 items-center justify-center border border-slate-100">
            <Text className="text-3xl mb-2">📅</Text>
            <Text className="text-slate-700 font-bold text-base">
              No attendance history logged yet
            </Text>
            <Text className="text-slate-400 text-xs mt-1 text-center">
              Your attendance records will appear here as you log classes.
            </Text>
          </View>
        ) : (
          historyCards.map((card, index) => (
            <View key={index} className="bg-white rounded-2xl shadow-sm mb-6">
              {/* Header Row */}
              <View className="flex-row justify-between items-center px-6 py-4 border-b border-slate-50">
                <Text>
                  <Text className="font-bold text-slate-800 text-lg">{card.day} </Text>
                  <Text className="text-slate-400">{card.date}</Text>
                </Text>
                <Text className="text-slate-500 text-sm font-medium">
                  {card.presentCountText}
                </Text>
              </View>

              {/* Badges Row */}
              <View className="flex-row flex-wrap gap-3 px-6 py-5">
                {card.badges.map((badge, bIdx) => {
                  const styles = getBadgeStyle(badge.status);

                  return (
                    <View
                      key={bIdx}
                      className={`border ${styles.wrapper} rounded-full px-4 py-2 flex-row gap-1 items-center`}
                    >
                      <Text className={styles.textSubject}>{badge.subject}</Text>
                      <Text className={styles.textStatus}>{badge.status}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
