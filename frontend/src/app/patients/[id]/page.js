'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Navbar from '@/components/common/Navbar';
import { 
  User, Phone, Mail, Calendar, Activity, FileText, 
  ArrowLeft, ShieldAlert, AlertCircle, Loader2
} from 'lucide-react';

export default function PatientProfile() {
  // Hooks must be called before any conditional returns
  const params = useParams();
  const router = useRouter();
  const { user, token, API_BASE_URL } = useAuth();
  
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch patient data
  useEffect(() => {
    const fetchPatient = async () => {
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
        console.error('Error fetching patient:', err);
        setError('An error occurred while loading patient data');
      } finally {
        setLoading(false);
      }
    };

    fetchPatient();
  }, [params.id, token, API_BASE_URL, router]);

  // Conditional returns after all hooks
  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-12 w-12 text-teal-600 animate-spin mx-auto" />
            <p className="mt-4 text-sm font-semibold text-slate-400">Loading patient profile...</p>
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

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 sm:p-8">
        {/* Back Button */}
        <button
          onClick={() => router.push('/dashboard')}
          className="mb-6 flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 font-semibold text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        {/* Patient Header Card */}
        <div className="glass p-8 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 mb-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-xl">
                <User className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">
                  {patient.name}
                </h1>
                <p className="text-sm text-slate-400 dark:text-slate-500 font-semibold mt-1">
                  Patient ID: {patient.id}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Patient Details Grid */}
        <div className="grid gap-6 md:grid-cols-2 mb-8">
          {/* Contact Information */}
          <div className="glass p-6 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
              <Phone className="h-5 w-5 text-teal-600" />
              Contact Information
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-slate-400 font-semibold block mb-1">Phone Number</span>
                <span className="text-slate-800 dark:text-slate-200 font-bold">{patient.phone || patient.phoneNumber || 'Not provided'}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block mb-1">Email Address</span>
                <span className="text-slate-800 dark:text-slate-200 font-bold">{patient.email || 'Not provided'}</span>
              </div>
              {patient.address && (
                <div>
                  <span className="text-slate-400 font-semibold block mb-1">Address</span>
                  <span className="text-slate-800 dark:text-slate-200 font-bold">{patient.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Personal Information */}
          <div className="glass p-6 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
              <Calendar className="h-5 w-5 text-teal-600" />
              Personal Information
            </h3>
            <div className="space-y-3 text-sm">
              {patient.age && (
                <div>
                  <span className="text-slate-400 font-semibold block mb-1">Age</span>
                  <span className="text-slate-800 dark:text-slate-200 font-bold">{patient.age} years</span>
                </div>
              )}
              {patient.dateOfBirth && (
                <div>
                  <span className="text-slate-400 font-semibold block mb-1">Date of Birth</span>
                  <span className="text-slate-800 dark:text-slate-200 font-bold">
                    {new Date(patient.dateOfBirth).toLocaleDateString()}
                  </span>
                </div>
              )}
              {patient.gender && (
                <div>
                  <span className="text-slate-400 font-semibold block mb-1">Gender</span>
                  <span className="text-slate-800 dark:text-slate-200 font-bold capitalize">{patient.gender}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Legacy App Integration - Always Visible */}
        <div className="glass p-6 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
                  Diagnostic Reports
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Access detailed diagnostic history and medical reports
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push(`/patients/${patient.id}/history-records`)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors text-sm flex items-center gap-2 whitespace-nowrap"
            >
              <FileText className="h-4 w-4" />
              View Diagnostic Reports Details
            </button>
          </div>
        </div>

        {/* Medical History Section */}
        <div className="glass p-6 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 mb-8">
          <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-teal-600" />
            Medical History
          </h3>

          {/* DEFENSIVE PROGRAMMING FIX: Prevents React crash when medicalHistory is null/undefined
              This is the bug from Challenge 4 - accessing .toUpperCase() on null crashes the app.
              Uses optional chaining (?.) and conditional rendering to safely handle missing data.
              If medicalHistory is null/undefined, displays a user-friendly fallback message instead of crashing.
              This prevents "Cannot read properties of null" errors that would crash the entire React tree. */}
          {patient.medicalHistory ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-sm font-semibold">
                {patient.medicalHistory.toUpperCase()}
              </p>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-amber-600 dark:text-amber-500 text-sm">
                  No Medical History on File
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs mt-1">
                  This patient does not have any medical history records in the system. 
                  Medical history can be added during patient registration or updated later.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Appointments Section */}
        {patient.appointments && patient.appointments.length > 0 && (
          <div className="glass p-6 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-teal-600" />
              Appointment History
            </h3>
            <div className="space-y-3">
              {patient.appointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {appointment.doctor?.name || 'Unknown Doctor'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(appointment.appointmentDate).toLocaleString()}
                      </p>
                      {appointment.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                          {appointment.notes}
                        </p>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded text-xxs font-extrabold uppercase ${
                      appointment.status === 'COMPLETED' 
                        ? 'bg-teal-500/10 text-teal-600' 
                        : appointment.status === 'CANCELLED'
                        ? 'bg-rose-500/10 text-rose-500'
                        : 'bg-amber-500/10 text-amber-500'
                    }`}>
                      {appointment.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
