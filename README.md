# UNI-D (Uni Daily) 🎓

A modern, responsive, and cross-platform College Attendance & Schedule Tracker web and mobile application built with **React Native**, **Expo Router**, **TypeScript**, and **Supabase**.

---

## 🌟 Key Features

- **🗓️ Dynamic Timetable Management:** Interactively manage weekly class slots, lecture times, rooms, and instructor details. Dynamically highlights the current system day.
- **✅ Smart Attendance Tracking:** Mark daily class statuses (`Present`, `Absent`, `Bunk`, `Teacher Off`) filtered strictly by today's day of week with blackboard photo attachment support.
- **📊 Advanced Analytics & Risk Analysis:** View attendance percentage trends and subject-wise risk analysis to stay above the 75% attendance threshold.
- **📥 Multi-Format Data Exports:** Export study logs and attendance data into PDF documents, Word (`.docx`), CSV spreadsheets (`.csv`), or raw JSON snapshots (`.json`).
- **🔒 Strict Security & Auth Guards:** Route-level authentication guards via Supabase Auth preventing unauthorized access to protected tab routes after logging out.
- **📱 Responsive Cross-Platform UI:** Designed with NativeWind/Tailwind CSS with fixed sidebar web layouts and mobile-optimized bottom navigation.

---

## 🛠️ Tech Stack

- **Framework:** React Native / Expo (v57) with Expo Router (File-based Routing)
- **Language:** TypeScript
- **Styling:** NativeWind / Tailwind CSS & Vanilla CSS
- **Database & Auth:** Supabase (PostgreSQL, Row Level Security, Auth Services)
- **Deployment:** Vercel (Web SPA Deployment)

---

## 🚀 Local Development Setup

### 1. Prerequisites
- Node.js (v18+)
- npm or yarn

### 2. Installation
```bash
git clone https://github.com/AyushDheerajPatel/uni-d.git
cd college-tracker
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Run Locally
```bash
# Web development server
npm run web

# Expo Go / Mobile
npm run start
```

---

## 🌐 Web Deployment (Vercel)

### Web Build Test
```bash
npm run build:web
```
The static web bundle will be exported to the `dist/` directory.

### Deploying to Vercel
1. Import the repository on [Vercel](https://vercel.com).
2. Ensure Vercel uses the root [`vercel.json`](./vercel.json):
   - **Build Command:** `npm run build:web`
   - **Output Directory:** `dist`
   - **Environment Variables:** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy!

---

## 📄 License
MIT License. Created for students to manage academic schedules seamlessly.
