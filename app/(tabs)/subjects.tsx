import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { supabase } from '../../utils/supabase';

interface SubjectItem {
  id: string;
  name: string;
  code: string;
  instructor: string;
  user_id?: string;
  attended: number;
  total: number;
  percentage: number;
}

export default function SubjectsScreen() {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State for Adding / Editing Subjects
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null);

  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [instructorInput, setInstructorInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchSubjects = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSubjects([]);
        return;
      }

      // 1. Fetch from 'subjects' table in Supabase
      const { data: dbSubjects, error: subError } = await supabase
        .from('subjects')
        .select('*')
        .eq('user_id', user.id);

      // 2. Query timetable for distinct subjects
      const { data: ttData } = await supabase
        .from('timetable')
        .select('subject, room, class_type')
        .eq('user_id', user.id);

      // 3. Query attendance_logs to calculate attendance stats per subject
      const { data: logsData } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_id', user.id);

      // Combine subjects from 'subjects' table & 'timetable'
      const subjectMap: Record<string, SubjectItem> = {};

      if (dbSubjects && dbSubjects.length > 0) {
        dbSubjects.forEach((item: any, idx: number) => {
          subjectMap[item.name || item.subject] = {
            id: String(item.id || `sub_${idx}`),
            name: item.name || item.subject,
            code: item.code || `SUBJ${101 + idx}`,
            instructor: item.instructor || 'Faculty',
            user_id: item.user_id,
            attended: 0,
            total: 0,
            percentage: 100,
          };
        });
      }

      if (ttData && ttData.length > 0) {
        ttData.forEach((item: any, idx: number) => {
          if (item.subject && !subjectMap[item.subject]) {
            subjectMap[item.subject] = {
              id: `tt_${idx}`,
              name: item.subject,
              code: `SUBJ${101 + Object.keys(subjectMap).length}`,
              instructor: 'Faculty',
              attended: 0,
              total: 0,
              percentage: 100,
            };
          }
        });
      }

      // Compute attended and total from attendance_logs
      if (logsData && logsData.length > 0) {
        logsData.forEach((log: any) => {
          const subjName = log.subject;
          if (!subjName) return;

          if (!subjectMap[subjName]) {
            subjectMap[subjName] = {
              id: `log_${Math.random()}`,
              name: subjName,
              code: `SUBJ${101 + Object.keys(subjectMap).length}`,
              instructor: 'Faculty',
              attended: 0,
              total: 0,
              percentage: 100,
            };
          }

          subjectMap[subjName].total += 1;
          if (log.status === 'present' || log.status === 'late') {
            subjectMap[subjName].attended += 1;
          }
        });
      }

      const finalSubjects = Object.values(subjectMap).map((sub) => {
        const pct = sub.total > 0 ? Math.round((sub.attended / sub.total) * 100) : 100;
        return {
          ...sub,
          percentage: pct,
        };
      });

      setSubjects(finalSubjects);
    } catch (err) {
      console.error('[SUPABASE SUBJECTS FETCH EXCEPTION]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  const [formError, setFormError] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingSubject(null);
    setNameInput('');
    setCodeInput('');
    setInstructorInput('');
    setFormError(null);
    setModalVisible(true);
  };

  const openEditModal = (sub: SubjectItem) => {
    setEditingSubject(sub);
    setNameInput(sub.name);
    setCodeInput(sub.code);
    setInstructorInput(sub.instructor);
    setFormError(null);
    setModalVisible(true);
  };

  const handleSaveSubject = async () => {
    setFormError(null);
    if (!nameInput.trim()) {
      setFormError('Subject Name is required.');
      return;
    }
    if (!codeInput.trim()) {
      setFormError('Subject Code is required.');
      return;
    }
    if (!instructorInput.trim()) {
      setFormError('Instructor / Professor name is required.');
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setFormError('User not authenticated in Supabase!');
        return;
      }

      const payload = {
        user_id: user.id,
        name: nameInput.trim(),
        code: codeInput.trim(),
        instructor: instructorInput.trim(),
      };

      if (editingSubject && !editingSubject.id.startsWith('tt_') && !editingSubject.id.startsWith('log_')) {
        const { error } = await supabase
          .from('subjects')
          .update(payload)
          .eq('id', editingSubject.id);
        if (error) {
          setFormError(error.message);
          return;
        }
      } else {
        const { error } = await supabase
          .from('subjects')
          .insert([payload]);
        if (error) {
          setFormError(error.message);
          return;
        }
      }

      setModalVisible(false);
      fetchSubjects();
    } catch (err: any) {
      console.error('[SAVE SUBJECT ERROR]', err);
      setFormError(err?.message || 'Failed to save subject.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSubject = async (sub: SubjectItem) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (!sub.id.startsWith('tt_') && !sub.id.startsWith('log_')) {
        await supabase.from('subjects').delete().eq('id', sub.id);
      }

      // Also clean up timetable rows for this subject if desired
      await supabase.from('timetable').delete().eq('user_id', user.id).eq('subject', sub.name);

      fetchSubjects();
    } catch (err) {
      console.error('[DELETE SUBJECT ERROR]', err);
    }
  };

  const dotColors = [
    'bg-indigo-400',
    'bg-cyan-400',
    'bg-amber-400',
    'bg-pink-400',
    'bg-emerald-400',
    'bg-purple-400',
  ];

  return (
    <ScrollView className="flex-1 bg-[#F4F7FE] p-8" showsVerticalScrollIndicator={true}>
      {/* Page Header with Add Button */}
      <View className="flex-row justify-between items-center mb-8">
        <View>
          <Text className="text-4xl font-serif font-bold text-slate-800 mb-1">Subjects</Text>
          <Text className="text-slate-500 text-sm font-medium">
            Semester 5 • Manage your courses and attendance
          </Text>
        </View>

        <TouchableOpacity
          onPress={openAddModal}
          activeOpacity={0.8}
          className="bg-indigo-600 px-5 py-3 rounded-xl flex-row items-center shadow-sm"
        >
          <Text className="text-white font-bold text-sm">+ Add Subject</Text>
        </TouchableOpacity>
      </View>

      {/* Table Container */}
      <View className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Table Header Row */}
        <View className="flex-row border-b border-slate-100 bg-slate-50 px-6 py-4">
          <View className="flex-[2]">
            <Text className="text-xs font-bold text-slate-400 tracking-wider uppercase">
              SUBJECT
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-xs font-bold text-slate-400 tracking-wider uppercase">
              CODE
            </Text>
          </View>
          <View className="flex-[2]">
            <Text className="text-xs font-bold text-slate-400 tracking-wider uppercase">
              INSTRUCTOR
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-xs font-bold text-slate-400 tracking-wider uppercase">
              ATTENDED
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-xs font-bold text-slate-400 tracking-wider uppercase">
              TOTAL
            </Text>
          </View>
          <View className="flex-[2]">
            <Text className="text-xs font-bold text-slate-400 tracking-wider uppercase">
              ATTENDANCE
            </Text>
          </View>
          <View className="w-24">
            <Text className="text-xs font-bold text-slate-400 tracking-wider uppercase text-right">
              ACTIONS
            </Text>
          </View>
        </View>

        {loading ? (
          <View className="py-16 items-center justify-center">
            <ActivityIndicator size="large" color="#6366F1" />
            <Text className="text-xs text-slate-500 font-semibold mt-3">
              Loading subjects from Supabase...
            </Text>
          </View>
        ) : subjects.length === 0 ? (
          <View className="py-16 items-center justify-center px-4">
            <Text className="text-3xl mb-2">📖</Text>
            <Text className="text-slate-700 font-bold text-base">No subjects found</Text>
            <Text className="text-slate-400 text-xs mt-1 text-center">
              Click the "+ Add Subject" button above to register your courses.
            </Text>
          </View>
        ) : (
          subjects.map((row, index) => {
            const isLast = index === subjects.length - 1;
            const dotColor = dotColors[index % dotColors.length];
            const isAtRisk = row.percentage < 75;
            const barColor = isAtRisk ? 'bg-red-500' : 'bg-indigo-500';
            const textColor = isAtRisk ? 'text-red-500' : 'text-emerald-500';

            return (
              <View
                key={row.id || index}
                className={`flex-row items-center px-6 py-5 ${
                  isLast ? '' : 'border-b border-slate-50'
                }`}
              >
                {/* Subject Name */}
                <View className="flex-[2] flex-row items-center pr-2">
                  <View className={`w-3 h-3 rounded-full ${dotColor} mr-3`} />
                  <Text className="text-sm font-bold text-slate-800">{row.name}</Text>
                </View>

                {/* Code */}
                <View className="flex-1">
                  <Text className="text-sm text-slate-500 font-medium">{row.code}</Text>
                </View>

                {/* Instructor */}
                <View className="flex-[2]">
                  <Text className="text-sm text-slate-500 font-medium">{row.instructor}</Text>
                </View>

                {/* Attended */}
                <View className="flex-1">
                  <Text className="text-sm text-slate-800 font-bold">{row.attended}</Text>
                </View>

                {/* Total */}
                <View className="flex-1">
                  <Text className="text-sm text-slate-500 font-medium">{row.total}</Text>
                </View>

                {/* Attendance Bar & Percentage */}
                <View className="flex-[2] flex-row items-center pr-4">
                  <View className="h-2 flex-1 bg-slate-100 rounded-full mr-3 overflow-hidden">
                    <View
                      style={{ width: `${Math.min(100, Math.max(0, row.percentage))}%` }}
                      className={`h-full ${barColor} rounded-full`}
                    />
                  </View>
                  <Text className={`text-sm font-bold ${textColor}`}>
                    {row.percentage}%
                  </Text>
                </View>

                {/* Action Buttons */}
                <View className="w-24 flex-row items-center justify-end space-x-2 gap-2">
                  <TouchableOpacity
                    onPress={() => openEditModal(row)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200"
                  >
                    <Text className="text-xs font-bold text-slate-600">Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteSubject(row)}
                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100"
                  >
                    <Text className="text-xs font-bold text-rose-600">Del</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Add / Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
          className="flex-1 justify-center items-center bg-black/60 p-4"
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl border border-slate-100"
          >
            <Text className="text-xl font-bold text-slate-800 mb-4 font-serif">
              {editingSubject ? 'Edit Subject' : 'Add New Subject'}
            </Text>

            {formError && (
              <View className="bg-rose-50 border border-rose-200 p-3 rounded-xl mb-4 flex-row items-center space-x-2 gap-2">
                <Text className="text-xs font-bold text-rose-600">⚠️ {formError}</Text>
              </View>
            )}

            <Text className="text-xs font-bold text-slate-700 mb-1">Subject Name *</Text>
            <TextInput
              placeholder="e.g. Mathematics"
              placeholderTextColor="#94A3B8"
              value={nameInput}
              onChangeText={setNameInput}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 mb-4 text-sm font-medium"
            />

            <Text className="text-xs font-bold text-slate-700 mb-1">Subject Code *</Text>
            <TextInput
              placeholder="e.g. MTH301"
              placeholderTextColor="#94A3B8"
              value={codeInput}
              onChangeText={setCodeInput}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 mb-4 text-sm font-medium"
            />

            <Text className="text-xs font-bold text-slate-700 mb-1">Instructor / Professor *</Text>
            <TextInput
              placeholder="e.g. Dr. Priya Sharma"
              placeholderTextColor="#94A3B8"
              value={instructorInput}
              onChangeText={setInstructorInput}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 mb-6 text-sm"
            />

            <View className="flex-row justify-end space-x-3 gap-3">
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 cursor-pointer"
              >
                <Text className="text-slate-600 font-bold text-sm">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveSubject}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 cursor-pointer"
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-white font-bold text-sm">Save Subject</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}
