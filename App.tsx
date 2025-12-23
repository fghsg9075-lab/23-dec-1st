import React, { useState, useEffect } from 'react';
import { 
  ClassLevel, Subject, Chapter, AppState, Board, Stream, User, ContentType, SystemSettings, ActivityLogEntry, WeeklyTest
} from './types';
// Firebase Functions Sync
import { 
  getChapterData, 
  saveChapterData, 
  checkFirebaseConnection, 
  saveTestResult, 
  saveUserToLive, 
  updateUserStatus, 
  subscribeToSettings 
} from './firebase';
import { fetchChapters, fetchLessonContent } from './services/gemini';
import { BoardSelection } from './components/BoardSelection';
import { ClassSelection } from './components/ClassSelection';
import { SubjectSelection } from './components/SubjectSelection';
import { ChapterSelection } from './components/ChapterSelection';
import { StreamSelection } from './components/StreamSelection';
import { LessonView } from './components/LessonView';
import { Auth } from './components/Auth';
import { AdminDashboard } from './components/AdminDashboard';
import { StudentDashboard } from './components/StudentDashboard';
import { WelcomePopup } from './components/WelcomePopup';
import { PremiumModal } from './components/PremiumModal';
import { LoadingOverlay } from './components/LoadingOverlay';
import { StartupAd } from './components/StartupAd';
import { WeeklyTestView } from './components/WeeklyTestView';
import { BrainCircuit, LogOut, Lock, FileText, WifiOff, EyeOff, Zap, Sparkles, ShieldCheck } from 'lucide-react';

// --- UI: TERMS & CONDITIONS POPUP ---
const TermsPopup: React.FC<{ onClose: () => void, text?: string }> = ({ onClose, text }) => (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-lg md:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-white p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 z-10">
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="text-blue-600" /> Terms & Conditions
                </h3>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 text-sm text-slate-600 leading-relaxed custom-scrollbar whitespace-pre-wrap">
                <p className="text-slate-900 font-medium">Please read carefully before using NST AI Assistant.</p>
                <p>{text || "By continuing, you agree to abide by these rules and the standard terms of service."}</p>
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-xs">
                    Note: Your study progress and activity are monitored live by the Admin to ensure academic integrity.
                </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-white sticky bottom-0 z-10">
                <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all active:scale-95">I Agree & Continue</button>
            </div>
        </div>
    </div>
);

const App: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showStartupAd, setShowStartupAd] = useState(false);

  // --- INITIAL APP STATE ---
  const [state, setState] = useState<AppState>({
    user: null,
    originalAdmin: null,
    view: 'BOARDS',
    selectedBoard: null,
    selectedClass: null,
    selectedStream: null,
    selectedSubject: null,
    selectedChapter: null,
    chapters: [],
    lessonContent: null,
    loading: false,
    error: null,
    language: 'English',
    showWelcome: false,
    globalMessage: null,
    settings: {
        appName: 'NST',
        themeColor: '#3b82f6',
        maintenanceMode: false,
        maintenanceMessage: 'We are upgrading our servers. Please check back later.',
        customCSS: '',
        apiKeys: [],
        welcomeTitle: 'Unlock Smart Learning', 
        welcomeMessage: 'Experience the power of AI-driven education. Study smarter, not harder.',
        marqueeLines: ["Welcome to Ideal Inspiration Classes", "Learn Smart with NST AI", "Contact Admin for Credits"], 
        liveMessage1: '', 
        liveMessage2: '', 
        wheelRewards: [0, 1, 2, 5],
        chatCost: 1,
        dailyReward: 3,
        signupBonus: 2,
        isChatEnabled: true,
        isGameEnabled: true, 
        allowSignup: true,
        loginMessage: '',
        allowedClasses: ['6','7','8','9','10','11','12'],
        storageCapacity: '100 GB',
        isPaymentEnabled: true, 
        upiId: '',
        upiName: '',
        qrCodeUrl: '',
        paymentInstructions: '',
        packages: [],
        subscriptionPlans: [
            { id: 'weekly', name: 'Weekly', duration: '7 days', basicPrice: 49, basicOriginalPrice: 199, ultraPrice: 99, ultraOriginalPrice: 399, features: ['Premium Content'], popular: false },
            { id: 'monthly', name: 'Monthly', duration: '30 days', basicPrice: 199, basicOriginalPrice: 499, ultraPrice: 299, ultraOriginalPrice: 799, features: ['Live Chat'], popular: true }
        ],
        startupAd: { enabled: true, duration: 2, title: "Premium Features", features: ["AI Notes Generator", "MCQ Practice"], bgColor: "#1e293b", textColor: "#ffffff" }
    }
  });

  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [tempSelectedChapter, setTempSelectedChapter] = useState<Chapter | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [generationDataReady, setGenerationDataReady] = useState(false);
  const [activeWeeklyTest, setActiveWeeklyTest] = useState<WeeklyTest | null>(null);
  const [dailyStudySeconds, setDailyStudySeconds] = useState(0);

  // --- 1. ONLINE/OFFLINE DETECTOR ---
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- 2. LIVE SETTINGS SYNC (REPLACES 2s INTERVAL) ---
  useEffect(() => {
    const unsubscribe = subscribeToSettings((newSettings) => {
        if (newSettings) {
            setState(prev => ({
                ...prev,
                settings: { ...prev.settings, ...newSettings }
            }));
        }
    });
    return () => unsubscribe();
  }, []);

  // --- 3. APP INITIALIZATION & USER RELOAD ---
  useEffect(() => {
      const hasSeenAd = sessionStorage.getItem('nst_ad_seen');
      if (!hasSeenAd) setShowStartupAd(true);

      const hasAcceptedTerms = localStorage.getItem('nst_terms_accepted');
      if (!hasAcceptedTerms) setShowTerms(true);

      const loggedInUserStr = localStorage.getItem('nst_current_user');
      if (loggedInUserStr) {
        const user: User = JSON.parse(loggedInUserStr);
        // Sync existing user to Cloud on reload
        handleLogin(user); 
      }
  }, []);

  // --- 4. STUDY TIMER & CLOUD STATUS SYNC ---
  useEffect(() => {
    if (!state.user) return;

    const today = new Date().toDateString();
    const storedDate = localStorage.getItem('nst_timer_date');
    const storedSeconds = parseInt(localStorage.getItem('nst_daily_study_seconds') || '0');

    if (storedDate !== today) {
        localStorage.setItem('nst_timer_date', today);
        localStorage.setItem('nst_daily_study_seconds', '0');
        setDailyStudySeconds(0);
    } else {
        setDailyStudySeconds(storedSeconds);
    }

    let interval: any;
    if (state.view === 'LESSON') {
        interval = setInterval(() => {
            setDailyStudySeconds(prev => {
                const next = prev + 1;
                localStorage.setItem('nst_daily_study_seconds', next.toString());
                
                // Sync status to cloud every 10 seconds
                if (next % 10 === 0) {
                    updateUserStatus(state.user!.id, next);
                }
                return next;
            });
        }, 1000);
    }

    return () => { if (interval) clearInterval(interval); };
  }, [state.user?.id, state.view]); 

  // --- 5. LOGGING SYSTEM ---
  const logActivity = (action: string, details: string, overrideUser?: User) => {
      const u = overrideUser || state.user;
      if (!u) return;
      const logs = JSON.parse(localStorage.getItem('nst_activity_log') || '[]');
      const newLog = { id: Date.now().toString(), userId: u.id, userName: u.name, action, details, timestamp: new Date().toISOString() };
      localStorage.setItem('nst_activity_log', JSON.stringify([...logs, newLog].slice(-500)));
  };

  // --- 6. AUTHENTICATION HANDLERS ---
  const handleLogin = async (user: User) => {
    localStorage.setItem('nst_current_user', JSON.stringify(user));
    // Save User Data to Live Firestore
    await saveUserToLive(user);
    
    setState(prev => ({ 
      ...prev, user, view: user.role === 'ADMIN' ? 'ADMIN_DASHBOARD' : 'STUDENT_DASHBOARD' as any, 
      selectedBoard: user.board || null, selectedClass: user.classLevel || null, selectedStream: user.stream || null, 
      language: user.board === 'BSEB' ? 'Hindi' : 'English', showWelcome: false 
    }));
  };

  const handleLogout = () => {
    logActivity("LOGOUT", "User Logged Out");
    localStorage.removeItem('nst_current_user');
    setState(prev => ({ ...prev, user: null, originalAdmin: null, view: 'BOARDS', selectedBoard: null, selectedClass: null, selectedStream: null, selectedSubject: null, lessonContent: null }));
    setDailyStudySeconds(0);
  };

  // --- 7. NAVIGATION HANDLERS ---
  const handleBoardSelect = (board: Board) => setState(prev => ({ ...prev, selectedBoard: board, view: 'CLASSES', language: board === 'BSEB' ? 'Hindi' : 'English' }));
  const handleClassSelect = (level: ClassLevel) => setState(prev => ({ ...prev, selectedClass: level, view: level === '11' || level === '12' ? 'STREAMS' : 'SUBJECTS' }));
  const handleStreamSelect = (stream: Stream) => setState(prev => ({ ...prev, selectedStream: stream, view: 'SUBJECTS' }));

  const handleSubjectSelect = async (subject: Subject) => {
    setState(prev => ({ ...prev, selectedSubject: subject, loading: true }));
    try {
      const chapters = await fetchChapters(state.selectedBoard!, state.selectedClass!, state.selectedStream, subject, state.language);
      setState(prev => ({ ...prev, chapters, view: 'CHAPTERS', loading: false }));
    } catch (err) { setState(prev => ({ ...prev, loading: false })); }
  };

  const handleContentGeneration = async (type: ContentType) => {
    if (!tempSelectedChapter || !state.user) return;
    setShowPremiumModal(false);
    
    const streamKey = (state.selectedClass === '11' || state.selectedClass === '12') ? `-${state.selectedStream}` : '';
    const key = `nst_content_${state.selectedBoard}_${state.selectedClass}${streamKey}_${state.selectedSubject?.name}_${tempSelectedChapter.id}_${type}`;
    
    setState(prev => ({ ...prev, loading: true }));
    setGenerationDataReady(false);

    try {
        // Step 1: Check Cloud First
        const onlineContent = await getChapterData(key);
        if (onlineContent) {
            setState(prev => ({ ...prev, lessonContent: onlineContent }));
            setGenerationDataReady(true);
            return;
        }

        // Step 2: Generate via Gemini
        const content = await fetchLessonContent(state.selectedBoard!, state.selectedClass!, state.selectedStream!, state.selectedSubject!, tempSelectedChapter, state.language, type);
        
        // Step 3: Save to Cloud for future
        await saveChapterData(key, content);
        setState(prev => ({ ...prev, lessonContent: content, selectedChapter: tempSelectedChapter }));
        setGenerationDataReady(true);
    } catch (err) { setState(prev => ({ ...prev, loading: false })); }
  };

  // --- 8. TEST RESULT HANDLER ---
  const handleWeeklyTestComplete = async (score: number, total: number) => {
    if (!activeWeeklyTest || !state.user) return;
    const result = { testId: activeWeeklyTest.id, testName: activeWeeklyTest.name, score, total, date: new Date().toISOString() };
    
    // Sync score to Firestore
    await saveTestResult(state.user.id, result);
    setActiveWeeklyTest(null);
    alert(`Test Completed! Score: ${score}/${total}`);
  };

  const goBack = () => {
    if (activeWeeklyTest && !confirm("Exit test?")) return;
    setActiveWeeklyTest(null);

    setState(prev => {
      if (prev.view === 'LESSON') return { ...prev, view: 'CHAPTERS', lessonContent: null };
      if (prev.view === 'CHAPTERS') return { ...prev, view: prev.user?.role === 'STUDENT' ? 'STUDENT_DASHBOARD' : 'SUBJECTS' as any };
      if (prev.view === 'SUBJECTS') return { ...prev, view: prev.user?.role === 'STUDENT' ? 'STUDENT_DASHBOARD' : (['11','12'].includes(prev.selectedClass||'') ? 'STREAMS' : 'CLASSES') as any };
      if (prev.view === 'STREAMS') return { ...prev, view: 'CLASSES', selectedStream: null };
      if (prev.view === 'CLASSES') return { ...prev, view: 'BOARDS', selectedClass: null };
      return { ...prev, view: prev.user?.role === 'ADMIN' ? 'ADMIN_DASHBOARD' as any : 'STUDENT_DASHBOARD' as any };
    });
  };

  // --- 9. RENDER LOGIC ---
  if (!isOnline) {
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-8 text-center animate-in fade-in">
              <WifiOff size={80} className="text-red-500 mb-6 animate-pulse" />
              <h1 className="text-3xl font-black mb-2">Internet Not Connected</h1>
              <p className="text-slate-400">Check your connection to continue.</p>
          </div>
      );
  }

  if (state.settings.maintenanceMode && state.user?.role !== 'ADMIN') {
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-8 text-center animate-in fade-in">
              <Lock size={64} className="text-red-500 mb-6" />
              <h1 className="text-3xl font-black mb-4">Under Maintenance</h1>
              <p className="text-slate-400">{state.settings.maintenanceMessage}</p>
          </div>
      );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans relative">
      
      {/* TOP MARQUEE */}
      {state.settings.liveMessage1 && (
          <div className="bg-red-600 text-white text-[10px] font-bold py-1 overflow-hidden sticky top-0 z-[60]">
              <div className="animate-marquee whitespace-nowrap inline-block uppercase tracking-widest">{state.settings.liveMessage1}</div>
          </div>
      )}

      {showTerms && <TermsPopup onClose={() => { localStorage.setItem('nst_terms_accepted', 'true'); setShowTerms(false); }} text={state.settings.termsText} />}

      <header className="bg-white sticky top-0 z-40 border-b border-slate-100 h-16 flex items-center justify-between px-6 shadow-sm">
         <div onClick={() => setState(prev => ({...prev, view: prev.user?.role === 'ADMIN' ? 'ADMIN_DASHBOARD' : 'STUDENT_DASHBOARD' as any}))} className="flex items-center gap-2 cursor-pointer">
             <div className="bg-blue-600 rounded-lg p-1.5 text-white"><BrainCircuit size={20} /></div>
             <h1 className="text-xl font-black text-slate-800 tracking-tighter">{state.settings.appName}</h1>
         </div>
         {state.user && (
             <button onClick={handleLogout} className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"><LogOut size={20} /></button>
         )}
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto p-4 md:p-6 mb-24">
        {!state.user ? (
            <Auth onLogin={handleLogin} logActivity={logActivity} />
        ) : (
            <div className="animate-in fade-in duration-500">
                {state.view === 'ADMIN_DASHBOARD' && state.user.role === 'ADMIN' && <AdminDashboard onNavigate={v => setState(prev => ({...prev, view: v}))} settings={state.settings} onUpdateSettings={s => setState(prev => ({...prev, settings: s}))} logActivity={logActivity} />}
                
                {activeWeeklyTest ? (
                    <WeeklyTestView test={activeWeeklyTest} onComplete={handleWeeklyTestComplete} onExit={() => setActiveWeeklyTest(null)} />
                ) : (
                    state.view === 'STUDENT_DASHBOARD' as any && <StudentDashboard user={state.user} dailyStudySeconds={dailyStudySeconds} onSubjectSelect={handleSubjectSelect} settings={state.settings} onStartWeeklyTest={setActiveWeeklyTest} />
                )}
                
                {state.view === 'BOARDS' && <BoardSelection onSelect={handleBoardSelect} onBack={goBack} />}
                {state.view === 'CLASSES' && <ClassSelection selectedBoard={state.selectedBoard} onSelect={handleClassSelect} onBack={goBack} />}
                {state.view === 'STREAMS' && <StreamSelection onSelect={handleStreamSelect} onBack={goBack} />}
                {state.view === 'SUBJECTS' && <SubjectSelection classLevel={state.selectedClass!} onSelect={handleSubjectSelect} onBack={goBack} />}
                {state.view === 'CHAPTERS' && <ChapterSelection chapters={state.chapters} subject={state.selectedSubject!} user={state.user} onSelect={ch => { setTempSelectedChapter(ch); setShowPremiumModal(true); }} onBack={goBack}/>}
                {state.view === 'LESSON' && state.lessonContent && <LessonView content={state.lessonContent} chapter={state.selectedChapter!} onBack={goBack} />}
            </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-100 py-3 text-center z-30">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{state.settings.footerText || 'Ideal Inspiration Classes • Nadim Anwar'}</p>
      </footer>

      {state.settings.liveMessage2 && (
          <div className="fixed bottom-10 left-0 right-0 bg-blue-600 text-white text-[9px] font-bold py-1 overflow-hidden z-[29]">
              <div className="animate-marquee-reverse whitespace-nowrap inline-block">{state.settings.liveMessage2}</div>
          </div>
      )}

      {state.loading && <LoadingOverlay dataReady={generationDataReady} onComplete={() => setState(prev => ({...prev, loading: false, view: 'LESSON'}))} />}
      {showPremiumModal && tempSelectedChapter && state.user && <PremiumModal chapter={tempSelectedChapter} credits={state.user.credits} isAdmin={state.user.role === 'ADMIN'} onSelect={handleContentGeneration} onClose={() => setShowPremiumModal(false)} />}
      {showStartupAd && state.settings.startupAd?.enabled && <StartupAd config={state.settings.startupAd} onClose={() => setShowStartupAd(false)} />}
      {state.showWelcome && <WelcomePopup onStart={() => setState(prev => ({...prev, showWelcome: false}))} isResume={!!state.user} title={state.settings.welcomeTitle} message={state.settings.welcomeMessage} />}
    </div>
  );
};

export default App;

