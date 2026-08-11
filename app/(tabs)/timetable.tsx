import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../utils/supabase';

interface ClassItem {
  id: string;
  user_id?: string;
  day: string; // 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT'
  time: string;
  start_time?: string;
  end_time?: string;
  subject: string;
  type: 'Lecture' | 'Lab' | 'Tutorial' | 'Seminar';
  class_type?: string;
  room: string;
}

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const getTodayDayCode = (): string => {
  const dayIdx = new Date().getDay();
  const map = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return map[dayIdx] || 'MON';
};

const getTodayFullName = (): string => {
  const mapFull: Record<string, string> = {
    MON: 'Monday',
    TUE: 'Tuesday',
    WED: 'Wednesday',
    THU: 'Thursday',
    FRI: 'Friday',
    SAT: 'Saturday',
    SUN: 'Sunday',
  };
  return mapFull[getTodayDayCode()] || 'Monday';
};

const DEFAULT_TIME_SLOTS = [
  '8:00 AM',
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM', // Lunch slot
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
];
const TIME_SLOTS_STORAGE_KEY = '@custom_time_slots';

export default function TimetableScreen() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [activeDayFilter, setActiveDayFilter] = useState<string>('All');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [timeSlots, setTimeSlots] = useState<string[]>(DEFAULT_TIME_SLOTS);

  // Class Modal State
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<{
    day: string;
    time: string;
    existingClass?: ClassItem;
  } | null>(null);

  // Form Fields for Class
  const [subjectInput, setSubjectInput] = useState<string>('');
  const [typeInput, setTypeInput] = useState<'Lecture' | 'Lab' | 'Tutorial' | 'Seminar'>('Lecture');
  const [roomInput, setRoomInput] = useState<string>('');

  // Time Slot Editing Modal State
  const [slotModalVisible, setSlotModalVisible] = useState<boolean>(false);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const [slotInputValue, setSlotInputValue] = useState<string>('');
  const [isNewSlotMode, setIsNewSlotMode] = useState<boolean>(false);
  const [isSavingSlot, setIsSavingSlot] = useState<boolean>(false);

  useEffect(() => {
    loadTimeSlots();
    fetchTimetableData();
  }, []);

  const loadTimeSlots = async () => {
    try {
      // 1. Check local storage first
      const cachedStr = await AsyncStorage.getItem(TIME_SLOTS_STORAGE_KEY);
      if (cachedStr) {
        const parsed = JSON.parse(cachedStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTimeSlots(parsed);
        }
      }

      // 2. Sync with Supabase user metadata
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.custom_time_slots) {
        const sbSlots = user.user_metadata.custom_time_slots;
        if (Array.isArray(sbSlots) && sbSlots.length > 0) {
          setTimeSlots(sbSlots);
          await AsyncStorage.setItem(TIME_SLOTS_STORAGE_KEY, JSON.stringify(sbSlots));
        }
      }
    } catch (err) {
      console.error('[LOAD TIME SLOTS EXCEPTION]', err);
    }
  };

  const persistTimeSlots = async (newSlots: string[]) => {
    try {
      setTimeSlots(newSlots);
      await AsyncStorage.setItem(TIME_SLOTS_STORAGE_KEY, JSON.stringify(newSlots));

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.auth.updateUser({
          data: { custom_time_slots: newSlots },
        });
      }
    } catch (err) {
      console.error('[PERSIST TIME SLOTS EXCEPTION]', err);
    }
  };

  const fetchTimetableData = async () => {
    try {
      console.log('[SUPABASE TIMETABLE FETCH] Loading timetable from Supabase...');
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        console.warn('[SUPABASE TIMETABLE FETCH WARNING] No logged in user:', authErr?.message);
        setClasses([]);
        return;
      }

      const { data, error } = await supabase
        .from('timetable')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('[SUPABASE TIMETABLE FETCH ERROR]', error.message);
      } else if (data) {
        console.log('[SUPABASE TIMETABLE FETCH SUCCESS] Rows:', data.length, data);
        const formatted: ClassItem[] = data.map((item: any) => ({
          id: String(item.id),
          user_id: item.user_id,
          day: item.day,
          time: item.time || item.start_time || '9:00 AM',
          start_time: item.start_time || item.time || '9:00 AM',
          end_time: item.end_time || '10:00 AM',
          subject: item.subject,
          type: (item.class_type || item.type || 'Lecture') as any,
          class_type: item.class_type || item.type || 'Lecture',
          room: item.room || 'TBD',
        }));
        setClasses(formatted);
      }
    } catch (err) {
      console.error('[SUPABASE TIMETABLE FETCH EXCEPTION]', err);
    }
  };

  // --- TIME SLOT EDIT HANDLERS ---
  const openEditSlotModal = (index: number) => {
    setEditingSlotIndex(index);
    setSlotInputValue(timeSlots[index]);
    setIsNewSlotMode(false);
    setSlotModalVisible(true);
  };

  const openAddNewSlotModal = () => {
    setEditingSlotIndex(null);
    setSlotInputValue('');
    setIsNewSlotMode(true);
    setSlotModalVisible(true);
  };

  const handleSaveSlotModal = async () => {
    const val = slotInputValue.trim();
    if (!val || isSavingSlot) return;
    setIsSavingSlot(true);

    try {
      if (isNewSlotMode) {
        // Add new slot
        const updated = [...timeSlots, val];
        await persistTimeSlots(updated);
      } else if (editingSlotIndex !== null) {
        const oldLabel = timeSlots[editingSlotIndex];
        if (oldLabel !== val) {
          // 1. Update time slots list
          const updated = [...timeSlots];
          updated[editingSlotIndex] = val;
          await persistTimeSlots(updated);

          // 2. Migrate local classes
          setClasses((prev) =>
            prev.map((c) =>
              c.time === oldLabel || c.start_time === oldLabel
                ? { ...c, time: val, start_time: val }
                : c
            )
          );

          // 3. Migrate Supabase timetable records
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { error } = await supabase
              .from('timetable')
              .update({ start_time: val })
              .eq('user_id', user.id)
              .eq('start_time', oldLabel);

            if (error) {
              console.error('[SUPABASE SLOT MIGRATE ERROR]', error.message);
            }
          }
        }
      }
      setSlotModalVisible(false);
    } catch (err) {
      console.error('[SAVE SLOT EXCEPTION]', err);
    } finally {
      setIsSavingSlot(false);
    }
  };

  const handleDeleteSlot = async () => {
    if (editingSlotIndex === null || timeSlots.length <= 1 || isSavingSlot) return;
    setIsSavingSlot(true);

    try {
      const oldLabel = timeSlots[editingSlotIndex];
      const updated = timeSlots.filter((_, idx) => idx !== editingSlotIndex);
      await persistTimeSlots(updated);

      // Remove classes associated with this slot locally
      setClasses((prev) => prev.filter((c) => c.time !== oldLabel && c.start_time !== oldLabel));

      // Remove classes from Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('timetable')
          .delete()
          .eq('user_id', user.id)
          .eq('start_time', oldLabel);
      }

      setSlotModalVisible(false);
    } catch (err) {
      console.error('[DELETE SLOT EXCEPTION]', err);
    } finally {
      setIsSavingSlot(false);
    }
  };

  const handleResetSlots = async () => {
    setIsSavingSlot(true);
    try {
      await persistTimeSlots(DEFAULT_TIME_SLOTS);
      setSlotModalVisible(false);
    } catch (err) {
      console.error('[RESET SLOTS EXCEPTION]', err);
    } finally {
      setIsSavingSlot(false);
    }
  };

  const [modalError, setModalError] = useState<string | null>(null);

  // --- CLASS MODAL HANDLERS ---
  const openAddModal = (day: string, time: string) => {
    setSelectedSlot({ day, time });
    setSubjectInput('');
    setTypeInput('Lecture');
    setRoomInput('');
    setModalError(null);
    setModalVisible(true);
  };

  const openEditModal = (classData: ClassItem) => {
    setSelectedSlot({ day: classData.day, time: classData.time, existingClass: classData });
    setSubjectInput(classData.subject);
    setTypeInput(classData.type);
    setRoomInput(classData.room);
    setModalError(null);
    setModalVisible(true);
  };

  const handleSaveModal = async () => {
    setModalError(null);
    if (!subjectInput.trim()) {
      setModalError('Subject Name is required.');
      return;
    }
    if (!roomInput.trim()) {
      setModalError('Room / Location is required.');
      return;
    }

    if (!selectedSlot || isSaving) return;
    setIsSaving(true);

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        console.error('[SUPABASE TIMETABLE SAVE ERROR] User not logged in:', authErr?.message);
        setModalError('User not authenticated in Supabase!');
        return;
      }

      if (selectedSlot.existingClass) {
        // Update existing row
        const classId = selectedSlot.existingClass.id;
        const { data, error } = await supabase
          .from('timetable')
          .update({
            subject: subjectInput.trim(),
            class_type: typeInput,
            room: roomInput.trim() || 'TBD',
            start_time: selectedSlot.time,
          })
          .eq('id', classId)
          .eq('user_id', user.id)
          .select();

        if (error) {
          console.error('[SUPABASE TIMETABLE UPDATE ERROR]', error.message);
          const errText = `Error updating class: ${error.message}`;
          if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
            window.alert(errText);
          } else {
            Alert.alert('Error', errText);
          }
        } else {
          setClasses((prev) =>
            prev.map((c) =>
              c.id === classId
                ? {
                    ...c,
                    subject: subjectInput.trim(),
                    type: typeInput,
                    room: roomInput.trim() || 'TBD',
                    time: selectedSlot.time,
                    start_time: selectedSlot.time,
                  }
                : c
            )
          );
          setModalVisible(false);
          setSelectedSlot(null);
        }
      } else {
        // Insert new row matching database schema
        const payload = {
          user_id: user.id,
          subject: subjectInput.trim(),
          day: selectedSlot.day,
          start_time: selectedSlot.time,
          end_time: '10:00 AM',
          room: roomInput.trim() || 'TBD',
          class_type: typeInput,
        };

        console.log('[SUPABASE TIMETABLE INSERT PAYLOAD]', payload);

        const { data, error } = await supabase
          .from('timetable')
          .insert([payload])
          .select();

        if (error) {
          console.error('[SUPABASE TIMETABLE INSERT ERROR]', error.message);
          const errText = `Error saving class: ${error.message}`;
          if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
            window.alert(errText);
          } else {
            Alert.alert('Error', errText);
          }
        } else if (data && data.length > 0) {
          const item = data[0];
          const newClass: ClassItem = {
            id: String(item.id),
            user_id: item.user_id,
            day: item.day,
            time: item.start_time || item.time || selectedSlot.time,
            start_time: item.start_time || selectedSlot.time,
            end_time: item.end_time || '10:00 AM',
            subject: item.subject,
            type: (item.class_type || item.type || typeInput) as any,
            class_type: item.class_type || typeInput,
            room: item.room || 'TBD',
          };
          console.log('[SUPABASE TIMETABLE INSERT SUCCESS]', newClass);
          setClasses((prev) => [...prev, newClass]);
          setModalVisible(false);
          setSelectedSlot(null);
        }
      }
    } catch (e: any) {
      console.error('[SUPABASE TIMETABLE SAVE EXCEPTION]', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClass = async () => {
    if (!selectedSlot?.existingClass) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const classId = selectedSlot.existingClass.id;
      const { error } = await supabase
        .from('timetable')
        .delete()
        .eq('id', classId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[SUPABASE TIMETABLE DELETE ERROR]', error.message);
      } else {
        setClasses((prev) => prev.filter((c) => c.id !== classId));
        setModalVisible(false);
        setSelectedSlot(null);
      }
    } catch (err) {
      console.error('[SUPABASE TIMETABLE DELETE EXCEPTION]', err);
    }
  };

  const getTypeStyles = (type: ClassItem['type']) => {
    switch (type) {
      case 'Lecture':
        return {
          card: 'bg-indigo-50 border-indigo-200',
          title: 'text-indigo-600',
          badge: 'bg-indigo-100 text-indigo-700',
        };
      case 'Lab':
        return {
          card: 'bg-cyan-50 border-cyan-200',
          title: 'text-cyan-600',
          badge: 'bg-cyan-100 text-cyan-700',
        };
      case 'Tutorial':
        return {
          card: 'bg-emerald-50 border-emerald-200',
          title: 'text-emerald-600',
          badge: 'bg-emerald-100 text-emerald-700',
        };
      case 'Seminar':
        return {
          card: 'bg-rose-50 border-rose-200',
          title: 'text-rose-600',
          badge: 'bg-rose-100 text-rose-700',
        };
      default:
        return {
          card: 'bg-slate-50 border-slate-200',
          title: 'text-slate-700',
          badge: 'bg-slate-100 text-slate-700',
        };
    }
  };

  const getClassForSlot = (day: string, time: string) => {
    return classes.find((c) => c.day === day && (c.time === time || c.start_time === time));
  };

  const DAY_PILLS = ['All', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <ScrollView className="flex-1 bg-[#F4F7FE] p-8" showsVerticalScrollIndicator={true}>
      {/* Header Row */}
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <Text className="text-4xl font-serif font-bold text-slate-800 mb-1">Timetable</Text>
          <Text className="text-slate-500 text-sm font-medium">
            Semester 5 • Click any time label on the left column to customize slot timings
          </Text>
        </View>

        {/* Action Group */}
        <View className="flex-row items-center space-x-3 gap-3">
          {/* Day Filter Pills */}
          <View className="flex-row bg-slate-200/60 p-1 rounded-xl">
            {DAY_PILLS.map((day) => {
              const isActive = activeDayFilter === day;
              return (
                <TouchableOpacity
                  key={day}
                  onPress={() => setActiveDayFilter(day)}
                  className={`px-3 py-1.5 rounded-lg ${
                    isActive ? 'bg-slate-800' : 'bg-transparent'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isActive ? 'text-white' : 'text-slate-600'
                    }`}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Add Time Slot Button */}
          <TouchableOpacity
            onPress={openAddNewSlotModal}
            className="bg-indigo-600 px-4 py-2.5 rounded-xl flex-row items-center shadow-sm"
          >
            <Feather name="clock" size={15} color="#ffffff" style={{ marginRight: 6 }} />
            <Text className="text-white text-xs font-bold">Time Slot</Text>
          </TouchableOpacity>

          {/* Add Class Button */}
          <TouchableOpacity
            onPress={() => openAddModal('MON', timeSlots[0] || '8:00 AM')}
            className="bg-slate-900 px-5 py-2.5 rounded-xl flex-row items-center shadow-sm"
          >
            <Feather name="plus" size={16} color="#ffffff" style={{ marginRight: 6 }} />
            <Text className="text-white text-sm font-bold">Add Class</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Legend Row */}
      <View className="flex-row justify-between items-center bg-white px-6 py-3 rounded-xl border border-slate-100 mb-6 shadow-sm">
        <View className="flex-row items-center space-x-6 gap-6">
          <View className="flex-row items-center space-x-2 gap-2">
            <View className="w-3 h-3 rounded-full bg-indigo-500" />
            <Text className="text-xs font-semibold text-slate-600">Lecture</Text>
          </View>
          <View className="flex-row items-center space-x-2 gap-2">
            <View className="w-3 h-3 rounded-full bg-cyan-400" />
            <Text className="text-xs font-semibold text-slate-600">Lab</Text>
          </View>
          <View className="flex-row items-center space-x-2 gap-2">
            <View className="w-3 h-3 rounded-full bg-emerald-500" />
            <Text className="text-xs font-semibold text-slate-600">Tutorial</Text>
          </View>
          <View className="flex-row items-center space-x-2 gap-2">
            <View className="w-3 h-3 rounded-full bg-pink-400" />
            <Text className="text-xs font-semibold text-slate-600">Seminar</Text>
          </View>
        </View>

        <View className="flex-row items-center space-x-4 gap-4">
          <TouchableOpacity
            onPress={openAddNewSlotModal}
            className="flex-row items-center space-x-1.5 gap-1.5 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full"
          >
            <Feather name="edit-3" size={12} color="#4F46E5" />
            <Text className="text-xs font-bold text-indigo-700">Tap Any Time Slot to Edit</Text>
          </TouchableOpacity>

          <View className="flex-row items-center bg-yellow-50 border border-yellow-200 px-3 py-1 rounded-full">
            <View className="w-2 h-2 rounded-full bg-amber-500 mr-2" />
            <Text className="text-xs font-bold text-amber-700">Today ({getTodayFullName()})</Text>
          </View>
        </View>
      </View>

      {/* Interactive Grid Table */}
      <View className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-8">
        {/* Table Header Row */}
        <View className="flex-row border-b border-slate-100 bg-slate-50">
          <TouchableOpacity
            onPress={openAddNewSlotModal}
            activeOpacity={0.7}
            className="w-28 py-4 items-center justify-center border-r border-slate-100 flex-row space-x-1 gap-1 hover:bg-slate-100/80 cursor-pointer"
          >
            <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">TIME</Text>
            <Feather name="edit-3" size={11} color="#64748B" />
          </TouchableOpacity>

          {DAYS.map((day) => {
            const isToday = day === getTodayDayCode();
            const isFiltered = activeDayFilter === 'All' || activeDayFilter === day;

            if (!isFiltered) return null;

            return (
              <View
                key={day}
                className={`flex-1 py-4 items-center justify-center border-r border-slate-100 ${
                  isToday ? 'bg-yellow-50 border-t-2 border-yellow-400' : ''
                }`}
              >
                <Text
                  className={`text-xs font-bold tracking-wider ${
                    isToday ? 'text-amber-800' : 'text-slate-600'
                  }`}
                >
                  {day} {isToday ? '★' : ''}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Dynamic Time Rows */}
        {timeSlots.map((timeSlot, index) => {
          const isBreak =
            timeSlot.toUpperCase().includes('LUNCH') ||
            timeSlot.toUpperCase().includes('BREAK');

          if (isBreak) {
            return (
              <View key={`${timeSlot}-${index}`} className="flex-row border-b border-slate-100 min-h-[70px]">
                {/* Editable Time Column */}
                <TouchableOpacity
                  onPress={() => openEditSlotModal(index)}
                  activeOpacity={0.7}
                  className="w-28 py-4 px-2 border-r border-slate-100 items-center justify-center bg-amber-50/70 hover:bg-amber-100/70 group transition-all cursor-pointer"
                >
                  <View className="flex-row items-center space-x-1 gap-1">
                    <Text className="text-xs font-bold text-amber-800 text-center">{timeSlot}</Text>
                    <Feather name="edit-2" size={10} color="#D97706" className="opacity-40 group-hover:opacity-100" />
                  </View>
                </TouchableOpacity>

                {/* Lunch / Break Banner */}
                <View className="flex-1 bg-amber-50/40 border-r border-slate-100 items-center justify-center py-4">
                  <Text className="text-amber-700 font-bold tracking-widest text-xs uppercase">
                    {timeSlot}
                  </Text>
                </View>
              </View>
            );
          }

          return (
            <View key={`${timeSlot}-${index}`} className="flex-row border-b border-slate-50 min-h-[90px]">
              {/* Interactive/Editable Time Column */}
              <TouchableOpacity
                onPress={() => openEditSlotModal(index)}
                activeOpacity={0.7}
                className="w-28 px-2 py-4 border-r border-slate-100 items-center justify-center bg-slate-50/60 hover:bg-indigo-50/70 group transition-all cursor-pointer"
              >
                <View className="flex-row items-center space-x-1.5 gap-1.5">
                  <Text className="text-xs font-bold text-slate-700 group-hover:text-indigo-600 text-center">
                    {timeSlot}
                  </Text>
                  <Feather name="edit-2" size={10} color="#94A3B8" className="opacity-40 group-hover:opacity-100" />
                </View>
              </TouchableOpacity>

              {/* Day Columns */}
              {DAYS.map((day) => {
                const isFiltered = activeDayFilter === 'All' || activeDayFilter === day;
                if (!isFiltered) return null;

                const classData = getClassForSlot(day, timeSlot);
                const isTodayCol = day === 'FRI';

                return (
                  <View
                    key={day}
                    className={`flex-1 border-r border-slate-50 relative p-1.5 ${
                      isTodayCol ? 'bg-yellow-50/10' : ''
                    }`}
                  >
                    {classData ? (
                      // Class Card
                      <TouchableOpacity
                        onPress={() => openEditModal(classData)}
                        activeOpacity={0.85}
                        className={`p-3 rounded-xl border flex-1 justify-between shadow-xs ${
                          getTypeStyles(classData.type).card
                        }`}
                      >
                        <View>
                          <Text
                            className={`font-bold text-sm ${
                              getTypeStyles(classData.type).title
                            }`}
                            numberOfLines={1}
                          >
                            {classData.subject}
                          </Text>
                          <Text className="text-[11px] text-slate-500 mt-1 font-medium">
                            {classData.room}
                          </Text>
                        </View>

                        <View className="self-start mt-2">
                          <Text
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              getTypeStyles(classData.type).badge
                            }`}
                          >
                            {classData.type}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ) : (
                      // Empty Cell Dropzone
                      <TouchableOpacity
                        onPress={() => openAddModal(day, timeSlot)}
                        activeOpacity={0.7}
                        className="flex-1 min-h-[80px] rounded-xl justify-center items-center border border-dashed border-transparent hover:border-slate-300 hover:bg-slate-50/80 group transition-all"
                      >
                        <Text className="opacity-20 group-hover:opacity-100 text-slate-400 text-2xl font-light">
                          +
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>

      {/* Footer Summary Row */}
      <View className="flex-row justify-between gap-3 mb-10">
        {DAYS.map((day) => {
          const count = classes.filter((c) => c.day === day).length;
          const isToday = day === getTodayDayCode();

          return (
            <View
              key={day}
              className={`flex-1 rounded-xl p-4 items-center border shadow-xs ${
                isToday
                  ? 'border-yellow-400 bg-yellow-50/30'
                  : 'bg-white border-slate-100'
              }`}
            >
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {day}
              </Text>
              <Text className="text-3xl font-serif font-bold text-slate-800 mt-1">
                {count}
              </Text>
              <Text className="text-[11px] text-slate-400 font-medium mt-0.5">
                {count}h total
              </Text>
            </View>
          );
        })}
      </View>

      {/* Time Slot Editing Modal */}
      {slotModalVisible && (
        <View className="absolute inset-0 bg-black/40 justify-center items-center z-50 p-4">
          <View className="bg-white p-6 rounded-2xl w-full max-w-[400px] shadow-2xl border border-slate-100">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-slate-800 font-serif">
                {isNewSlotMode ? 'Add Time Slot' : 'Edit Time Slot'}
              </Text>
              <TouchableOpacity
                onPress={() => setSlotModalVisible(false)}
                className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
              >
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text className="text-xs text-slate-500 mb-4">
              Customize the left column time label (e.g. 8:30 AM, Shift 1, 10:15 AM - 11:15 AM).
            </Text>

            {/* Slot Label Input */}
            <View className="mb-5">
              <Text className="text-xs font-semibold text-slate-700 mb-1.5">Time Label</Text>
              <TextInput
                placeholder="e.g. 8:30 AM or 9:00 - 10:00 AM"
                value={slotInputValue}
                onChangeText={setSlotInputValue}
                className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-800 text-sm"
                placeholderTextColor="#94A3B8"
                autoFocus
              />
            </View>

            {/* Quick Preset Buttons */}
            <View className="mb-6">
              <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Quick Shift Presets
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {['8:30 AM', '9:30 AM', '10:30 AM', '11:30 AM', 'LUNCH BREAK'].map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    onPress={() => setSlotInputValue(preset)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    <Text className="text-xs font-medium text-slate-700">{preset}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Slot Actions */}
            <View className="flex-row items-center justify-between gap-3">
              {!isNewSlotMode && editingSlotIndex !== null ? (
                <TouchableOpacity
                  onPress={handleDeleteSlot}
                  disabled={isSavingSlot || timeSlots.length <= 1}
                  className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl"
                >
                  <Text className="text-red-600 font-bold text-xs">Delete Slot</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleResetSlots}
                  disabled={isSavingSlot}
                  className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <Text className="text-slate-600 font-bold text-xs">Reset All</Text>
                </TouchableOpacity>
              )}

              <View className="flex-row items-center space-x-2 gap-2">
                <TouchableOpacity
                  onPress={() => setSlotModalVisible(false)}
                  className="px-4 py-2.5 bg-slate-100 rounded-xl"
                >
                  <Text className="text-slate-600 font-bold text-xs">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveSlotModal}
                  disabled={isSavingSlot}
                  className="px-5 py-2.5 bg-indigo-600 rounded-xl"
                >
                  <Text className="text-white font-bold text-xs">
                    {isSavingSlot ? 'Saving...' : 'Save Slot'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Add/Edit Class Overlay Modal */}
      {modalVisible && (
        <View className="absolute inset-0 bg-black/40 justify-center items-center z-50 p-4">
          <View className="bg-white p-6 rounded-2xl w-full max-w-[420px] shadow-2xl border border-slate-100">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-slate-800 font-serif">
                {selectedSlot?.existingClass ? 'Edit Class' : 'Add New Class'}
              </Text>
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

            <Text className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-4">
              {selectedSlot?.day} • {selectedSlot?.time}
            </Text>

            {/* Time Slot Picker */}
            <View className="mb-4">
              <Text className="text-xs font-semibold text-slate-700 mb-1.5">Select Time Slot</Text>
              <View className="flex-row flex-wrap gap-1.5">
                {timeSlots.map((slot) => {
                  const isSelected = selectedSlot?.time === slot;
                  return (
                    <TouchableOpacity
                      key={slot}
                      onPress={() => setSelectedSlot((prev) => (prev ? { ...prev, time: slot } : null))}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold ${
                        isSelected
                          ? 'bg-slate-800 border-slate-800 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          isSelected ? 'text-white' : 'text-slate-600'
                        }`}
                      >
                        {slot}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Subject Name Input */}
            <View className="mb-4">
              <Text className="text-xs font-semibold text-slate-700 mb-1.5">Subject Name</Text>
              <TextInput
                placeholder="e.g. Mathematics"
                value={subjectInput}
                onChangeText={setSubjectInput}
                className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-800 text-sm"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Class Type Selector */}
            <View className="mb-4">
              <Text className="text-xs font-semibold text-slate-700 mb-1.5">Class Type</Text>
              <View className="flex-row flex-wrap gap-2">
                {(['Lecture', 'Lab', 'Tutorial', 'Seminar'] as const).map((t) => {
                  const isSelected = typeInput === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setTypeInput(t)}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold ${
                        isSelected
                          ? 'bg-slate-800 border-slate-800 text-white'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? 'text-white' : 'text-slate-600'
                        }`}
                      >
                        {t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Room / Location Input */}
            <View className="mb-6">
              <Text className="text-xs font-semibold text-slate-700 mb-1.5">Room / Location</Text>
              <TextInput
                placeholder="e.g. Room 301 or Lab 2"
                value={roomInput}
                onChangeText={setRoomInput}
                className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-800 text-sm"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Action Buttons */}
            <View className="flex-row items-center justify-between gap-3">
              {selectedSlot?.existingClass ? (
                <TouchableOpacity
                  onPress={handleDeleteClass}
                  {...(Platform.OS === 'web' ? { onClick: handleDeleteClass } : {})}
                  style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                  className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl cursor-pointer"
                >
                  <Text className="text-red-600 font-bold text-xs">Delete</Text>
                </TouchableOpacity>
              ) : <View />}

              <View className="flex-row items-center space-x-2 gap-2">
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  {...(Platform.OS === 'web' ? { onClick: () => setModalVisible(false) } : {})}
                  style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                  className="px-5 py-3 bg-slate-100 rounded-xl cursor-pointer"
                >
                  <Text className="text-slate-600 font-bold text-xs">Cancel</Text>
                </TouchableOpacity>

                {Platform.OS === 'web' ? (
                  <button
                    type="button"
                    onClick={handleSaveModal}
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
                ) : (
                  <TouchableOpacity
                    onPress={handleSaveModal}
                    className="px-6 py-3 bg-slate-900 rounded-xl"
                  >
                    <Text className="text-white font-bold text-xs">
                      {isSaving ? 'Saving...' : 'Save Class'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
