import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  Platform,
  TextInput,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../utils/supabase';

const DAY_CODES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const DAY_NAMES: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

// Helper: Parse time string into total minutes from midnight
const parseTimeToMinutes = (timeStr?: string): number => {
  if (!timeStr || typeof timeStr !== 'string') return 540; // Default 9:00 AM (540 mins)
  const str = timeStr.trim().toUpperCase();

  const isPM = str.includes('PM');
  const isAM = str.includes('AM');
  const cleaned = str.replace(/(AM|PM|\s)/g, '');
  const parts = cleaned.split(':');

  let hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
};

// Helper: Calculate class duration in hours
const calculateClassDuration = (startTime?: string, endTime?: string): number => {
  const startMins = parseTimeToMinutes(startTime || '9:00 AM');
  const endMins = parseTimeToMinutes(endTime || '10:00 AM');
  const diff = endMins - startMins;
  return diff > 0 ? diff / 60 : 1; // Default 1 hour if end time missing/invalid
};

// Helper: Format Date Range string for Week View
const formatWeekRange = (date: Date): string => {
  const curr = new Date(date);
  const day = curr.getDay(); // 0 is Sunday
  const diffToMon = curr.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(curr.setDate(diffToMon));
  const sat = new Date(mon);
  sat.setDate(mon.getDate() + 5);

  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${mon.toLocaleDateString('en-US', options)} – ${sat.toLocaleDateString('en-US', options)}, ${sat.getFullYear()}`;
};

// Helper: Format Date string for Day View
const formatSingleDate = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
  return date.toLocaleDateString('en-US', options);
};

// Helper: Get today's 3-letter code
const getTodayDayCode = (): string => {
  const dayIdx = new Date().getDay();
  const map = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return map[dayIdx] || 'FRI';
};

export default function ScheduleScreen() {
  const router = useRouter();

  // State Management
  const [activeDay, setActiveDay] = useState<string>(getTodayDayCode() === 'SUN' ? 'MON' : getTodayDayCode());
  const [viewMode, setViewMode] = useState<'Week' | 'Day'>('Week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [timetableData, setTimetableData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Form Fields for Add Class Modal
  const [selectedSubject, setSelectedSubject] = useState<string>('Physics');
  const [selectedClassType, setSelectedClassType] = useState<'Lecture' | 'Lab' | 'Tutorial' | 'Seminar'>('Lecture');
  const [roomInput, setRoomInput] = useState<string>('Hall A-101');
  const [startTimeInput, setStartTimeInput] = useState<string>('9:00 AM');
  const [endTimeInput, setEndTimeInput] = useState<string>('10:00 AM');

  const [modalError, setModalError] = useState<string | null>(null);

  const openAddClassModal = () => {
    setSelectedSubject('');
    setSelectedClassType('Lecture');
    setRoomInput('');
    setStartTimeInput('9:00 AM');
    setEndTimeInput('10:00 AM');
    setModalError(null);
    setModalVisible(true);
  };

  useEffect(() => {
    fetchTimetable();
  }, []);

  const fetchTimetable = async () => {
    try {
      setLoading(true);
      console.log('[SUPABASE SCHEDULE FETCH] Loading timetable from Supabase...');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.warn('[SUPABASE SCHEDULE FETCH WARNING] No authenticated user:', authError?.message);
        setTimetableData([]);
        return;
      }

      const { data, error } = await supabase
        .from('timetable')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('[SUPABASE SCHEDULE FETCH ERROR]', error.message);
      } else if (data) {
        console.log('[SUPABASE SCHEDULE FETCH SUCCESS] Loaded rows:', data.length);
        setTimetableData(data);
      }
    } catch (err) {
      console.error('[SUPABASE SCHEDULE FETCH EXCEPTION]', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClass = async () => {
    setModalError(null);
    if (!selectedSubject.trim()) {
      setModalError('Subject Name is required.');
      return;
    }
    if (!startTimeInput.trim()) {
      setModalError('Start Time is required.');
      return;
    }
    if (!endTimeInput.trim()) {
      setModalError('End Time is required.');
      return;
    }
    if (!roomInput.trim()) {
      setModalError('Room / Location is required.');
      return;
    }

    if (isSaving) return;
    setIsSaving(true);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setModalError('User not authenticated in Supabase!');
        return;
      }

      const payload = {
        user_id: user.id,
        subject: selectedSubject.trim(),
        day: activeDay,
        start_time: startTimeInput.trim(),
        end_time: endTimeInput.trim(),
        room: roomInput.trim(),
        class_type: selectedClassType,
      };

      console.log('[SUPABASE SCHEDULE INSERT PAYLOAD]', payload);

      const { data, error } = await supabase
        .from('timetable')
        .insert([payload])
        .select();

      if (error) {
        console.error('[SUPABASE SCHEDULE INSERT ERROR]', error.message);
        setModalError(`Error saving class: ${error.message}`);
      } else if (data && data.length > 0) {
        setTimetableData((prev) => [...prev, data[0]]);
        setModalError(null);
        setModalVisible(false);
      }
    } catch (e: any) {
      console.error('[SUPABASE SCHEDULE INSERT EXCEPTION]', e);
      setModalError(e?.message || 'Failed to save class.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- DYNAMIC METRICS COMPUTATION ---
  const totalClassesWeek = timetableData.length;

  const totalHoursWeek = timetableData.reduce((sum, item) => {
    return sum + calculateClassDuration(item.start_time, item.end_time);
  }, 0);

  const calculateBusiestDay = (): string => {
    if (timetableData.length === 0) return 'None';
    const dayCounts: Record<string, number> = {};

    timetableData.forEach((item) => {
      const code = String(item.day || 'MON').toUpperCase();
      dayCounts[code] = (dayCounts[code] || 0) + 1;
    });

    let maxDay = 'MON';
    let maxCount = 0;
    Object.entries(dayCounts).forEach(([code, count]) => {
      if (count > maxCount) {
        maxCount = count;
        maxDay = code;
      }
    });

    const dayName = DAY_NAMES[maxDay] || maxDay;
    return maxCount > 0 ? `${dayName} (${maxCount} classes)` : 'None';
  };

  // --- DATE NAVIGATION HANDLERS ---
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === 'Week') {
      next.setDate(next.getDate() - 7);
    } else {
      next.setDate(next.getDate() - 1);
      const code = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][next.getDay()];
      if (code && code !== 'SUN') setActiveDay(code);
    }
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === 'Week') {
      next.setDate(next.getDate() + 7);
    } else {
      next.setDate(next.getDate() + 1);
      const code = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][next.getDay()];
      if (code && code !== 'SUN') setActiveDay(code);
    }
    setCurrentDate(next);
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    const code = getTodayDayCode();
    setActiveDay(code === 'SUN' ? 'MON' : code);
  };

  // --- DAYS LIST GENERATOR FOR SELECTOR ---
  const getDaysListForCurrentWeek = () => {
    const curr = new Date(currentDate);
    const day = curr.getDay();
    const diffToMon = curr.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(curr.setDate(diffToMon));
    const todayStr = new Date().toDateString();

    return DAY_CODES.map((code, idx) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + idx);
      const isToday = d.toDateString() === todayStr;
      return {
        code,
        date: String(d.getDate()),
        fullDate: d,
        label: isToday ? 'today' : '',
      };
    });
  };

  const daysList = getDaysListForCurrentWeek();

  // --- TODAY'S UPCOMING SCHEDULE ---
  const getUpcomingTodayClasses = () => {
    const todayCode = getTodayDayCode();
    const todayClasses = timetableData.filter((item) => String(item.day).toUpperCase() === todayCode);

    // Sort chronologically by start_time
    todayClasses.sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time));

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    return todayClasses.map((item) => {
      const startMins = parseTimeToMinutes(item.start_time);
      const endMins = parseTimeToMinutes(item.end_time);

      let status = 'Completed';
      let statusColor = 'text-slate-400 bg-slate-100 border-slate-200';

      if (currentMins >= startMins && currentMins <= endMins) {
        status = 'Ongoing';
        statusColor = 'text-emerald-700 bg-emerald-100 border-emerald-300';
      } else if (currentMins < startMins) {
        const diff = startMins - currentMins;
        const hrs = Math.floor(diff / 60);
        const mins = diff % 60;
        status = hrs > 0 ? `In ${hrs}h ${mins}m` : `In ${mins}m`;
        statusColor = 'text-indigo-700 bg-indigo-100 border-indigo-300';
      }

      return { ...item, status, statusColor };
    });
  };

  const upcomingTodayClasses = getUpcomingTodayClasses();

  const displayedClasses = timetableData.filter(
    (item: any) => String(item.day).toUpperCase() === activeDay
  );
  displayedClasses.sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time));

  const classTypes = ['Lecture', 'Lab', 'Tutorial', 'Seminar'];

  // --- WEB VIEW RENDER ---
  if (Platform.OS === 'web') {
    return (
      <ScrollView className="flex-1 bg-[#F4F7FE] p-8" showsVerticalScrollIndicator={true}>
        {/* Header Row */}
        <View className="flex-row justify-between items-center mb-6">
          <View>
            <Text className="text-4xl font-serif font-bold text-slate-800 mb-1">
              Schedule & Timetable
            </Text>
            <Text className="text-slate-500 text-sm font-medium">
              Semester 5 • B.Tech Computer Science
            </Text>
          </View>

          <View className="flex-row items-center space-x-3 gap-3">
            {/* View Switcher Pills */}
            <View className="flex-row bg-slate-200/70 p-1 rounded-xl">
              <TouchableOpacity
                onPress={() => setViewMode('Week')}
                className={`px-4 py-1.5 rounded-lg ${
                  viewMode === 'Week' ? 'bg-slate-800' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    viewMode === 'Week' ? 'text-white' : 'text-slate-600'
                  }`}
                >
                  Week
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setViewMode('Day')}
                className={`px-4 py-1.5 rounded-lg ${
                  viewMode === 'Day' ? 'bg-slate-800' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    viewMode === 'Day' ? 'text-white' : 'text-slate-600'
                  }`}
                >
                  Day
                </Text>
              </TouchableOpacity>
            </View>

            {/* Add Class Button */}
            <TouchableOpacity
              onPress={() => setModalVisible(true)}
              className="bg-indigo-600 px-5 py-2.5 rounded-xl flex-row items-center shadow-sm cursor-pointer"
            >
              <Feather name="plus" size={16} color="#ffffff" style={{ marginRight: 6 }} />
              <Text className="text-white font-bold text-sm">Add Class</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Date Navigation Bar */}
        <View className="flex-row justify-between items-center bg-white px-6 py-3.5 rounded-2xl border border-slate-100 shadow-sm mb-6">
          <View className="flex-row items-center space-x-3 gap-3">
            <TouchableOpacity
              onPress={handlePrev}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200"
            >
              <Feather name="chevron-left" size={18} color="#475569" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleToday}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200"
            >
              <Text className="text-xs font-bold text-indigo-600">Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleNext}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200"
            >
              <Feather name="chevron-right" size={18} color="#475569" />
            </TouchableOpacity>
          </View>

          <Text className="text-sm font-bold text-slate-700">
            {viewMode === 'Week' ? formatWeekRange(currentDate) : formatSingleDate(currentDate)}
          </Text>
        </View>

        {/* Top 3 Summary Cards */}
        <View className="flex-row gap-6 mb-8">
          {/* Card 1: Classes/week */}
          <View className="flex-1 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Classes / Week
              </Text>
              <View className="p-2 rounded-xl bg-indigo-50">
                <Feather name="book-open" size={18} color="#6366F1" />
              </View>
            </View>
            <Text className="text-3xl font-serif font-bold text-slate-800">
              {totalClassesWeek}
            </Text>
            <Text className="text-xs text-slate-400 font-medium mt-1">
              Active weekly lectures
            </Text>
          </View>

          {/* Card 2: Hours/week */}
          <View className="flex-1 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Hours / Week
              </Text>
              <View className="p-2 rounded-xl bg-cyan-50">
                <Feather name="clock" size={18} color="#06B6D4" />
              </View>
            </View>
            <Text className="text-3xl font-serif font-bold text-slate-800">
              {totalHoursWeek % 1 === 0 ? totalHoursWeek : totalHoursWeek.toFixed(1)} hrs
            </Text>
            <Text className="text-xs text-slate-400 font-medium mt-1">
              Total class time duration
            </Text>
          </View>

          {/* Card 3: Busiest day */}
          <View className="flex-1 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Busiest Day
              </Text>
              <View className="p-2 rounded-xl bg-amber-50">
                <Feather name="calendar" size={18} color="#F59E0B" />
              </View>
            </View>
            <Text className="text-xl font-serif font-bold text-slate-800 mt-1">
              {calculateBusiestDay()}
            </Text>
            <Text className="text-xs text-slate-400 font-medium mt-1">
              Highest lecture load
            </Text>
          </View>
        </View>

        {/* Days Filter Tabs */}
        <View className="flex-row gap-3 mb-6">
          {daysList.map((item) => (
            <TouchableOpacity
              key={item.code}
              onPress={() => setActiveDay(item.code)}
              className={`px-5 py-3 rounded-xl border cursor-pointer ${
                activeDay === item.code
                  ? 'bg-indigo-600 border-indigo-600'
                  : 'bg-white border-slate-200'
              }`}
            >
              <Text
                className={`font-bold text-sm ${
                  activeDay === item.code ? 'text-white' : 'text-slate-700'
                }`}
              >
                {item.code} ({item.date})
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Timetable Schedule Grid Container */}
        <View className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
          <Text className="text-slate-800 font-bold text-lg mb-4">
            {viewMode === 'Week' ? `Classes for ${DAY_NAMES[activeDay] || activeDay}` : `Detailed Timeline — ${DAY_NAMES[activeDay] || activeDay}`}
          </Text>

          {displayedClasses.length === 0 ? (
            <View className="py-8 items-center justify-center">
              <Text className="text-slate-400 text-sm">
                No classes scheduled for {DAY_NAMES[activeDay] || activeDay}. Click "+ Add Class" to add one.
              </Text>
            </View>
          ) : (
            displayedClasses.map((item, index) => (
              <View
                key={item.id || index}
                className="flex-row justify-between items-center p-4 bg-slate-50 rounded-xl mb-3 border-l-4 border-indigo-500"
              >
                <View>
                  <Text className="text-slate-800 font-bold text-base">{item.subject}</Text>
                  <Text className="text-slate-500 text-xs mt-0.5 font-medium">
                    📍 {item.room || 'Room TBD'} · ⏰ {item.start_time} - {item.end_time}
                  </Text>
                </View>
                <View className="bg-indigo-100 px-3 py-1 rounded-full">
                  <Text className="text-indigo-700 text-xs font-bold">{item.class_type || 'Lecture'}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Upcoming Today Section */}
        <View className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-10">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-slate-800 font-bold text-lg font-serif">
              Upcoming Today ({DAY_NAMES[getTodayDayCode()] || 'Today'})
            </Text>
            <View className="bg-indigo-50 px-3 py-1 rounded-full">
              <Text className="text-indigo-600 font-bold text-xs">
                {upcomingTodayClasses.length} Scheduled
              </Text>
            </View>
          </View>

          {upcomingTodayClasses.length === 0 ? (
            <Text className="text-slate-400 text-sm py-2">
              No classes scheduled for today.
            </Text>
          ) : (
            <View className="flex-row flex-wrap gap-4">
              {upcomingTodayClasses.map((item, idx) => (
                <View
                  key={item.id || idx}
                  className="flex-1 min-w-[280px] bg-slate-50 p-4 rounded-xl border border-slate-200/60 flex-row justify-between items-center"
                >
                  <View>
                    <Text className="font-bold text-slate-800 text-sm">{item.subject}</Text>
                    <Text className="text-xs text-slate-500 mt-1 font-medium">
                      📍 {item.room || 'TBD'} · ⏰ {item.start_time} - {item.end_time}
                    </Text>
                  </View>

                  <View className={`px-2.5 py-1 rounded-lg border ${item.statusColor}`}>
                    <Text className="text-[11px] font-bold">{item.status}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Add Class Modal Overlay */}
        {modalVisible && (
          <View className="absolute inset-0 bg-black/40 justify-center items-center z-50 p-4">
            <View className="bg-white p-6 rounded-2xl w-full max-w-[420px] shadow-2xl border border-slate-100">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-xl font-bold text-slate-800 font-serif">Add Class</Text>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
                >
                  <Feather name="x" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              {modalError && (
                <View className="bg-rose-50 border border-rose-200 p-3 rounded-xl mb-4 flex-row items-center space-x-2 gap-2">
                  <Text className="text-xs font-bold text-rose-600">⚠️ {modalError}</Text>
                </View>
              )}

              {/* Subject Input */}
              <View className="mb-4">
                <Text className="text-xs font-semibold text-slate-700 mb-1.5">Subject Name</Text>
                <TextInput
                  placeholder="e.g. Higher Mathematics"
                  value={selectedSubject}
                  onChangeText={setSelectedSubject}
                  className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-800 text-sm"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              {/* Day Selector */}
              <View className="mb-4">
                <Text className="text-xs font-semibold text-slate-700 mb-1.5">Day</Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {DAY_CODES.map((code) => (
                    <TouchableOpacity
                      key={code}
                      onPress={() => setActiveDay(code)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${
                        activeDay === code
                          ? 'bg-slate-800 border-slate-800 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${activeDay === code ? 'text-white' : 'text-slate-600'}`}>
                        {code}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Time Row */}
              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-slate-700 mb-1.5">Start Time</Text>
                  <TextInput
                    placeholder="9:00 AM"
                    value={startTimeInput}
                    onChangeText={setStartTimeInput}
                    className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-800 text-sm"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-slate-700 mb-1.5">End Time</Text>
                  <TextInput
                    placeholder="10:00 AM"
                    value={endTimeInput}
                    onChangeText={setEndTimeInput}
                    className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-800 text-sm"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              {/* Room Input */}
              <View className="mb-4">
                <Text className="text-xs font-semibold text-slate-700 mb-1.5">Room / Location</Text>
                <TextInput
                  placeholder="e.g. Hall A-101"
                  value={roomInput}
                  onChangeText={setRoomInput}
                  className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-800 text-sm"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              {/* Class Type */}
              <View className="mb-6">
                <Text className="text-xs font-semibold text-slate-700 mb-1.5">Class Type</Text>
                <View className="flex-row flex-wrap gap-2">
                  {classTypes.map((t) => {
                    const isSelected = selectedClassType === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setSelectedClassType(t as any)}
                        className={`px-3 py-2 rounded-xl border text-xs font-bold ${
                          isSelected
                            ? 'bg-slate-800 border-slate-800 text-white'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-600'}`}>
                          {t}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Action Buttons */}
              <View className="flex-row justify-end space-x-2 gap-2">
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  className="px-5 py-3 bg-slate-100 rounded-xl cursor-pointer"
                >
                  <Text className="text-slate-600 font-bold text-xs">Cancel</Text>
                </TouchableOpacity>

                <button
                  type="button"
                  onClick={handleSaveClass}
                  style={{
                    cursor: 'pointer',
                    backgroundColor: '#0F172A',
                    paddingLeft: '24px',
                    paddingRight: '24px',
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    borderRadius: '12px',
                    border: 'none',
                    color: '#FFFFFF',
                    fontWeight: 'bold',
                    fontSize: '12px',
                  }}
                >
                  {isSaving ? 'Saving...' : 'Save Class'}
                </button>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    );
  }

  // --- MOBILE VIEW RENDER (Dark Theme) ---
  return (
    <View className="flex-1 bg-[#0A101D] relative">
      {/* Header Section */}
      <View className="px-5 pt-12 pb-4">
        <View className="flex-row justify-between items-center">
          <Text className="text-white text-3xl font-serif font-bold">My Schedule</Text>

          {/* View Mode Toggle */}
          <View className="flex-row bg-[#151F32] p-1 rounded-xl border border-[#1E293B]">
            <TouchableOpacity
              onPress={() => setViewMode('Week')}
              className={`px-3 py-1 rounded-lg ${
                viewMode === 'Week' ? 'bg-[#818CF8]' : 'bg-transparent'
              }`}
            >
              <Text className={`text-xs font-bold ${viewMode === 'Week' ? 'text-white' : 'text-slate-400'}`}>
                Week
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode('Day')}
              className={`px-3 py-1 rounded-lg ${
                viewMode === 'Day' ? 'bg-[#818CF8]' : 'bg-transparent'
              }`}
            >
              <Text className={`text-xs font-bold ${viewMode === 'Day' ? 'text-white' : 'text-slate-400'}`}>
                Day
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Date Navigation Row */}
        <View className="flex-row justify-between items-center mt-4 bg-[#151F32] p-3 rounded-2xl border border-[#1E293B]">
          <View className="flex-row items-center space-x-2 gap-2">
            <TouchableOpacity onPress={handlePrev} className="p-1.5 rounded-lg bg-[#1E293B]">
              <Feather name="chevron-left" size={16} color="#94A3B8" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleToday} className="px-2.5 py-1 rounded-lg bg-[#818CF8]/20 border border-[#818CF8]/40">
              <Text className="text-xs font-bold text-[#818CF8]">Today</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleNext} className="p-1.5 rounded-lg bg-[#1E293B]">
              <Feather name="chevron-right" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <Text className="text-xs font-bold text-slate-300">
            {viewMode === 'Week' ? formatWeekRange(currentDate) : formatSingleDate(currentDate)}
          </Text>
        </View>
      </View>

      {/* Dynamic Summary Cards Row */}
      <View className="px-5 mb-4 flex-row gap-2">
        <View className="flex-1 bg-[#151F32] p-3 rounded-2xl border border-[#1E293B]">
          <Text className="text-[10px] font-bold text-slate-400 uppercase">Classes/Wk</Text>
          <Text className="text-xl font-serif font-bold text-white mt-0.5">{totalClassesWeek}</Text>
        </View>
        <View className="flex-1 bg-[#151F32] p-3 rounded-2xl border border-[#1E293B]">
          <Text className="text-[10px] font-bold text-slate-400 uppercase">Hours/Wk</Text>
          <Text className="text-xl font-serif font-bold text-white mt-0.5">
            {totalHoursWeek % 1 === 0 ? totalHoursWeek : totalHoursWeek.toFixed(1)}h
          </Text>
        </View>
        <View className="flex-1 bg-[#151F32] p-3 rounded-2xl border border-[#1E293B]">
          <Text className="text-[10px] font-bold text-slate-400 uppercase">Busiest</Text>
          <Text className="text-xs font-bold text-[#38BDF8] mt-1" numberOfLines={1}>
            {calculateBusiestDay()}
          </Text>
        </View>
      </View>

      {/* Days Selector */}
      <View className="mb-4">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-5 max-h-[90px]">
          {daysList.map((item) => {
            const isActive = activeDay === item.code;
            return (
              <TouchableOpacity
                key={item.code}
                onPress={() => setActiveDay(item.code)}
                activeOpacity={0.8}
                className={`rounded-2xl items-center justify-center py-3 mr-3 ${
                  isActive ? 'bg-[#818CF8] w-[72px]' : 'bg-[#151F32] w-16'
                }`}
              >
                <Text className={`font-bold text-xs mb-0.5 ${isActive ? 'text-white/80' : 'text-slate-500'}`}>
                  {item.code}
                </Text>
                <Text className={`font-bold ${isActive ? 'text-white text-2xl' : 'text-white text-xl'}`}>
                  {item.date}
                </Text>
                {item.label ? (
                  <Text className="text-white/80 text-[10px] font-medium mt-0.5">{item.label}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Timeline Grid */}
      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        {displayedClasses.length === 0 ? (
          <View className="py-10 items-center justify-center">
            <Text className="text-slate-400 text-sm font-medium">
              No classes scheduled for {DAY_NAMES[activeDay] || activeDay}.
            </Text>
            <Text className="text-slate-500 text-xs mt-1">Tap "+" to add a class.</Text>
          </View>
        ) : (
          displayedClasses.map((item, index) => (
            <View key={item.id || index} className="flex-row min-h-[110px] mb-2">
              {/* Left Time */}
              <View className="w-16 items-center pt-1">
                <Text className="text-slate-400 text-xs font-semibold">
                  {item.start_time || '9:00 AM'}
                </Text>
                <View className="w-[1px] bg-slate-800 flex-1 mt-2 mb-1" />
              </View>

              {/* Card */}
              <View className="flex-1 pl-3 pb-4">
                <View className="border border-[#818CF8]/30 bg-[#151F32] rounded-2xl p-4 shadow-xs">
                  <View className="flex-row justify-between items-center mb-2">
                    <View className="flex-row items-center">
                      <View className="w-2.5 h-2.5 rounded-full bg-[#818CF8] mr-2" />
                      <Text className="text-white font-bold text-base">{item.subject}</Text>
                    </View>
                    <View className="bg-[#818CF8]/20 px-3 py-1 rounded-full">
                      <Text className="text-[#818CF8] text-xs font-bold">
                        {item.class_type || 'Lecture'}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-slate-300 text-xs font-medium">
                    📍 Room: {item.room || 'TBD'} · ⏰ {item.start_time} - {item.end_time}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}

        {/* Upcoming Today Section (Mobile) */}
        <View className="mt-4 mb-20 bg-[#151F32] p-4 rounded-2xl border border-[#1E293B]">
          <Text className="text-white font-bold text-sm mb-3">
            Upcoming Today ({DAY_NAMES[getTodayDayCode()] || 'Today'})
          </Text>

          {upcomingTodayClasses.length === 0 ? (
            <Text className="text-slate-500 text-xs">No upcoming classes for today.</Text>
          ) : (
            upcomingTodayClasses.map((item, idx) => (
              <View key={item.id || idx} className="bg-[#1E293B] p-3 rounded-xl mb-2 flex-row justify-between items-center">
                <View>
                  <Text className="text-white font-bold text-xs">{item.subject}</Text>
                  <Text className="text-slate-400 text-[11px]">
                    📍 {item.room || 'TBD'} · {item.start_time}
                  </Text>
                </View>
                <View className={`px-2 py-0.5 rounded-md border ${item.statusColor}`}>
                  <Text className="text-[10px] font-bold">{item.status}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        className="absolute bottom-8 right-6 w-14 h-14 bg-[#818CF8] rounded-2xl items-center justify-center shadow-lg z-50"
      >
        <Text className="text-white text-3xl font-light">+</Text>
      </TouchableOpacity>

      {/* Add Class Modal (Mobile) */}
      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
        <View className="flex-1 justify-end bg-black/80 z-50">
          <View className="bg-[#151F32] rounded-t-[32px] p-6 pt-4 max-h-[90%] relative z-50">
            <View className="flex-row justify-between items-center mb-5">
              <Text className="font-serif text-2xl font-bold text-white">Add Class</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                className="w-8 h-8 rounded-full bg-[#1E293B] items-center justify-center"
              >
                <Text className="text-slate-400 font-bold text-sm">✕</Text>
              </TouchableOpacity>
            </View>

            {modalError && (
              <View className="bg-rose-950/60 border border-rose-800 p-3 rounded-xl mb-4 flex-row items-center space-x-2 gap-2">
                <Text className="text-xs font-bold text-rose-300">⚠️ {modalError}</Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="mb-4">
                <Text className="text-[#38BDF8] text-[10px] font-bold uppercase tracking-widest mb-2">SUBJECT</Text>
                <View className="bg-[#1E293B] p-4 rounded-xl">
                  <TextInput
                    value={selectedSubject}
                    onChangeText={setSelectedSubject}
                    className="text-white font-medium text-sm p-0"
                    placeholder="Enter subject name..."
                    placeholderTextColor="#64748B"
                  />
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-[#38BDF8] text-[10px] font-bold uppercase tracking-widest mb-2">DAY</Text>
                <View className="flex-row flex-wrap gap-2">
                  {DAY_CODES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setActiveDay(c)}
                      className={`px-3 py-2 rounded-xl border ${
                        activeDay === c ? 'bg-[#818CF8] border-[#818CF8]' : 'bg-[#1E293B] border-transparent'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${activeDay === c ? 'text-white' : 'text-slate-400'}`}>
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
                  <Text className="text-[#38BDF8] text-[10px] font-bold uppercase tracking-widest mb-2">START TIME</Text>
                  <View className="bg-[#1E293B] p-4 rounded-xl">
                    <TextInput
                      value={startTimeInput}
                      onChangeText={setStartTimeInput}
                      className="text-white font-medium text-sm p-0"
                      placeholder="9:00 AM"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                </View>
                <View className="flex-1">
                  <Text className="text-[#38BDF8] text-[10px] font-bold uppercase tracking-widest mb-2">END TIME</Text>
                  <View className="bg-[#1E293B] p-4 rounded-xl">
                    <TextInput
                      value={endTimeInput}
                      onChangeText={setEndTimeInput}
                      className="text-white font-medium text-sm p-0"
                      placeholder="10:00 AM"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-[#38BDF8] text-[10px] font-bold uppercase tracking-widest mb-2">ROOM</Text>
                <View className="bg-[#1E293B] p-4 rounded-xl">
                  <TextInput
                    value={roomInput}
                    onChangeText={setRoomInput}
                    className="text-white font-medium text-sm p-0"
                    placeholder="Hall A-101"
                    placeholderTextColor="#64748B"
                  />
                </View>
              </View>

              <View className="mb-5">
                <Text className="text-[#38BDF8] text-[10px] font-bold uppercase tracking-widest mb-2">CLASS TYPE</Text>
                <View className="flex-row flex-wrap gap-2">
                  {classTypes.map((type) => {
                    const isSelected = selectedClassType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        onPress={() => setSelectedClassType(type as any)}
                        className={`px-4 py-2.5 rounded-xl border ${
                          isSelected ? 'border-[#818CF8] bg-[#818CF8]/10' : 'border-transparent bg-[#1E293B]'
                        }`}
                      >
                        <Text className={`font-bold text-xs ${isSelected ? 'text-[#818CF8]' : 'text-slate-400'}`}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <TouchableOpacity
                onPress={handleSaveClass}
                className="bg-[#818CF8] p-4 rounded-2xl items-center mb-4 shadow-sm"
              >
                <Text className="text-white font-bold text-lg">
                  {isSaving ? 'Saving...' : 'Save Class'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
