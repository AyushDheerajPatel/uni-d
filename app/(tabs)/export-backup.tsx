import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../utils/supabase';

interface AttendanceLog {
  id?: string;
  user_id?: string;
  subject: string;
  status: string;
  date: string;
  notes?: string;
  mediaUrls?: string[];
  photo_url?: string;
  image_url?: string;
}

interface SubjectExportSummary {
  name: string;
  notesCount: number;
  photosCount: number;
  logs: AttendanceLog[];
  photos: { url: string; date: string; notes?: string }[];
}

export default function ExportBackupScreen() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<string>('');

  // Format Selection Modal State
  const [exportModalVisible, setExportModalVisible] = useState<boolean>(false);
  const [exportSubjectTarget, setExportSubjectTarget] = useState<string>('ALL');
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'docx' | 'csv' | 'json'>('pdf');

  // 1. Fetch User Data from Supabase sorted chronologically by date
  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLogs([]);
        return;
      }

      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: true });

      if (error) {
        console.error('[SUPABASE EXPORT FETCH ERROR]', error.message);
      } else if (data) {
        console.log('[SUPABASE EXPORT FETCH SUCCESS] Total logs:', data.length);
        setLogs(data);
      }
    } catch (err) {
      console.error('[SUPABASE EXPORT EXCEPTION]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  // Aggregate subjects summary
  const subjectSummaries: Record<string, SubjectExportSummary> = (() => {
    const map: Record<string, SubjectExportSummary> = {};

    logs.forEach((log) => {
      const subj = log.subject || 'General';
      if (!map[subj]) {
        map[subj] = {
          name: subj,
          notesCount: 0,
          photosCount: 0,
          logs: [],
          photos: [],
        };
      }

      map[subj].logs.push(log);
      if (log.notes && log.notes.trim()) {
        map[subj].notesCount += 1;
      }

      // Collect photo links
      const extractedPhotos: string[] = [];

      if (log.photo_url && typeof log.photo_url === 'string' && log.photo_url.startsWith('http')) {
        extractedPhotos.push(log.photo_url);
      }
      if (Array.isArray(log.mediaUrls)) {
        log.mediaUrls.forEach((u) => {
          if (typeof u === 'string' && u.startsWith('http')) extractedPhotos.push(u);
        });
      }
      if (log.image_url && typeof log.image_url === 'string' && log.image_url.startsWith('http')) {
        extractedPhotos.push(log.image_url);
      }

      const allText = `${log.notes || ''} ${(log as any).topicTaught || ''} ${JSON.stringify(log)}`;
      const urlMatches = allText.match(/(https?:\/\/[^\s"'<>]+)/gi);
      if (urlMatches) {
        urlMatches.forEach((urlStr) => {
          const cleanUrl = urlStr.trim().replace(/[.,;)]+$/, '');
          if (
            cleanUrl.includes('cloudinary') ||
            cleanUrl.includes('supabase') ||
            cleanUrl.includes('res.cloudinary.com') ||
            /\.(jpg|jpeg|png|webp|gif)/i.test(cleanUrl)
          ) {
            extractedPhotos.push(cleanUrl);
          }
        });
      }

      const uniquePhotos = Array.from(new Set(extractedPhotos));
      uniquePhotos.forEach((url) => {
        map[subj].photos.push({
          url,
          date: log.date || 'date',
          notes: log.notes || '',
        });
      });

      map[subj].photosCount += uniquePhotos.length;
    });

    return map;
  })();

  const subjectList = Object.keys(subjectSummaries);

  // Trigger file download helper
  const triggerDownload = (blob: Blob, fileName: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  };

  const openExportModal = (targetSubject: string = 'ALL') => {
    setExportSubjectTarget(targetSubject);
    setSelectedFormat('pdf');
    setExportModalVisible(true);
  };

  // 2. Generate PDF Report Handler
  const handleExportPdf = (docTitle: string, targetLogs: AttendanceLog[]) => {
    const dateGrouped: Record<string, AttendanceLog[]> = {};
    targetLogs.forEach((log) => {
      const d = log.date || 'Unscheduled';
      if (!dateGrouped[d]) dateGrouped[d] = [];
      dateGrouped[d].push(log);
    });

    const sortedDates = Object.keys(dateGrouped).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    let bodyHtml = `
      <div style="padding: 24px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1E293B;">
        <h1 style="color: #4F46E5; font-size: 26px; font-weight: 800; margin-bottom: 4px;">
          ${docTitle}
        </h1>
        <p style="color: #64748B; font-size: 13px; margin-bottom: 24px;">
          Chronological Study Report & Academic Log • Generated on ${new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
        <hr style="border: none; border-top: 2px solid #6366F1; margin-bottom: 24px;" />
    `;

    sortedDates.forEach((dateStr) => {
      const logsForDate = dateGrouped[dateStr];
      let displayDate = dateStr;
      try {
        displayDate = new Date(dateStr).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } catch (e) {
        displayDate = dateStr;
      }

      bodyHtml += `
        <div style="background-color: #F1F5F9; border-left: 5px solid #4F46E5; padding: 10px 16px; margin-top: 24px; margin-bottom: 16px; border-radius: 4px; page-break-inside: avoid;">
          <h2 style="color: #0F172A; font-size: 16px; margin: 0; font-weight: 700;">
            📅 ${displayDate} (${dateStr})
          </h2>
        </div>
      `;

      logsForDate.forEach((log) => {
        const statusUpper = (log.status || 'PRESENT').toUpperCase();
        let badgeBg = '#DCFCE7';
        let badgeColor = '#166534';
        if (statusUpper === 'ABSENT') {
          badgeBg = '#FEE2E2';
          badgeColor = '#991B1B';
        } else if (statusUpper === 'BUNK') {
          badgeBg = '#FEF3C7';
          badgeColor = '#92400E';
        } else if (statusUpper === 'TEACHER_OFF') {
          badgeBg = '#E0E7FF';
          badgeColor = '#3730A3';
        }

        const photos: string[] = [];
        if (log.photo_url && typeof log.photo_url === 'string' && log.photo_url.startsWith('http')) {
          photos.push(log.photo_url);
        }
        if (Array.isArray(log.mediaUrls)) {
          log.mediaUrls.forEach((u) => {
            if (typeof u === 'string' && u.startsWith('http')) photos.push(u);
          });
        }
        if (log.image_url && typeof log.image_url === 'string' && log.image_url.startsWith('http')) {
          photos.push(log.image_url);
        }

        const logText = `${log.notes || ''} ${(log as any).topicTaught || ''} ${JSON.stringify(log)}`;
        const urlMatches = logText.match(/(https?:\/\/[^\s"'<>]+)/gi);
        if (urlMatches) {
          urlMatches.forEach((u) => {
            if (u.includes('cloudinary') || u.includes('supabase') || /\.(jpg|jpeg|png|webp|gif)/i.test(u)) {
              photos.push(u.replace(/[.,;)]+$/, ''));
            }
          });
        }

        const uniquePhotos = Array.from(new Set(photos));
        const cleanNotes = log.notes
          ? log.notes
              .replace(/Photo:\s*https?:\/\/[^\s]+/gi, '')
              .replace(/https?:\/\/[^\s]+/gi, '')
              .trim() || 'Class session logged'
          : 'No additional notes provided';

        bodyHtml += `
          <div style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 16px; background-color: #FFFFFF; page-break-inside: avoid;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 15px; font-weight: 700; color: #1E293B;">
                ${log.subject || 'Subject'}
              </span>
              <span style="background-color: ${badgeBg}; color: ${badgeColor}; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 12px; text-transform: uppercase;">
                ${statusUpper}
              </span>
            </div>

            <p style="font-size: 13px; color: #334155; margin-top: 4px; margin-bottom: 8px; line-height: 1.5;">
              <strong>Topic & Notes:</strong> ${cleanNotes}
            </p>
        `;

        if (uniquePhotos.length > 0) {
          bodyHtml += `
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #E2E8F0;">
              <p style="font-size: 12px; font-weight: 700; color: #4F46E5; margin-bottom: 8px;">
                📸 Attached Blackboard & Study Photos (${uniquePhotos.length}):
              </p>
          `;
          uniquePhotos.forEach((imgUrl, pIdx) => {
            bodyHtml += `
              <div style="margin-bottom: 12px;">
                <img src="${imgUrl}" alt="Study Photo ${pIdx + 1}" style="max-width: 500px; width: 100%; height: auto; border-radius: 8px; border: 1px solid #CBD5E1; display: block;" />
              </div>
            `;
          });
          bodyHtml += `</div>`;
        }

        bodyHtml += `</div>`;
      });
    });

    bodyHtml += `</div>`;

    const fullPdfHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${docTitle}</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .no-print { display: none !important; }
            }
            body { font-family: 'Segoe UI', system-ui, sans-serif; background-color: #FFFFFF; }
          </style>
        </head>
        <body>
          ${bodyHtml}
        </body>
      </html>
    `;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.open();
        printWin.document.write(fullPdfHtml);
        printWin.document.close();
        setTimeout(() => {
          printWin.focus();
          printWin.print();
        }, 500);
      } else {
        const pdfBlob = new Blob([fullPdfHtml], { type: 'text/html;charset=utf-8' });
        triggerDownload(pdfBlob, `${docTitle.replace(/[^a-zA-Z0-9]/g, '_')}_Report.html`);
      }
    }
  };

  // 3. Generate Word Document (.docx) Blob
  const generateDocxBlob = (docTitle: string, targetLogs: AttendanceLog[]) => {
    const dateGrouped: Record<string, AttendanceLog[]> = {};
    targetLogs.forEach((log) => {
      const d = log.date || 'Unscheduled';
      if (!dateGrouped[d]) dateGrouped[d] = [];
      dateGrouped[d].push(log);
    });

    const sortedDates = Object.keys(dateGrouped).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    let bodyHtml = `
      <h1 style="color: #4F46E5; font-family: Arial, sans-serif; font-size: 24pt; margin-bottom: 4pt; font-weight: bold;">
        ${docTitle}
      </h1>
      <p style="color: #64748B; font-family: Arial, sans-serif; font-size: 10pt; margin-bottom: 20pt;">
        Chronological Study Report & Academic Log • Generated on ${new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </p>
      <hr style="border: none; border-top: 2px solid #6366F1; margin-bottom: 20pt;" />
    `;

    sortedDates.forEach((dateStr) => {
      const logsForDate = dateGrouped[dateStr];
      let displayDate = dateStr;
      try {
        displayDate = new Date(dateStr).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } catch (e) {
        displayDate = dateStr;
      }

      bodyHtml += `
        <div style="background-color: #F1F5F9; border-left: 5px solid #4F46E5; padding: 8pt 12pt; margin-top: 20pt; margin-bottom: 12pt;">
          <h2 style="color: #0F172A; font-family: Arial, sans-serif; font-size: 13pt; margin: 0; font-weight: bold;">
            📅 ${displayDate} (${dateStr})
          </h2>
        </div>
      `;

      logsForDate.forEach((log) => {
        const statusUpper = (log.status || 'PRESENT').toUpperCase();
        let badgeBg = '#DCFCE7';
        let badgeColor = '#166534';
        if (statusUpper === 'ABSENT') {
          badgeBg = '#FEE2E2';
          badgeColor = '#991B1B';
        } else if (statusUpper === 'BUNK') {
          badgeBg = '#FEF3C7';
          badgeColor = '#92400E';
        } else if (statusUpper === 'TEACHER_OFF') {
          badgeBg = '#E0E7FF';
          badgeColor = '#3730A3';
        }

        const photos: string[] = [];
        if (log.photo_url && typeof log.photo_url === 'string' && log.photo_url.startsWith('http')) {
          photos.push(log.photo_url);
        }
        if (Array.isArray(log.mediaUrls)) {
          log.mediaUrls.forEach((u) => {
            if (typeof u === 'string' && u.startsWith('http')) photos.push(u);
          });
        }
        if (log.image_url && typeof log.image_url === 'string' && log.image_url.startsWith('http')) {
          photos.push(log.image_url);
        }

        const logText = `${log.notes || ''} ${(log as any).topicTaught || ''} ${JSON.stringify(log)}`;
        const urlMatches = logText.match(/(https?:\/\/[^\s"'<>]+)/gi);
        if (urlMatches) {
          urlMatches.forEach((u) => {
            if (u.includes('cloudinary') || u.includes('supabase') || /\.(jpg|jpeg|png|webp|gif)/i.test(u)) {
              photos.push(u.replace(/[.,;)]+$/, ''));
            }
          });
        }

        const uniquePhotos = Array.from(new Set(photos));
        const cleanNotes = log.notes
          ? log.notes
              .replace(/Photo:\s*https?:\/\/[^\s]+/gi, '')
              .replace(/https?:\/\/[^\s]+/gi, '')
              .trim() || 'Class session logged'
          : 'No additional notes provided';

        bodyHtml += `
          <div style="border: 1px solid #CBD5E1; border-radius: 6pt; padding: 12pt; margin-bottom: 12pt; background-color: #FFFFFF;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 8pt;">
              <tr>
                <td style="font-family: Arial, sans-serif; font-size: 12pt; font-weight: bold; color: #1E293B;">
                  ${log.subject || 'Subject'}
                </td>
                <td style="text-align: right;">
                  <span style="background-color: ${badgeBg}; color: ${badgeColor}; font-family: Arial, sans-serif; font-size: 9pt; font-weight: bold; padding: 3pt 8pt; border-radius: 10pt; text-transform: uppercase;">
                    ${statusUpper}
                  </span>
                </td>
              </tr>
            </table>

            <p style="font-family: Arial, sans-serif; font-size: 10pt; color: #334155; margin-top: 4pt; margin-bottom: 8pt; line-height: 1.4;">
              <strong>Topic & Notes:</strong> ${cleanNotes}
            </p>
        `;

        if (uniquePhotos.length > 0) {
          bodyHtml += `
            <div style="margin-top: 10pt; padding-top: 8pt; border-top: 1px dashed #E2E8F0;">
              <p style="font-family: Arial, sans-serif; font-size: 9.5pt; font-weight: bold; color: #4F46E5; margin-bottom: 6pt;">
                📸 Attached Blackboard & Study Photos (${uniquePhotos.length}):
              </p>
          `;
          uniquePhotos.forEach((imgUrl, pIdx) => {
            bodyHtml += `
              <div style="margin-bottom: 10pt;">
                <img src="${imgUrl}" alt="Study Photo ${pIdx + 1}" style="max-width: 480px; width: 100%; height: auto; border-radius: 6pt; border: 1px solid #94A3B8; display: block;" />
              </div>
            `;
          });
          bodyHtml += `</div>`;
        }

        bodyHtml += `</div>`;
      });
    });

    const fullHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>${docTitle}</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          <style>
            body { font-family: 'Arial', sans-serif; padding: 24pt; background-color: #FFFFFF; }
          </style>
        </head>
        <body>
          ${bodyHtml}
        </body>
      </html>
    `;

    return new Blob(['\ufeff', fullHtml], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  };

  // Confirm Export from Modal
  const handleConfirmExport = async () => {
    setIsDownloading(true);
    setDownloadProgress(`Preparing ${selectedFormat.toUpperCase()} report...`);

    try {
      let docLogs = logs;
      let title = 'Complete Study Report & Attendance Backup';
      let fileName = 'College_Tracker_Study_Report';

      if (exportSubjectTarget && exportSubjectTarget !== 'ALL') {
        docLogs = logs.filter((l) => l.subject === exportSubjectTarget);
        title = `${exportSubjectTarget} - Study Report & Attendance Backup`;
        fileName = `${exportSubjectTarget.replace(/[^a-zA-Z0-9]/g, '_')}_Study_Report`;
      }

      if (docLogs.length === 0) {
        const msg = `No records available for ${exportSubjectTarget === 'ALL' ? 'export' : exportSubjectTarget}.`;
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
          window.alert(msg);
        } else {
          Alert.alert('Notice', msg);
        }
        setIsDownloading(false);
        return;
      }

      if (selectedFormat === 'pdf') {
        handleExportPdf(title, docLogs);
      } else if (selectedFormat === 'csv') {
        const header = 'Subject,Status,Date,Notes\n';
        const rows = docLogs
          .map(
            (l) =>
              `"${(l.subject || '').replace(/"/g, '""')}","${(l.status || '').replace(
                /"/g,
                '""'
              )}","${l.date || ''}","${(l.notes || '').replace(/"/g, '""')}"`
          )
          .join('\n');
        const csvBlob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
        triggerDownload(csvBlob, `${fileName}.csv`);
      } else if (selectedFormat === 'json') {
        const jsonBlob = new Blob([JSON.stringify(docLogs, null, 2)], {
          type: 'application/json;charset=utf-8;',
        });
        triggerDownload(jsonBlob, `${fileName}.json`);
      } else {
        const docxBlob = generateDocxBlob(title, docLogs);
        triggerDownload(docxBlob, `${fileName}.docx`);
      }

      setExportModalVisible(false);
    } catch (err: any) {
      console.error('[EXPORT ERROR]', err);
    } finally {
      setIsDownloading(false);
      setDownloadProgress('');
    }
  };

  const dotColors = [
    'bg-indigo-400',
    'bg-cyan-400',
    'bg-amber-400',
    'bg-pink-400',
    'bg-emerald-400',
  ];

  return (
    <ScrollView className="flex-1 bg-[#F4F7FE] p-8" showsVerticalScrollIndicator={true}>
      {/* Page Header */}
      <Text className="text-4xl font-serif font-bold text-slate-800 mb-1">
        Export / Backup
      </Text>
      <Text className="text-slate-500 text-sm font-medium mb-8">
        Export structured PDF or Word (.docx) documents with date-wise notes and blackboard photos.
      </Text>

      {/* Top Section: Download Full Study Report */}
      <View className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8 max-w-4xl">
        <Text className="text-lg font-bold text-slate-800 mb-2">
          Download Complete Study Report
        </Text>
        <Text className="text-slate-500 text-xs font-medium mb-6">
          Generates a structured document containing all date-wise sessions, topic notes, status badges, and embedded blackboard photos.
        </Text>

        {/* Main "Download Study Report" Button */}
        <TouchableOpacity
          onPress={() => openExportModal('ALL')}
          disabled={isDownloading || loading}
          activeOpacity={0.8}
          className="bg-indigo-600 px-6 py-4 rounded-xl flex-row items-center justify-center shadow-sm"
        >
          {isDownloading ? (
            <View className="flex-row items-center">
              <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
              <Text className="text-white font-bold text-sm">
                {downloadProgress || 'Generating Report...'}
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center">
              <Feather name="download-cloud" size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text className="text-white font-bold text-base">
                Download Study Report (PDF / DOCX)
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Subject-wise Notes & Media Cards */}
      <Text className="text-2xl font-serif font-bold text-slate-800 mb-2">
        Subject-wise Study Reports
      </Text>
      <Text className="text-slate-500 text-sm mb-6">
        Generate chronological PDF or Word documents for individual subjects.
      </Text>

      {/* Subject Export Cards List */}
      <View className="max-w-4xl">
        {loading ? (
          <View className="bg-white p-12 rounded-2xl items-center justify-center shadow-sm border border-slate-100">
            <ActivityIndicator size="large" color="#6366F1" />
            <Text className="text-xs text-slate-500 font-semibold mt-3">
              Loading backup records from Supabase...
            </Text>
          </View>
        ) : subjectList.length === 0 ? (
          <View className="bg-white p-12 rounded-2xl items-center justify-center shadow-sm border border-slate-100">
            <Text className="text-3xl mb-2">📄</Text>
            <Text className="text-slate-700 font-bold text-base">
              No attendance & note records found
            </Text>
            <Text className="text-slate-400 text-xs mt-1 text-center">
              Logged class topics and blackboard photos will appear here for report export.
            </Text>
          </View>
        ) : (
          subjectList.map((subjName, idx) => {
            const summary = subjectSummaries[subjName];
            const dotColor = dotColors[idx % dotColors.length];

            return (
              <View
                key={subjName}
                className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex-row justify-between items-center mb-4"
              >
                {/* Card Left Area */}
                <View className="flex-row items-center flex-1 pr-4">
                  <View className={`w-3 h-3 rounded-full ${dotColor} mr-4`} />
                  <View>
                    <Text className="text-lg font-bold text-slate-800">{summary.name}</Text>
                    <Text className="text-slate-400 text-sm mt-1 font-medium">
                      {summary.logs.length} Log Entries • {summary.notesCount} Topic Notes • {summary.photosCount} Photos
                    </Text>
                  </View>
                </View>

                {/* Card Action Button */}
                <TouchableOpacity
                  onPress={() => openExportModal(summary.name)}
                  disabled={isDownloading}
                  activeOpacity={0.8}
                  className="bg-indigo-50 hover:bg-indigo-100 px-5 py-2.5 rounded-xl border border-indigo-100 flex-row items-center"
                >
                  <Feather name="download" size={15} color="#4F46E5" style={{ marginRight: 6 }} />
                  <Text className="text-indigo-600 font-bold text-sm">Download Backup</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>

      {/* Format Selection Modal */}
      <Modal
        visible={exportModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setExportModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setExportModalVisible(false)}
          className="flex-1 justify-center items-center bg-black/60 p-4"
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl border border-slate-100"
          >
            <View className="flex-row justify-between items-center mb-4">
              <View>
                <Text className="text-xl font-bold text-slate-800">Choose Export Format</Text>
                <Text className="text-xs text-slate-500 font-medium mt-0.5">
                  Exporting: {exportSubjectTarget === 'ALL' ? 'All Subjects Report' : exportSubjectTarget}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setExportModalVisible(false)} className="p-1">
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Option 1: PDF Document */}
            <TouchableOpacity
              onPress={() => setSelectedFormat('pdf')}
              className={`p-4 rounded-xl border mb-3 flex-row items-center justify-between ${
                selectedFormat === 'pdf'
                  ? 'bg-indigo-50 border-indigo-500'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <View className="flex-row items-center flex-1 pr-2">
                <View className="w-10 h-10 rounded-xl bg-rose-100 items-center justify-center mr-3">
                  <Feather name="file-text" size={20} color="#E11D48" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-800">PDF Document (.pdf)</Text>
                  <Text className="text-xs text-slate-500">
                    Printable PDF report formatted with date-wise notes & photos.
                  </Text>
                </View>
              </View>
              <View
                className={`w-5 h-5 rounded-full border items-center justify-center ${
                  selectedFormat === 'pdf'
                    ? 'border-indigo-600 bg-indigo-600'
                    : 'border-slate-300'
                }`}
              >
                {selectedFormat === 'pdf' && (
                  <View className="w-2 h-2 rounded-full bg-white" />
                )}
              </View>
            </TouchableOpacity>

            {/* Option 2: DOCX Word Document */}
            <TouchableOpacity
              onPress={() => setSelectedFormat('docx')}
              className={`p-4 rounded-xl border mb-3 flex-row items-center justify-between ${
                selectedFormat === 'docx'
                  ? 'bg-indigo-50 border-indigo-500'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <View className="flex-row items-center flex-1 pr-2">
                <View className="w-10 h-10 rounded-xl bg-blue-100 items-center justify-center mr-3">
                  <Feather name="file" size={20} color="#2563EB" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-800">Word Document (.docx)</Text>
                  <Text className="text-xs text-slate-500">
                    Editable Microsoft Word file with styled tables & embedded photos.
                  </Text>
                </View>
              </View>
              <View
                className={`w-5 h-5 rounded-full border items-center justify-center ${
                  selectedFormat === 'docx'
                    ? 'border-indigo-600 bg-indigo-600'
                    : 'border-slate-300'
                }`}
              >
                {selectedFormat === 'docx' && (
                  <View className="w-2 h-2 rounded-full bg-white" />
                )}
              </View>
            </TouchableOpacity>

            {/* Option 3: CSV Spreadsheet */}
            <TouchableOpacity
              onPress={() => setSelectedFormat('csv')}
              className={`p-4 rounded-xl border mb-3 flex-row items-center justify-between ${
                selectedFormat === 'csv'
                  ? 'bg-indigo-50 border-indigo-500'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <View className="flex-row items-center flex-1 pr-2">
                <View className="w-10 h-10 rounded-xl bg-emerald-100 items-center justify-center mr-3">
                  <Feather name="grid" size={20} color="#059669" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-800">CSV Spreadsheet (.csv)</Text>
                  <Text className="text-xs text-slate-500">
                    Raw tabular data compatible with Microsoft Excel & Google Sheets.
                  </Text>
                </View>
              </View>
              <View
                className={`w-5 h-5 rounded-full border items-center justify-center ${
                  selectedFormat === 'csv'
                    ? 'border-indigo-600 bg-indigo-600'
                    : 'border-slate-300'
                }`}
              >
                {selectedFormat === 'csv' && (
                  <View className="w-2 h-2 rounded-full bg-white" />
                )}
              </View>
            </TouchableOpacity>

            {/* Option 4: JSON Backup */}
            <TouchableOpacity
              onPress={() => setSelectedFormat('json')}
              className={`p-4 rounded-xl border mb-6 flex-row items-center justify-between ${
                selectedFormat === 'json'
                  ? 'bg-indigo-50 border-indigo-500'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <View className="flex-row items-center flex-1 pr-2">
                <View className="w-10 h-10 rounded-xl bg-amber-100 items-center justify-center mr-3">
                  <Feather name="code" size={20} color="#D97706" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-800">JSON Data Backup (.json)</Text>
                  <Text className="text-xs text-slate-500">
                    Complete raw database snapshot for developer & data migration use.
                  </Text>
                </View>
              </View>
              <View
                className={`w-5 h-5 rounded-full border items-center justify-center ${
                  selectedFormat === 'json'
                    ? 'border-indigo-600 bg-indigo-600'
                    : 'border-slate-300'
                }`}
              >
                {selectedFormat === 'json' && (
                  <View className="w-2 h-2 rounded-full bg-white" />
                )}
              </View>
            </TouchableOpacity>

            {/* Action Buttons */}
            <View className="flex-row justify-end space-x-3 gap-3">
              <TouchableOpacity
                onPress={() => setExportModalVisible(false)}
                className="px-5 py-3 rounded-xl bg-slate-100"
              >
                <Text className="text-slate-600 font-bold text-sm">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirmExport}
                disabled={isDownloading}
                className="px-6 py-3 rounded-xl bg-indigo-600 flex-row items-center"
              >
                {isDownloading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-white font-bold text-sm">Export Report</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}
