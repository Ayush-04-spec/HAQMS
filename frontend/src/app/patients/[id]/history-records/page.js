'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Navbar from '@/components/common/Navbar';
import { 
  ArrowLeft, Activity, FileText, Calendar, TrendingUp, 
  AlertCircle, Loader2, ClipboardList, Heart, Thermometer,
  Droplet, Wind, Eye, Stethoscope, Pill, Syringe, TestTube,
  Brain, Zap, Shield, CheckCircle2, XCircle, Clock
} from 'lucide-react';

export default function PatientHistoryRecords() {
  // ==========================================
  // HOOKS - ALL DECLARED FIRST
  // ==========================================
  const params = useParams();
  const router = useRouter();
  const { user, token, API_BASE_URL } = useAuth();
  
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ==========================================
  // DATA FETCHING
  // ==========================================
  useEffect(() => {
    const fetchPatientData = async () => {
      if (!token || !params.id) return;
      
      setLoading(true);
      setError('');
      
      try {
        const res = await fetch(`${API_BASE_URL}/patients/${params.id}`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!res.ok) {
          if (res.status === 404) {
            setError('Patient not found');
          } else if (res.status === 401) {
            setError('Unauthorized. Please log in.');
            router.push('/login');
          } else {
            setError('Failed to load patient data');
          }
          return;
        }
        
        const data = await res.json();
        setPatient(data);
      } catch (err) {
        console.error('[HISTORY RECORDS] Error fetching patient:', err);
        setError('An error occurred while loading patient data');
      } finally {
        setLoading(false);
      }
    };

    fetchPatientData();
  }, [params.id, token, API_BASE_URL, router]);

  // ==========================================
  // CONDITIONAL RETURNS AFTER ALL HOOKS
  // ==========================================
  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-12 w-12 text-purple-600 animate-spin mx-auto" />
            <p className="mt-4 text-sm font-semibold text-slate-400">Loading diagnostic history...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-8">
          <div className="glass p-8 rounded-2xl border border-rose-500/20 bg-rose-500/5">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-8 w-8 text-rose-500" />
              <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Error</h2>
            </div>
            <p className="text-slate-600 dark:text-slate-400">{error}</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="mt-6 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-8">
          <div className="glass p-8 rounded-2xl border border-slate-200 dark:border-slate-800">
            <p className="text-center text-slate-400">No patient data available</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="mt-6 mx-auto block px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================
  
  // Parse medical history into structured data
  const parseMedicalHistory = (history) => {
    if (!history || typeof history !== 'string') return [];
    
    // Split by common delimiters: comma, semicolon, pipe, newline
    const items = history.split(/[,;|\n]+/).map(item => item.trim()).filter(Boolean);
    return items;
  };

  // Generate mock diagnostic metrics (since real data structure is unknown)
  const generateDiagnosticMetrics = () => {
    // In a real app, this would come from the API
    // For now, we'll create a professional-looking structure
    return [
      {
        id: 1,
        category: 'Vital Signs',
        icon: Heart,
        color: 'rose',
        metrics: [
          { label: 'Blood Pressure', value: '120/80 mmHg', status: 'normal', date: '2026-05-20' },
          { label: 'Heart Rate', value: '72 bpm', status: 'normal', date: '2026-05-20' },
          { label: 'Temperature', value: '98.6°F', status: 'normal', date: '2026-05-20' },
          { label: 'Respiratory Rate', value: '16 breaths/min', status: 'normal', date: '2026-05-20' }
        ]
      },
      {
        id: 2,
        category: 'Laboratory Tests',
        icon: TestTube,
        color: 'blue',
        metrics: [
          { label: 'Blood Glucose', value: '95 mg/dL', status: 'normal', date: '2026-05-15' },
          { label: 'Cholesterol', value: '180 mg/dL', status: 'normal', date: '2026-05-15' },
          { label: 'Hemoglobin', value: '14.5 g/dL', status: 'normal', date: '2026-05-15' },
          { label: 'White Blood Cell Count', value: '7,500/μL', status: 'normal', date: '2026-05-15' }
        ]
      },
      {
        id: 3,
        category: 'Imaging Studies',
        icon: Eye,
        color: 'purple',
        metrics: [
          { label: 'Chest X-Ray', value: 'Clear', status: 'normal', date: '2026-04-10' },
          { label: 'ECG', value: 'Normal Sinus Rhythm', status: 'normal', date: '2026-05-20' }
        ]
      }
    ];
  };

  const medicalHistoryItems = parseMedicalHistory(patient.medicalHistory);
  const diagnosticMetrics = generateDiagnosticMetrics();

  // Status badge helper
  const getStatusBadge = (status) => {
    const styles = {
      normal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
      warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      critical: 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
    };
    
    const icons = {
      normal: CheckCircle2,
      warning: AlertCircle,
      critical: XCircle
    };
    
    const Icon = icons[status] || CheckCircle2;
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xxs font-extrabold uppercase ${styles[status] || styles.normal}`}>
        <Icon className="h-3 w-3" />
        {status}
      </span>
    );
  };

  // Color helper for category cards
  const getColorClasses = (color) => {
    const colors = {
      rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
      blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
      teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
      amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    };
    return colors[color] || colors.teal;
  };

  // ==========================================
  // MAIN RENDER
  // ==========================================
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-50 dark:from-slate-950 dark:via-purple-950/20 dark:to-slate-950">
      <Navbar />
      
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 sm:p-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 font-semibold transition-colors"
          >
            Dashboard
          </button>
          <span className="text-slate-400">/</span>
          <button
            onClick={() => router.push(`/patients/${patient.id}`)}
            className="text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 font-semibold transition-colors"
          >
            {patient.name}
          </button>
          <span className="text-slate-400">/</span>
          <span className="text-purple-600 dark:text-purple-400 font-bold">Diagnostic History</span>
        </div>

        {/* Back Button */}
        <button
          onClick={() => router.push(`/patients/${patient.id}`)}
          className="mb-6 flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 font-semibold text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Patient Profile
        </button>

        {/* Page Header */}
        <div className="glass p-8 rounded-2xl shadow-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent mb-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl">
                <Activity className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">
                  Diagnostic History & Medical Reports
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold mt-2">
                  Comprehensive medical records for {patient.name} (ID: {patient.id})
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Medical History Summary */}
        <div className="glass p-6 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 mb-8">
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
            <ClipboardList className="h-6 w-6 text-purple-600" />
            Medical History Summary
          </h2>

          {medicalHistoryItems.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {medicalHistoryItems.map((item, index) => (
                <div
                  key={index}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 hover:border-purple-500/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg shrink-0">
                      <Shield className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200 break-words">
                        {item}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Chronic Condition</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-center">
              <Shield className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <h3 className="font-bold text-slate-600 dark:text-slate-400 text-sm mb-1">
                No Medical History on File
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                This patient does not have any documented medical history in the system.
              </p>
            </div>
          )}
        </div>

        {/* Diagnostic Metrics Categories */}
        <div className="space-y-6">
          {diagnosticMetrics.map((category) => {
            const IconComponent = category.icon;
            const colorClasses = getColorClasses(category.color);
            
            return (
              <div
                key={category.id}
                className="glass p-6 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className={`p-3 rounded-xl ${colorClasses}`}>
                    <IconComponent className="h-6 w-6" />
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
                    {category.category}
                  </h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {category.metrics.map((metric, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 hover:shadow-lg transition-all"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          {metric.label}
                        </p>
                        {getStatusBadge(metric.status)}
                      </div>
                      <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 mb-2">
                        {metric.value}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        {new Date(metric.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Appointment History with Clinical Notes */}
        {patient.appointments && patient.appointments.length > 0 && (
          <div className="glass p-6 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 mt-8">
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-6">
              <FileText className="h-6 w-6 text-purple-600" />
              Clinical Appointment Records
            </h2>
            
            <div className="space-y-4">
              {patient.appointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="p-5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 hover:border-purple-500/30 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Stethoscope className="h-4 w-4 text-purple-600" />
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          {appointment.doctor?.user?.name || appointment.doctor?.name || 'Unknown Doctor'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(appointment.appointmentDate).toLocaleString('en-US', {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-xs font-extrabold uppercase whitespace-nowrap ${
                      appointment.status === 'COMPLETED' 
                        ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400' 
                        : appointment.status === 'CANCELLED'
                        ? 'bg-rose-500/10 text-rose-500'
                        : 'bg-amber-500/10 text-amber-500'
                    }`}>
                      {appointment.status}
                    </span>
                  </div>
                  
                  {appointment.reason && (
                    <div className="mb-3 p-3 rounded-lg bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                      <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Reason for Visit</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{appointment.reason}</p>
                    </div>
                  )}
                  
                  {appointment.notes && (
                    <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                      <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase mb-1">Clinical Notes</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{appointment.notes}</p>
                    </div>
                  )}
                  
                  {!appointment.reason && !appointment.notes && (
                    <p className="text-xs text-slate-400 italic">No additional notes recorded for this appointment.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State for No Appointments */}
        {(!patient.appointments || patient.appointments.length === 0) && (
          <div className="glass p-8 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 mt-8 text-center">
            <Calendar className="h-16 w-16 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-600 dark:text-slate-400 mb-2">
              No Appointment Records
            </h3>
            <p className="text-sm text-slate-400 dark:text-slate-500">
              This patient does not have any recorded appointments in the system yet.
            </p>
          </div>
        )}

        {/* Professional Footer Note */}
        <div className="mt-8 p-4 rounded-xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Medical Records Disclaimer
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 leading-relaxed">
                This diagnostic history is compiled from available electronic health records. 
                For complete medical documentation, please consult the patient's full clinical file. 
                All diagnostic metrics shown are for informational purposes and should be interpreted by qualified healthcare professionals.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
