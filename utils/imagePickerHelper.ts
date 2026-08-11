import * as ImagePicker from 'expo-image-picker';
import { Platform, Alert } from 'react-native';

export interface ImageResult {
  uri: string;
  base64?: string | null;
}

export const pickImageFromLibrary = async (): Promise<ImageResult | null> => {
  try {
    if (Platform.OS !== 'web') {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Permission to access media library is required!');
        return null;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      console.log('[IMAGE PICKER SUCCESS]', asset.uri);
      return {
        uri: asset.uri,
        base64: asset.base64 || null,
      };
    }
    return null;
  } catch (error: any) {
    console.error('[IMAGE PICKER ERROR]', error);
    Alert.alert('Image Picker Error', error?.message || 'Could not select image.');
    return null;
  }
};

export const takePhotoWithCamera = async (): Promise<ImageResult | null> => {
  try {
    if (Platform.OS !== 'web') {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Permission to access camera is required!');
        return null;
      }
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      console.log('[CAMERA SUCCESS]', asset.uri);
      return {
        uri: asset.uri,
        base64: asset.base64 || null,
      };
    }
    return null;
  } catch (error: any) {
    console.error('[CAMERA ERROR]', error);
    Alert.alert('Camera Error', error?.message || 'Could not take photo.');
    return null;
  }
};

export const uploadImageToStorage = async (
  uri: string,
  base64Data?: string | null
): Promise<string> => {
  console.log('[IMAGE UPLOAD] Uploading image via Cloudinary:', uri ? uri.substring(0, 40) : 'none');

  // Direct upload to Cloudinary
  try {
    const CLOUD_NAME = 'iyrlsdf1';
    const UPLOAD_PRESET = 'college_tracker';
    const formData = new FormData();

    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      formData.append('file', blob);
    } else if (base64Data) {
      const formattedBase64 = base64Data.startsWith('data:')
        ? base64Data
        : `data:image/jpeg;base64,${base64Data}`;
      formData.append('file', formattedBase64);
    } else if (uri) {
      formData.append('file', {
        uri,
        name: 'photo.jpg',
        type: 'image/jpeg',
      } as any);
    }

    formData.append('upload_preset', UPLOAD_PRESET);

    const cRes = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );
    const cData = await cRes.json();
    if (cData.secure_url) {
      console.log('[IMAGE UPLOAD SUCCESS] Cloudinary URL:', cData.secure_url);
      return cData.secure_url;
    } else if (cData.error) {
      console.warn('[IMAGE UPLOAD WARNING] Cloudinary error response:', cData.error);
    }
  } catch (cErr) {
    console.warn('[IMAGE UPLOAD WARNING] Cloudinary upload exception:', cErr);
  }

  // Fallback to Data URL or URI directly so preview works reliably
  if (base64Data) {
    return base64Data.startsWith('data:') ? base64Data : `data:image/jpeg;base64,${base64Data}`;
  }
  return uri;
};
