import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import {
  pickImageFromLibrary,
  takePhotoWithCamera,
  uploadImageToStorage,
} from '../utils/imagePickerHelper';

export type AttendanceStatus = 'present' | 'absent' | 'bunk' | 'teacher_absent' | null;

export interface Lecture {
  id: string;
  time: string;
  endTime: string;
  subject: string;
  code: string;
  room: string;
  instructor: string;
  status: AttendanceStatus;
  topicTaught?: string;
  absenceReason?: string;
  appliedToRestOfDay?: boolean;
  mediaUrls?: string[];
}

export interface SaveLogPayload {
  subject: string;
  status: AttendanceStatus;
  topicTaught: string;
  absenceReason: string;
  appliedToRestOfDay: boolean;
  mediaUrls: string[];
}

interface LectureCardProps {
  lecture: Lecture;
  onStatusChange: (id: string, status: AttendanceStatus) => void;
  onApplyStatusToRemaining: (currentId: string, status: AttendanceStatus) => void;
  onSaveLog: (
    lecture: Lecture,
    payload: SaveLogPayload,
    showAlert?: boolean
  ) => Promise<void>;
}

export const LectureCard: React.FC<LectureCardProps> = ({
  lecture,
  onStatusChange,
  onApplyStatusToRemaining,
  onSaveLog,
}) => {
  // Component-isolated local state for details & expanded fields
  const [topicText, setTopicText] = useState(lecture.topicTaught || '');
  const [reasonText, setReasonText] = useState(lecture.absenceReason || '');
  const [applyToRemaining, setApplyToRemaining] = useState(
    lecture.appliedToRestOfDay || false
  );
  const [isSaving, setIsSaving] = useState(false);

  // Cloudinary image upload states
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadedMediaUrls, setUploadedMediaUrls] = useState<string[]>(
    lecture.mediaUrls || []
  );

  const quickReasons = ['Overslept', 'Sick', 'Assignment'];

  /**
   * Helper to upload image directly to Cloudinary using Unsigned Upload REST API
   */
  const uploadToCloudinary = async (uri: string, base64Data?: string | null): Promise<string> => {
    const CLOUD_NAME = 'iyrlsdf1';
    const UPLOAD_PRESET = 'college_tracker';

    const formData = new FormData();

    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      formData.append('file', blob);
    } else {
      if (!base64Data) throw new Error('Base64 data is missing');
      formData.append('file', `data:image/jpeg;base64,${base64Data}`);
    }

    formData.append('upload_preset', UPLOAD_PRESET);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const data = await response.json();
    if (data.secure_url) {
      return data.secure_url;
    }
    throw new Error(data.error?.message || 'Cloudinary upload failed.');
  };

  const handlePickImageFromLibrary = async () => {
    try {
      setIsUploadingImage(true);
      const picked = await pickImageFromLibrary();
      if (picked) {
        const uploadedUrl = await uploadImageToStorage(picked.uri, picked.base64);
        setUploadedMediaUrls((prev) => [...prev, uploadedUrl]);
      }
    } catch (error: any) {
      console.error('[IMAGE PICKER ERROR]', error);
      Alert.alert('Upload Error', error?.message || 'Could not upload photo.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleTakePhotoWithCamera = async () => {
    try {
      setIsUploadingImage(true);
      const taken = await takePhotoWithCamera();
      if (taken) {
        const uploadedUrl = await uploadImageToStorage(taken.uri, taken.base64);
        setUploadedMediaUrls((prev) => [...prev, uploadedUrl]);
      }
    } catch (error: any) {
      console.error('[CAMERA ERROR]', error);
      Alert.alert('Camera Error', error?.message || 'Could not take photo.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleRemovePhoto = (indexToRemove: number) => {
    setUploadedMediaUrls((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleReasonChipPress = (chip: string) => {
    setReasonText((prev) => (prev === chip ? '' : chip));
  };

  const handleToggleApplyToRemaining = () => {
    const nextVal = !applyToRemaining;
    setApplyToRemaining(nextVal);
    if (nextVal && lecture.status) {
      onApplyStatusToRemaining(lecture.id, lecture.status);
    }
  };

  const handleTriggerSave = async () => {
    if (!lecture.status) return;
    setIsSaving(true);
    try {
      await onSaveLog(
        lecture,
        {
          subject: lecture.subject,
          status: lecture.status,
          topicTaught: topicText,
          absenceReason: reasonText,
          appliedToRestOfDay: applyToRemaining,
          mediaUrls: uploadedMediaUrls,
        },
        true
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="bg-white dark:bg-slate-900 p-5 rounded-2xl mb-4 border border-gray-100 dark:border-slate-800 shadow-sm">
      {/* Top Header Row: Left Details vs Right Status Badge */}
      <View className="flex-row items-start justify-between mb-3">
        {/* Left Side: Time, Subject Name, Room & Instructor */}
        <View className="flex-1 pr-3">
          {/* Top: Time slot */}
          <Text className="text-blue-600 dark:text-blue-400 font-semibold text-xs mb-1">
            {lecture.time} - {lecture.endTime}
          </Text>

          {/* Middle: Subject Name */}
          <Text className="text-gray-900 dark:text-white font-bold text-lg leading-tight mb-1">
            {lecture.subject}
          </Text>

          {/* Bottom: Muted text for Room & Instructor with Feather icons */}
          <View className="flex-row items-center flex-wrap gap-x-3 gap-y-1 mt-1">
            <View className="flex-row items-center">
              <Feather name="map-pin" size={12} color="#6b7280" style={{ marginRight: 4 }} />
              <Text className="text-gray-500 dark:text-slate-400 text-xs font-medium">
                {lecture.room}
              </Text>
            </View>

            <View className="flex-row items-center">
              <Feather name="user" size={12} color="#6b7280" style={{ marginRight: 4 }} />
              <Text className="text-gray-500 dark:text-slate-400 text-xs font-medium">
                {lecture.instructor}
              </Text>
            </View>

            <View className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
              <Text className="text-[10px] font-bold text-gray-600 dark:text-slate-300">
                {lecture.code}
              </Text>
            </View>
          </View>
        </View>

        {/* Right Side: Status Badge */}
        <View className="items-end pt-0.5">
          {lecture.status === 'present' && (
            <View className="bg-green-50 dark:bg-green-950/60 border border-green-200 dark:border-green-900 px-3 py-1.5 rounded-full flex-row items-center">
              <Feather name="check-circle" size={12} color="#15803d" style={{ marginRight: 5 }} />
              <Text className="text-green-700 dark:text-green-400 text-xs font-bold">Present</Text>
            </View>
          )}

          {lecture.status === 'absent' && (
            <View className="bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 px-3 py-1.5 rounded-full flex-row items-center">
              <Feather name="x-circle" size={12} color="#b91c1c" style={{ marginRight: 5 }} />
              <Text className="text-red-700 dark:text-red-400 text-xs font-bold">Absent</Text>
            </View>
          )}

          {lecture.status === 'bunk' && (
            <View className="bg-orange-50 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-900 px-3 py-1.5 rounded-full flex-row items-center">
              <Feather name="clock" size={12} color="#c2410c" style={{ marginRight: 5 }} />
              <Text className="text-orange-700 dark:text-orange-400 text-xs font-bold">Bunked</Text>
            </View>
          )}

          {lecture.status === 'teacher_absent' && (
            <View className="bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-900 px-3 py-1.5 rounded-full flex-row items-center">
              <Feather name="minus-circle" size={12} color="#6b21a8" style={{ marginRight: 5 }} />
              <Text className="text-purple-700 dark:text-purple-400 text-xs font-bold">Teacher Off</Text>
            </View>
          )}

          {!lecture.status && (
            <View className="bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-3 py-1.5 rounded-full flex-row items-center">
              <Feather name="plus-circle" size={12} color="#6b7280" style={{ marginRight: 5 }} />
              <Text className="text-gray-600 dark:text-slate-300 text-xs font-bold">Mark</Text>
            </View>
          )}
        </View>
      </View>

      {/* Divider */}
      <View className="h-[1px] bg-gray-100 dark:bg-slate-800 my-3" />

      {/* 2x2 Status Selection Grid */}
      <Text className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2.5 ml-0.5">
        Select Attendance Status
      </Text>

      <View className="flex-row flex-wrap justify-between gap-y-2.5 mb-4">
        {/* Present Button */}
        <TouchableOpacity
          onPress={() => onStatusChange(lecture.id, 'present')}
          activeOpacity={0.8}
          className={`w-[48%] py-3 px-3 rounded-2xl flex-row items-center justify-center border ${
            lecture.status === 'present'
              ? 'bg-green-100 border-2 border-emerald-600'
              : 'bg-green-50 border-green-200'
          }`}
        >
          <Feather name="check-circle" size={16} color="#15803d" style={{ marginRight: 6 }} />
          <Text className="text-xs font-bold text-green-700">Present</Text>
        </TouchableOpacity>

        {/* Absent Button */}
        <TouchableOpacity
          onPress={() => onStatusChange(lecture.id, 'absent')}
          activeOpacity={0.8}
          className={`w-[48%] py-3 px-3 rounded-2xl flex-row items-center justify-center border ${
            lecture.status === 'absent'
              ? 'bg-red-100 border-2 border-rose-600'
              : 'bg-red-50 border-red-200'
          }`}
        >
          <Feather name="x-circle" size={16} color="#b91c1c" style={{ marginRight: 6 }} />
          <Text className="text-xs font-bold text-red-700">Absent</Text>
        </TouchableOpacity>

        {/* Bunk Button */}
        <TouchableOpacity
          onPress={() => onStatusChange(lecture.id, 'bunk')}
          activeOpacity={0.8}
          className={`w-[48%] py-3 px-3 rounded-2xl flex-row items-center justify-center border ${
            lecture.status === 'bunk'
              ? 'bg-orange-100 border-2 border-orange-600'
              : 'bg-orange-50 border-orange-200'
          }`}
        >
          <Feather name="clock" size={16} color="#c2410c" style={{ marginRight: 6 }} />
          <Text className="text-xs font-bold text-orange-700">Bunked</Text>
        </TouchableOpacity>

        {/* Teacher Off Button */}
        <TouchableOpacity
          onPress={() => onStatusChange(lecture.id, 'teacher_absent')}
          activeOpacity={0.8}
          className={`w-[48%] py-3 px-3 rounded-2xl flex-row items-center justify-center border ${
            lecture.status === 'teacher_absent'
              ? 'bg-purple-100 border-2 border-purple-600'
              : 'bg-purple-50 border-purple-200'
          }`}
        >
          <Feather name="minus-circle" size={16} color="#6b21a8" style={{ marginRight: 6 }} />
          <Text className="text-xs font-bold text-purple-700">Teacher Off</Text>
        </TouchableOpacity>
      </View>

      {/* EXPANDED SECTION FOR PRESENT STATUS */}
      {lecture.status === 'present' && (
        <View className="mt-2 pt-3 border-t border-gray-100 dark:border-slate-800">
          <Text className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-2">
            Class Notes & Blackboard Photo
          </Text>

          <TextInput
            placeholder="Add class notes or topics taught today..."
            placeholderTextColor="#9ca3af"
            value={topicText}
            onChangeText={setTopicText}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            className="bg-gray-100 dark:bg-slate-800/80 p-4 rounded-xl text-gray-800 dark:text-slate-100 text-xs mb-3 min-h-[70px]"
          />

          {/* Photo Action Buttons */}
          <View className="flex-row items-center justify-between space-x-2 gap-2 mb-3">
            <TouchableOpacity
              onPress={handlePickImageFromLibrary}
              disabled={isUploadingImage}
              className="flex-1 flex-row items-center justify-center py-3 px-3 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 dark:bg-blue-950/40 dark:border-blue-800"
            >
              <Feather name="image" size={16} color="#2563eb" style={{ marginRight: 6 }} />
              <Text className="text-xs font-bold text-blue-700 dark:text-blue-300">
                Upload Photo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleTakePhotoWithCamera}
              disabled={isUploadingImage}
              className="flex-1 flex-row items-center justify-center py-3 px-3 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 dark:bg-blue-950/40 dark:border-blue-800"
            >
              <Feather name="camera" size={16} color="#2563eb" style={{ marginRight: 6 }} />
              <Text className="text-xs font-bold text-blue-700 dark:text-blue-300">
                Take Photo
              </Text>
            </TouchableOpacity>
          </View>

          {/* Loading Indicator during Cloudinary Upload */}
          {isUploadingImage && (
            <View className="flex-row items-center justify-center bg-gray-100 dark:bg-slate-800 p-3 rounded-xl mb-3">
              <ActivityIndicator size="small" color="#2563eb" />
              <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400 ml-2">
                Uploading image to Cloudinary...
              </Text>
            </View>
          )}

          {/* Thumbnail Preview Strip */}
          {uploadedMediaUrls.length > 0 && (
            <View className="mb-3">
              <Text className="text-[10px] font-bold text-gray-400 uppercase mb-2">
                Attached Blackboard Photos ({uploadedMediaUrls.length})
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {uploadedMediaUrls.map((url, index) => (
                  <View key={index} className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
                    <Image
                      source={{ uri: url }}
                      className="w-16 h-16 rounded-xl"
                      resizeMode="cover"
                    />
                    <TouchableOpacity
                      onPress={() => handleRemovePhoto(index)}
                      className="absolute top-1 right-1 bg-red-600/90 rounded-full w-5 h-5 items-center justify-center"
                    >
                      <Text className="text-white text-[10px] font-bold">✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Save Attendance Button */}
          <TouchableOpacity
            onPress={handleTriggerSave}
            disabled={isSaving || isUploadingImage}
            activeOpacity={0.8}
            className="bg-blue-600 py-4 rounded-2xl items-center justify-center shadow-md shadow-blue-500/20 mt-1"
          >
            <Text className="text-white font-bold text-base">
              {isSaving ? 'Saving to Server...' : 'Save Attendance'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* EXPANDED SECTION FOR BUNK OR ABSENT STATUS */}
      {(lecture.status === 'bunk' || lecture.status === 'absent') && (
        <View className="mt-2 pt-3 border-t border-gray-100 dark:border-slate-800">
          <Text
            className={`text-xs font-bold mb-2 ${
              lecture.status === 'bunk' ? 'text-orange-700 dark:text-orange-400' : 'text-red-700 dark:text-red-400'
            }`}
          >
            {lecture.status === 'bunk' ? 'Bunk Reason' : 'Absence Reason'}
          </Text>

          <TextInput
            placeholder="Why did you miss this class?"
            placeholderTextColor="#9ca3af"
            value={reasonText}
            onChangeText={setReasonText}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            className="bg-gray-100 dark:bg-slate-800/80 p-4 rounded-xl text-gray-800 dark:text-slate-100 text-xs mb-3 min-h-[60px]"
          />

          {/* Quick Action Chips */}
          <View className="flex-row flex-wrap gap-2 mb-3">
            {quickReasons.map((chip) => {
              const isSelected = reasonText === chip;
              return (
                <TouchableOpacity
                  key={chip}
                  onPress={() => handleReasonChipPress(chip)}
                  className={`px-3 py-1.5 rounded-full border ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-gray-100 border-gray-200 dark:bg-slate-800 dark:border-slate-700'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      isSelected ? 'text-white' : 'text-gray-700 dark:text-slate-300'
                    }`}
                  >
                    {chip}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Checkbox for apply to all remaining classes */}
          <Pressable
            onPress={handleToggleApplyToRemaining}
            className="flex-row items-center mb-4"
          >
            <View
              className={`w-5 h-5 rounded-md border items-center justify-center mr-2 ${
                applyToRemaining
                  ? 'bg-blue-600 border-blue-600'
                  : 'bg-white border-gray-300 dark:bg-slate-800 dark:border-slate-600'
              }`}
            >
              {applyToRemaining && (
                <Feather name="check" size={12} color="#ffffff" />
              )}
            </View>
            <Text className="text-xs font-medium text-gray-600 dark:text-slate-400 flex-1">
              Apply this status to all remaining classes today
            </Text>
          </Pressable>

          {/* Save Attendance Button */}
          <TouchableOpacity
            onPress={handleTriggerSave}
            disabled={isSaving}
            activeOpacity={0.8}
            className="bg-blue-600 py-4 rounded-2xl items-center justify-center shadow-md shadow-blue-500/20"
          >
            <Text className="text-white font-bold text-base">
              {isSaving ? 'Saving to Server...' : 'Save Attendance'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* EXPANDED SECTION FOR TEACHER ABSENT STATUS */}
      {lecture.status === 'teacher_absent' && (
        <View className="mt-2 pt-3 border-t border-gray-100 dark:border-slate-800">
          <View className="flex-row items-center bg-purple-50 dark:bg-purple-950/40 p-3 rounded-xl border border-purple-200 dark:border-purple-900 mb-3">
            <View className="w-6 h-6 rounded-full bg-purple-600 items-center justify-center mr-2.5">
              <Feather name="check" size={14} color="#ffffff" />
            </View>
            <Text className="text-xs font-bold text-purple-800 dark:text-purple-300">
              Class Cancelled by Instructor (Excluded from Denominator)
            </Text>
          </View>

          {/* Save Attendance Button */}
          <TouchableOpacity
            onPress={handleTriggerSave}
            disabled={isSaving}
            activeOpacity={0.8}
            className="bg-blue-600 py-4 rounded-2xl items-center justify-center shadow-md shadow-blue-500/20"
          >
            <Text className="text-white font-bold text-base">
              {isSaving ? 'Saving to Server...' : 'Save Attendance'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};
