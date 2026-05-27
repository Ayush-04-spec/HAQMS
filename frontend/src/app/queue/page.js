'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Navbar from '@/components/common/Navbar';
import { Bell, Monitor, RefreshCw, AlertCircle } from 'lucide-react';

export default function QueueMonitor() {
  // HOOK ORDER FIX: All hooks must be called before any conditional returns
  // This ensures React always calls the same number of hooks on every render
  // Violating this rule causes "Rendered fewer hooks than expected" errors
  
  // 1. Custom hooks first
  const router = useRouter();
  const { token, API_BASE_URL } = useAuth();
  
  // 2. All useState hooks
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  // 3. All useEffect hooks
  // AUTHENTICATION FIX: Redirect to login if no token is available
  // This prevents 401 errors and provides better user experience
  useEffect(() => {
    if (!token) {
      console.log('[AUTH] No token found, redirecting to login...');
      router.push('/login');
    }
  }, [token, router]);

  // ==========================================
  // BACKGROUND POLLING SYSTEM - REFACTORED
  // ==========================================
  // MEMORY LEAK FIX: Proper cleanup of polling interval to prevent memory leaks
  // POLLING FREEZE FIX: Removed refreshCount from dependencies to prevent interval recreation
  // DATA MAPPING FIX: Handles both flat array and wrapped response formats
  // When the component unmounts (user navigates away), the cleanup function ensures:
  // 1. clearInterval stops the background polling timer
  // 2. AbortController cancels any in-flight fetch requests
  // 3. Prevents "setState on unmounted component" warnings and memory bloat
  // This is critical for pages that mount/unmount frequently (navigation between routes)
  useEffect(() => {
    // AUTHENTICATION CHECK: Don't fetch if no token available
    if (!token) {
      return;
    }

    // Create AbortController to cancel fetch requests on unmount
    const abortController = new AbortController();
    let isMounted = true;

    const fetchLiveQueue = async () => {
      try {
        console.log('[POLLING SYSTEM] Fetching live queue data...');
        
        // ==========================================
        // SECURE TOKEN INCLUSION WITH FALLBACKS
        // ==========================================
        // Primary: Use token from AuthContext
        // Fallback: Check localStorage for guest sessions
        const authToken = token || localStorage.getItem('haqms_token');
        
        if (!authToken) {
          console.warn('[POLLING SYSTEM] No authentication token available');
          if (isMounted) {
            setError('Authentication required. Please log in.');
            router.push('/login');
          }
          return;
        }
        
        // AUTHENTICATION FIX: Add Authorization header with JWT token
        // The backend authenticate middleware requires this header to verify the user
        // Format: "Bearer <token>" as per JWT standard (RFC 6750)
        const res = await fetch(`${API_BASE_URL}/queue`, {
          signal: abortController.signal,
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        });
        
        // ==========================================
        // HTTP STATUS HANDLING
        // ==========================================
        
        // Handle authentication errors specifically
        if (res.status === 401) {
          console.error('[AUTH] Token expired or invalid, redirecting to login...');
          if (isMounted) {
            setError('Session expired. Please log in again.');
          }
          // Redirect to login after a brief delay to show error message
          setTimeout(() => {
            router.push('/login');
          }, 2000);
          return;
        }
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Failed to retrieve active token queue.`);
        }
        
        // ==========================================
        // DATA EXTRACTION & MAPPING
        // ==========================================
        // Backend may return:
        // 1. Flat array: [{ id: 1, ... }, { id: 2, ... }]
        // 2. Wrapped object: { data: [...], success: true }
        // 3. Direct array with metadata: { tokens: [...], count: 5 }
        
        const data = await res.json();
        
        console.log('[POLLING SYSTEM] Raw response structure:', {
          isArray: Array.isArray(data),
          hasDataProperty: data?.data !== undefined,
          hasTokensProperty: data?.tokens !== undefined,
          dataType: typeof data,
          sampleKeys: data ? Object.keys(data).slice(0, 5) : []
        });
        
        // Secure array payload extraction (handles multiple response variants)
        let queueRecords = [];
        
        if (Array.isArray(data)) {
          // Case 1: Direct array response
          queueRecords = data;
          console.log('[POLLING SYSTEM] Using direct array response');
        } else if (data?.data && Array.isArray(data.data)) {
          // Case 2: Wrapped in { data: [...] }
          queueRecords = data.data;
          console.log('[POLLING SYSTEM] Extracting from data.data property');
        } else if (data?.tokens && Array.isArray(data.tokens)) {
          // Case 3: Wrapped in { tokens: [...] }
          queueRecords = data.tokens;
          console.log('[POLLING SYSTEM] Extracting from data.tokens property');
        } else {
          console.warn('[POLLING SYSTEM] Unexpected response format, defaulting to empty array');
          queueRecords = [];
        }
        
        console.log('[POLLING SYSTEM] Extracted queue records:', {
          count: queueRecords.length,
          sample: queueRecords.slice(0, 2)
        });
        
        // Only update state if component is still mounted
        if (isMounted) {
          setTokens(queueRecords);
          setError('');
          setLoading(false);
        }
        
      } catch (err) {
        // Ignore abort errors (expected when component unmounts)
        if (err.name === 'AbortError') {
          console.log('[POLL] Fetch aborted - component unmounted');
          return;
        }
        
        console.error('[POLLING SYSTEM ERROR] Live queue sync failed:', {
          message: err.message,
          error: err,
          stack: err.stack
        });
        
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      } finally {
        // ==========================================
        // CRITICAL: INCREMENT POLL COUNTER
        // ==========================================
        // This MUST happen regardless of success/failure to keep the monitor active
        // Without this, the polling system appears frozen to users
        if (isMounted) {
          setRefreshCount((prev) => {
            const newCount = prev + 1;
            console.log(`[POLLING SYSTEM] Poll cycle #${newCount} completed`);
            return newCount;
          });
        }
      }
    };

    // ==========================================
    // INITIALIZE POLLING SYSTEM
    // ==========================================
    
    // Execute immediate initialization step
    console.log('[POLLING SYSTEM] Starting initial fetch...');
    fetchLiveQueue();

    // Establish stable 3-second background polling cadence
    console.log('[POLLING SYSTEM] Establishing 3-second polling interval...');
    const syncInterval = setInterval(() => {
      console.log('[POLLING SYSTEM] Interval tick - triggering fetch...');
      fetchLiveQueue();
    }, 3000);

    // ==========================================
    // CLEANUP FUNCTION
    // ==========================================
    // Critical for preventing memory leaks
    return () => {
      console.log('[CLEANUP] Clearing queue polling interval and aborting fetch requests');
      isMounted = false;
      clearInterval(syncInterval); // Stop the polling timer
      abortController.abort(); // Cancel any pending fetch requests
    };
    
    // DEPENDENCY ARRAY FIX: Removed refreshCount to prevent interval recreation
    // Only re-run effect if token or API_BASE_URL changes
  }, [token, API_BASE_URL, router]);

  // ==========================================
  // DATA GROUPING & MAPPING
  // ==========================================
  // Group tokens by doctor and organize by status
  // DATA MAPPING FIX: Handle nested doctor.user.name structure from backend
  // Backend returns: { doctor: { id, specialization, user: { name } } }
  // We need to safely extract the doctor name from the nested structure
  const groupedTokens = tokens.reduce((groups, token) => {
    const docId = token.doctorId;
    
    if (!groups[docId]) {
      // SAFE DATA EXTRACTION: Handle multiple possible data structures
      // 1. token.doctor.user.name (correct schema structure)
      // 2. token.doctor.name (legacy/flat structure)
      // 3. 'Unknown Doctor' (fallback for missing data)
      const doctorName = token.doctor?.user?.name || token.doctor?.name || 'Unknown Doctor';
      const specialization = token.doctor?.specialization || 'General';
      
      console.log('[DATA MAPPING] Creating group for doctor:', {
        doctorId: docId,
        doctorName,
        specialization,
        rawDoctorData: token.doctor
      });
      
      groups[docId] = {
        doctorName,
        specialization,
        calling: null,
        waiting: [],
      };
    }
    
    // STATUS MAPPING: Handle different status values
    // Backend may use: 'CALLING', 'CALLED', 'calling', 'WAITING', 'waiting'
    const normalizedStatus = token.status?.toUpperCase();
    
    if (normalizedStatus === 'CALLING' || normalizedStatus === 'CALLED') {
      groups[docId].calling = token;
      console.log('[DATA MAPPING] Assigned calling token:', {
        doctorId: docId,
        tokenNumber: token.tokenNumber,
        patientName: token.patient?.name
      });
    } else if (normalizedStatus === 'WAITING') {
      groups[docId].waiting.push(token);
    }
    
    return groups;
  }, {});
  
  console.log('[DATA MAPPING] Grouped tokens summary:', {
    doctorCount: Object.keys(groupedTokens).length,
    doctors: Object.entries(groupedTokens).map(([id, info]) => ({
      id,
      name: info.doctorName,
      calling: info.calling?.tokenNumber || 'none',
      waitingCount: info.waiting.length
    }))
  });

  // 5. CONDITIONAL RETURNS LAST: After all hooks have been initialized
  // This ensures React's Rules of Hooks are never violated
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="pulse-loader">
            <div></div>
            <div></div>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-400">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 sm:p-8">
        {/* Header Dashboard Banner */}
        <div className="glass p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-xl">
              <Monitor className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                Live Public Monitor Board
              </h1>
              <p className="text-xs text-slate-400 dark:text-slate-400 font-semibold mt-1">
                Real-time physician calling boards. Auto-syncs every 3 seconds.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-400 text-xs font-bold uppercase tracking-wide border border-teal-500/20">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Auto Refreshing
            </span>
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-400 text-xs font-mono">
              Polls: {refreshCount}
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 mb-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center gap-3 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <strong>Sync Error:</strong> {error} - Please verify that the backend API server is online.
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        {loading && tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="pulse-loader">
              <div></div>
              <div></div>
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-400">Loading active token queues...</p>
          </div>
        ) : Object.keys(groupedTokens).length === 0 ? (
          <div className="glass p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            <Bell className="h-12 w-12 text-slate-400 mx-auto animate-bounce" />
            <h3 className="mt-4 text-lg font-bold text-slate-800 dark:text-slate-100">No Active Tokens</h3>
            <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto">
              There are currently no patient check-ins registered for today. Use the receptionist portal in the Staff Dashboard to check-in patients.
            </p>
          </div>
        ) : (
          /* Grid of Doctor Calling Boards */
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(groupedTokens).map(([docId, docInfo]) => (
              <div
                key={docId}
                className="glass rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-full hover:shadow-teal-500/5 hover:border-teal-500/30 transition-all duration-300"
              >
                {/* Doctor Title Header */}
                <div className="bg-slate-500/5 p-5 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="font-extrabold text-lg text-slate-800 dark:text-slate-100">{docInfo.doctorName}</h3>
                  <p className="text-xs text-teal-600 dark:text-teal-400 font-bold uppercase tracking-wider mt-0.5">
                    {docInfo.specialization}
                  </p>
                </div>

                {/* Token Display Grid */}
                <div className="p-6 flex-1 flex flex-col justify-between">
                  {/* Current Active Token Box */}
                  <div className="mb-6">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2.5">
                      Now Calling
                    </h4>
                    {docInfo.calling ? (
                      <div className="bg-teal-500/10 dark:bg-teal-500/5 border border-teal-500/30 p-6 rounded-2xl text-center shadow-inner relative overflow-hidden group">
                        {/* Glowing radial accent */}
                        <div className="absolute inset-0 bg-radial-gradient(circle, rgba(20,184,166,0.1) 0%, transparent 80%) opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <span className="block text-5xl font-black text-teal-600 dark:text-teal-400 tracking-wider animate-pulse">
                          #{docInfo.calling.tokenNumber}
                        </span>
                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide mt-2">
                          Patient: {docInfo.calling.patient?.name || 'Unknown'}
                        </span>
                      </div>
                    ) : (
                      <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800/80 p-6 rounded-2xl text-center shadow-inner">
                        <span className="block text-2xl font-extrabold text-slate-400 dark:text-slate-500 tracking-wider italic">
                          Idle
                        </span>
                        <span className="block text-xs font-medium text-slate-400 mt-2">
                          No active patients being called
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Upcoming Tokens list */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Queue List
                    </h4>
                    {docInfo.waiting.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {docInfo.waiting.map((token) => (
                          <div
                            key={token.id}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
                            title={`Patient: ${token.patient?.name || 'Unknown'}`}
                          >
                            #{token.tokenNumber}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500 italic block">
                        No upcoming patients in queue
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
