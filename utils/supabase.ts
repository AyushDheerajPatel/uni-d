import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Replace with your actual Supabase URL and Anon Key or set environment variables
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://wxuhiuvwinlhkjxelqvc.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4dWhpdXZ3aW5saGtqeGVscXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMjIxMDYsImV4cCI6MjEwMTY5ODEwNn0.zeEbjXwacUKVhopRz1w4R6c4TN7Yzo6aV4wtR_VZo4M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
