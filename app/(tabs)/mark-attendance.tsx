import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../utils/supabase';
import {
  pickImageFromLibrary,
  takePhotoWithCamera,
  uploadImageToStorage,
} from '../../utils/imagePickerHelper';

interface SubjectItem {
  id: string;
  name: string;
  code: string;
  time: string;
  room: string;
  borderColor: string;
}

const STATUS_OPTIONS = ['Present', 'Absent', 'Bunk', 'Teacher Off'];

const getTodayDayCode = (): string => {
  const dayIdx = new Date().getDay();
  const map = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return map[dayIdx] || 'MON';
};

const getTodayDayFullName = (): string => {
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

export default function MarkAttendanceScreen() {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [applyToRestOfDay, setApplyToRestOfDay] = useState<boolean>(false);
  const [photoAttached, setPhotoAttached] = useState<boolean>(false);
  const [attachedPhotoUrl, setAttachedPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);

  // Saved statuses map
  const [savedData, setSavedData] = useState<Record<string, { status: string; details?: string }>>({});

  useEffect(() => {
    fetchSubjects();
  }, []);

  const handlePickBlackboardPhoto = async () => {
    try {
      setUploadingPhoto(true);
      const picked = await pickImageFromLibrary();
      if (picked) {
        console.log('[MARK ATTENDANCE] Uploading photo to Cloudinary...');
        const uploadedUrl = await uploadImageToStorage(picked.uri, picked.base64);
        console.log('[MARK ATTENDANCE] Cloudinary Photo Uploaded Successfully:', uploadedUrl);
        setAttachedPhotoUrl(uploadedUrl);
        setPhotoAttached(true);
      }
    } catch (err: any) {
      console.error('[BLACKBOARD PHOTO UPLOAD ERROR]', err);
      Alert.alert('Upload Error', err?.message || 'Failed to upload blackboard photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const fetchSubjects = async () => {
    try {
      setLoading(true);
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        console.warn('[MARK ATTENDANCE] No authenticated user found:', authErr?.message);
        setSubjects([]);
        setLoading(false);
        return;
      }

      const todayCode = getTodayDayCode();
      console.log(`[MARK ATTENDANCE] Fetching timetable for today (${todayCode}) for user:`, user.id);
      const { data, error } = await supabase
        .from('timetable')
        .select('id, subject, start_time, end_time, room, class_type, day')
        .eq('user_id', user.id);

      if (error) {
        console.error('[MARK ATTENDANCE FETCH ERROR]', error.message);
        setSubjects([]);
      } else if (data) {
        // Filter strictly for today's scheduled classes
        const todayClasses = data.filter(
          (item: any) => String(item.day || '').toUpperCase() === todayCode
        );

        // Remove duplicates to get unique subject list for today
        const uniqueSubjectNames = Array.from(
          new Set(todayClasses.map((item: any) => item.subject).filter(Boolean))
        );

        const borderColors = [
          'border-indigo-500',
          'border-cyan-400',
          'border-amber-500',
          'border-emerald-500',
          'border-pink-400',
          'border-purple-500',
        ];

        const formatted: SubjectItem[] = uniqueSubjectNames.map((subjectName, idx) => {
          const matchingClass = todayClasses.find((item: any) => item.subject === subjectName);
          return {
            id: matchingClass?.id ? String(matchingClass.id) : `subj_${idx}`,
            name: subjectName,
            code: `SUBJ${idx + 101}`,
            time: matchingClass?.start_time
              ? `${matchingClass.start_time}${matchingClass.end_time ? ' - ' + matchingClass.end_time : ''}`
              : 'Scheduled',
            room: matchingClass?.room || 'Room TBD',
            borderColor: borderColors[idx % borderColors.length],
          };
        });

        console.log(`[MARK ATTENDANCE FETCH SUCCESS] Formatted ${todayCode} subjects:`, formatted);
        setSubjects(formatted);
      }
    } catch (err) {
      console.error('[MARK ATTENDANCE EXCEPTION]', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStatus = (subjectId: string, status: string) => {
    if (activeSubject === subjectId && activeStatus === status) {
      // Toggle close
      setActiveSubject(null);
      setActiveStatus(null);
    } else {
      setActiveSubject(subjectId);
      setActiveStatus(status);
      // Reset text inputs but retain attachedPhotoUrl if user already picked it
      setNotes('');
      setReason('');
      setApplyToRestOfDay(false);
    }
  };

  const handleSaveAttendance = async (subject: SubjectItem) => {
    if (!activeStatus) return;

    let detailsStr = '';
    if (activeStatus === 'Present' && notes) detailsStr = `Notes: ${notes}`;
    if ((activeStatus === 'Absent' || activeStatus === 'Bunk') && reason) detailsStr = `Reason: ${reason}`;

    const photoUrlToSave = attachedPhotoUrl || null;
    const notesWithPhoto = detailsStr
      ? photoUrlToSave
        ? `${detailsStr}\nPhoto: ${photoUrlToSave}`
        : detailsStr
      : photoUrlToSave
      ? `Photo: ${photoUrlToSave}`
      : null;

    console.log('[MARK ATTENDANCE SAVE] Subject:', subject.name, 'Photo URL:', photoUrlToSave);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const todayStr = new Date().toISOString().split('T')[0];
        const statusKey =
          activeStatus.toLowerCase() === 'present'
            ? 'present'
            : activeStatus.toLowerCase() === 'absent'
            ? 'absent'
            : activeStatus.toLowerCase() === 'bunk'
            ? 'bunk'
            : 'teacher_off';

        const fullPayload = {
          user_id: user.id,
          subject: subject.name,
          status: statusKey,
          date: todayStr,
          notes: notesWithPhoto,
          photo_url: photoUrlToSave,
          image_url: photoUrlToSave,
          photo: photoUrlToSave,
          mediaUrls: photoUrlToSave ? [photoUrlToSave] : [],
        };

        console.log('[MARK ATTENDANCE SUBMITTING PAYLOAD]', fullPayload);

        // 1. Check existing log entry for current user, subject & date
        const { data: existingLogs, error: checkErr } = await supabase
          .from('attendance_logs')
          .select('id')
          .eq('user_id', user.id)
          .eq('subject', subject.name)
          .eq('date', todayStr);

        if (checkErr) {
          console.warn('[MARK ATTENDANCE CHECK ERR]', checkErr.message);
        }

        if (existingLogs && existingLogs.length > 0) {
          // 2. Update existing entry instead of duplicate insertion
          const existingId = existingLogs[0].id;
          console.log('[MARK ATTENDANCE UPDATING EXISTING RECORD ID]', existingId);

          const { error: updateErr } = await supabase
            .from('attendance_logs')
            .update(fullPayload)
            .eq('id', existingId);

          if (updateErr) {
            console.warn('[MARK ATTENDANCE UPDATE FALLBACK]', updateErr.message);
            await supabase
              .from('attendance_logs')
              .update({
                status: statusKey,
                notes: notesWithPhoto,
              })
              .eq('id', existingId);
          }
        } else {
          // 3. Insert new entry if no existing record
          console.log('[MARK ATTENDANCE INSERTING NEW RECORD]', fullPayload);
          const { error: insertErr } = await supabase
            .from('attendance_logs')
            .insert([fullPayload]);

          if (insertErr) {
            console.warn('[MARK ATTENDANCE INSERT FALLBACK]', insertErr.message);
            await supabase
              .from('attendance_logs')
              .insert([{
                user_id: user.id,
                subject: subject.name,
                status: statusKey,
                date: todayStr,
                notes: notesWithPhoto,
              }]);
          }
        }
      }
    } catch (err) {
      console.error('[MARK ATTENDANCE SAVE ERROR]', err);
    }

    setAttachedPhotoUrl(null);
    setPhotoAttached(false);

    setSavedData((prev) => ({
      ...prev,
      [subject.id]: {
        status: activeStatus,
        details: detailsStr,
      },
    }));

    const msg = `Attendance for ${subject.name} saved as "${activeStatus}".`;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
      window.alert(msg);
    } else {
      Alert.alert('Attendance Saved', msg);
    }

    // Reset active form selection
    setActiveSubject(null);
    setActiveStatus(null);
  };

  const todayDisplayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <ScrollView className="flex-1 bg-[#F4F7FE] p-8" showsVerticalScrollIndicator={true}>
      {/* Page Header */}
      <Text className="text-4xl font-serif font-bold text-slate-800 mb-1">
        Mark Attendance
      </Text>
      <Text className="text-slate-500 text-sm font-medium mb-8">
        {todayDisplayDate}
      </Text>

      {/* Subject Cards List */}
      <View className="max-w-4xl">
        {loading ? (
          <View className="bg-white rounded-2xl p-8 items-center justify-center border border-slate-100 mb-5">
            <Text className="text-slate-400 text-sm font-medium">Loading subjects from timetable...</Text>
          </View>
        ) : subjects.length === 0 ? (
          <View className="bg-white rounded-2xl p-8 items-center justify-center border border-slate-100 mb-5">
            <Text className="text-slate-600 font-bold text-base mb-1">No Subjects Found in Timetable</Text>
            <Text className="text-slate-400 text-sm text-center">
              Please add classes to your Timetable screen first. Added subjects will automatically appear here.
            </Text>
          </View>
        ) : (
          subjects.map((subject) => {
            const isCardActive = activeSubject === subject.id;
            const savedInfo = savedData[subject.id];

            return (
              <View
                key={subject.id}
                className={`bg-white rounded-2xl shadow-sm mb-5 p-6 border-l-8 ${subject.borderColor}`}
              >
                {/* Card Header */}
                <View className="flex-row justify-between items-start mb-4">
                  <View>
                    <Text className="text-xl font-bold text-slate-800">{subject.name}</Text>
                    <Text className="text-sm text-slate-400 mt-1">
                      {subject.time} • {subject.room}
                    </Text>
                  </View>

                  {savedInfo && (
                    <View className="bg-slate-100 px-3 py-1 rounded-full flex-row items-center">
                      <Feather name="check-circle" size={14} color="#10B981" style={{ marginRight: 5 }} />
                      <Text className="text-xs font-bold text-slate-700">
                        Saved: {savedInfo.status}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Action Buttons (The Pills) */}
                <View className="flex-row flex-wrap items-center">
                  {STATUS_OPTIONS.map((status) => {
                    const isSelected = isCardActive && activeStatus === status;

                    return (
                      <TouchableOpacity
                        key={status}
                        onPress={() => handleSelectStatus(subject.id, status)}
                        {...(Platform.OS === 'web' ? { onClick: () => handleSelectStatus(subject.id, status) } : {})}
                        activeOpacity={0.8}
                        style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                        className={`border rounded-full px-5 py-2 mr-3 mb-2 cursor-pointer ${
                          isSelected
                            ? 'bg-slate-800 border-slate-800'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <Text
                          className={`font-semibold text-sm ${
                            isSelected ? 'text-white' : 'text-slate-600'
                          }`}
                        >
                          {status}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Dynamic Inline Form (Renders ONLY inside active subject card) */}
                {isCardActive && activeStatus && (
                  <View className="mt-4 pt-4 border-t border-slate-100">
                    {/* Present Form */}
                    {activeStatus === 'Present' && (
                      <View>
                        <TextInput
                          placeholder="Enter Class Notes..."
                          value={notes}
                          onChangeText={setNotes}
                          className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-3 text-slate-800 text-sm"
                          placeholderTextColor="#94A3B8"
                          multiline
                        />
                        <TouchableOpacity
                          onPress={handlePickBlackboardPhoto}
                          {...(Platform.OS === 'web' ? { onClick: handlePickBlackboardPhoto } : {})}
                          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                          className="flex-row items-center bg-indigo-50 p-3 rounded-xl border border-indigo-100 self-start cursor-pointer mb-2"
                        >
                          <Text className="text-indigo-600 font-medium text-sm">
                            {uploadingPhoto
                              ? '⏳ Uploading Photo...'
                              : attachedPhotoUrl
                              ? '✅ Blackboard Photo Attached'
                              : '📸 Capture/Upload Blackboard Photo'}
                          </Text>
                        </TouchableOpacity>

                        {attachedPhotoUrl && (
                          <View className="relative w-24 h-24 rounded-xl overflow-hidden mb-3 border border-slate-200">
                            <Image source={{ uri: attachedPhotoUrl }} className="w-full h-full" resizeMode="cover" />
                            <TouchableOpacity
                              onPress={() => {
                                setAttachedPhotoUrl(null);
                                setPhotoAttached(false);
                              }}
                              {...(Platform.OS === 'web' ? { onClick: () => { setAttachedPhotoUrl(null); setPhotoAttached(false); } } : {})}
                              style={{ cursor: 'pointer' }}
                              className="absolute top-1 right-1 bg-black/60 w-6 h-6 rounded-full items-center justify-center cursor-pointer"
                            >
                              <Text className="text-white text-xs font-bold">✕</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Absent / Bunk Form */}
                    {(activeStatus === 'Absent' || activeStatus === 'Bunk') && (
                      <View>
                        <TextInput
                          placeholder="Reason..."
                          value={reason}
                          onChangeText={setReason}
                          className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-3 text-slate-800 text-sm"
                          placeholderTextColor="#94A3B8"
                        />
                        <TouchableOpacity
                          onPress={() => setApplyToRestOfDay(!applyToRestOfDay)}
                          {...(Platform.OS === 'web' ? { onClick: () => setApplyToRestOfDay(!applyToRestOfDay) } : {})}
                          className="flex-row items-center mt-1 cursor-pointer"
                          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                          activeOpacity={0.8}
                        >
                          <View
                            className={`w-5 h-5 rounded border items-center justify-center mr-2.5 ${
                              applyToRestOfDay
                                ? 'bg-indigo-600 border-indigo-600'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {applyToRestOfDay && (
                              <Feather name="check" size={13} color="#ffffff" />
                            )}
                          </View>
                          <Text className="text-sm font-medium text-slate-600">
                            Apply this status to all remaining classes today
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Teacher Off Info */}
                    {activeStatus === 'Teacher Off' && (
                      <Text className="text-slate-500 italic text-sm py-1">
                        Class Cancelled by Instructor (Excluded from Denominator)
                      </Text>
                    )}

                    {/* Save Button */}
                    <TouchableOpacity
                      onPress={() => handleSaveAttendance(subject)}
                      {...(Platform.OS === 'web' ? { onClick: () => handleSaveAttendance(subject) } : {})}
                      style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                      className="bg-indigo-600 text-white rounded-xl py-3 px-6 mt-4 items-center self-start shadow-sm cursor-pointer"
                      activeOpacity={0.8}
                    >
                      <Text className="text-white font-bold text-sm">Save Attendance</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
