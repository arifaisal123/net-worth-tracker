import React, { useState, useMemo, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import { 
  LayoutDashboard, PieChart as PieChartIcon, Search, Plus, 
  Settings, Edit2, Trash2, ArrowUpRight, ArrowDownRight, 
  Wallet, Building, TrendingUp, X, Calendar, ChevronDown, ChevronUp, FileText, LogOut, Loader2, Lock, Mail, User
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  onAuthStateChanged, signOut, sendPasswordResetEmail
} from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// --- STRICT FIREBASE INITIALIZATION ---
// We have removed the AI canvas override. This will forcefully 
// connect to your real Firebase project. 
// Note: Replace these placeholder strings with your actual Firebase config keys 
// before deploying or testing locally.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'nexus-wealth-tracker';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#14b8a6', '#ef4444', '#f97316', '#06b6d4'];

export default function App() {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [entries, setEntries] = useState([]);
  const [authUser, setAuthUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLogoutMenuOpen, setIsLogoutMenuOpen] = useState(false);
  
  // Auth Form State
  const [authMode, setAuthMode] = useState('login'); 
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [dbError, setDbError] = useState(''); // ADDED: Database error state

  // Settings
  const [currencySettings, setCurrencySettings] = useState({ base: 'BDT', display: 'BDT', usdRate: 110 });

  // Modals & Forms
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  
  // TIMEZONE FIX: Generates true local date string based on your device clock
  const getLocalDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const todayString = getLocalDateString();

  const [formData, setFormData] = useState({
    date: todayString, assetName: '', value: 0, liquidity: 'liquid', tangibility: 'tangible', remarks: ''
  });

  const [detailModal, setDetailModal] = useState({ isOpen: false, title: '', data: [], type: '' });
  const [searchParams, setSearchParams] = useState({ start: '2025-10-01', end: todayString });
  const [expandedDetails, setExpandedDetails] = useState({ liquid: false, tangible: false, position: false });

  // --- FIREBASE AUTH & DATA FETCHING ---
  useEffect(() => {
    try {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setAuthUser(user);
        if (!user) {
          setEntries([]); // ADDED: Wipe the screen clean instantly when logging out
          setDbError('');
        }
        setIsLoading(false);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error("Firebase auth initialization failed:", error);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authUser) return;
    setIsLoading(true);

    try {
      const entriesRef = collection(db, 'artifacts', appId, 'users', authUser.uid, 'entries');
      const unsubscribeEntries = onSnapshot(entriesRef, (snapshot) => {
        const fetchedEntries = [];
        snapshot.forEach((doc) => { fetchedEntries.push({ id: doc.id, ...doc.data() }); });
        setEntries(fetchedEntries);
        setIsLoading(false);
      }, (error) => {
        console.error("Error fetching entries:", error);
        setIsLoading(false);
      });

      const settingsRef = collection(db, 'artifacts', appId, 'users', authUser.uid, 'settings');
      const unsubscribeSettings = onSnapshot(settingsRef, (snapshot) => {
        snapshot.forEach(doc => { if (doc.id === 'displayConfig') setCurrencySettings(doc.data()); });
      });

      return () => { unsubscribeEntries(); unsubscribeSettings(); };
    } catch (error) {
      console.error("Error connecting to database. Please check configuration.", error);
      setIsLoading(false);
    }
  }, [authUser]);

  // --- AUTH HANDLERS ---
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    setIsLoading(true);
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
        setAuthEmail('');
        setAuthPassword('');
      } else if (authMode === 'signup') {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        setAuthEmail('');
        setAuthPassword('');
      } else if (authMode === 'reset') {
        await sendPasswordResetEmail(auth, authEmail);
        setAuthMessage('Password reset email sent! Check your inbox.');
        setIsLoading(false);
        return; 
      }
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', ''));
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsLogoutMenuOpen(false);
      setAuthMode('login'); 
      setAuthError('');
      setAuthMessage('');
    } catch (error) { console.error("Logout error:", error); }
  };

  const switchAuthMode = (mode) => {
    setAuthMode(mode);
    setAuthError('');
    setAuthMessage('');
  };

  // --- DERIVED DATA & LOGIC ---
  const uniqueAssetNames = useMemo(() => Array.from(new Set(entries.map(e => e.assetName))), [entries]);
  const getAssetColor = (name) => COLORS[uniqueAssetNames.indexOf(name) % COLORS.length];

  const formatCurrency = (val) => {
    if (val === undefined || val === null) return '';
    const converted = currencySettings.display === 'USD' ? val / currencySettings.usdRate : val;
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: currencySettings.display, maximumFractionDigits: currencySettings.display === 'USD' ? 2 : 0
    }).format(converted);
  };

  const getAssetsSnapshot = (upToDate, data = entries) => {
    const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
    const filtered = sorted.filter(e => e.date <= upToDate);
    const assetMap = {};
    filtered.forEach(e => { assetMap[e.assetName] = e; });
    return Object.values(assetMap);
  };

  const currentAssets = useMemo(() => getAssetsSnapshot(todayString), [entries, todayString]);

  const calculateMetrics = (assets) => {
    let total = 0, liquid = 0, nonLiquid = 0, tangible = 0, intangible = 0;
    assets.forEach(a => {
      total += a.value;
      if (a.liquidity === 'liquid') liquid += a.value; else nonLiquid += a.value;
      if (a.tangibility === 'tangible') tangible += a.value; else intangible += a.value;
    });
    return { total, liquid, nonLiquid, tangible, intangible };
  };

  const currentMetrics = useMemo(() => calculateMetrics(currentAssets), [currentAssets]);

  const timelineData = useMemo(() => {
    const uniqueDates = Array.from(new Set(entries.map(e => e.date))).sort((a, b) => new Date(a) - new Date(b));
    return uniqueDates.map(date => {
      const snapshot = getAssetsSnapshot(date);
      const dataPoint = { date, total: 0 };
      snapshot.forEach(asset => {
        dataPoint[asset.assetName] = asset.value;
        dataPoint.total += asset.value;
      });
      uniqueAssetNames.forEach(name => { if (dataPoint[name] === undefined) dataPoint[name] = 0; });
      return dataPoint;
    });
  }, [entries, uniqueAssetNames]);

  const searchResults = useMemo(() => {
    const startAssets = getAssetsSnapshot(searchParams.start);
    const endAssets = getAssetsSnapshot(searchParams.end);
    const startMetrics = calculateMetrics(startAssets);
    const endMetrics = calculateMetrics(endAssets);
    
    const filteredTimeline = timelineData.filter(d => d.date >= searchParams.start && d.date <= searchParams.end);
    
    const allAssetsInPeriod = Array.from(new Set([...startAssets, ...endAssets].map(a => a.assetName)));
    const positions = allAssetsInPeriod.map(name => {
      const startVal = startAssets.find(a => a.assetName === name)?.value || 0;
      const endVal = endAssets.find(a => a.assetName === name)?.value || 0;
      return { name, startValue: startVal, endValue: endVal, change: endVal - startVal };
    });

    return { startMetrics, endMetrics, positions, filteredTimeline };
  }, [entries, searchParams, timelineData]);

  const formattedToday = useMemo(() => {
    const d = new Date();
    const day = d.getDate();
    const month = d.toLocaleString('default', { month: 'short' });
    const year = d.getFullYear();
    const weekday = d.toLocaleString('default', { weekday: 'short' });
    return `${day} ${month} ${year} (${weekday})`;
  }, []);

  // --- DATABASE WRITE HANDLERS ---
  const handleSaveEntry = async (e) => {
    e.preventDefault();
    if (!authUser) return;
    const entryId = editingEntry ? editingEntry.id : Date.now().toString();
    const newEntry = { ...formData, id: entryId, value: Number(formData.value) };
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', authUser.uid, 'entries', entryId);
      await setDoc(docRef, newEntry);
      setIsEntryModalOpen(false);
      setDbError(''); // Clear any previous errors
    } catch (error) { 
      console.error("Error saving:", error); 
      setDbError("Database Sync Failed: Permission Denied. Please check your Firestore Security Rules.");
    }
  };

  const handleDeleteEntry = async (id) => {
    if (!authUser) return;
    try { 
      await deleteDoc(doc(db, 'artifacts', appId, 'users', authUser.uid, 'entries', id.toString())); 
      setDbError('');
    } catch (error) { 
      console.error("Error deleting:", error); 
      setDbError("Database Sync Failed: Permission Denied to delete.");
    }
  };

  const handleUpdateSettings = async (newSettings) => {
    setCurrencySettings(newSettings);
    if (!authUser) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', authUser.uid, 'settings', 'displayConfig');
      await setDoc(docRef, newSettings);
    } catch (error) { console.error("Error saving settings:", error); }
  };

  // --- UI HANDLERS ---
  const openEntryModal = (entry = null) => {
    if (entry) {
      setEditingEntry(entry);
      setFormData({ ...entry });
    } else {
      setEditingEntry(null);
      setFormData({ date: todayString, assetName: '', value: 0, liquidity: 'liquid', tangibility: 'tangible', remarks: '' });
    }
    setIsEntryModalOpen(true);
  };

  const openDetailModal = (type) => {
    let data = [], title = '';
    if (type === 'total') { data = currentAssets; title = 'Total Net Worth Breakdown'; }
    else if (type === 'liquid') { data = currentAssets.filter(a => a.liquidity === 'liquid'); title = 'Liquid Assets Breakdown'; }
    else if (type === 'tangible') { data = currentAssets.filter(a => a.tangibility === 'tangible'); title = 'Tangible Assets Breakdown'; }
    setDetailModal({ isOpen: true, title, data: data.sort((a,b) => b.value - a.value), type });
  };

  // --- RENDERERS ---
  
  // LOGIN SCREEN RENDERER
  if (!isLoading && !authUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="bg-slate-900 p-8 text-center">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Wallet className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">NexusWealth</h1>
            <p className="text-slate-400 text-sm">Your personal asset tracking dashboard</p>
          </div>
          
          <div className="p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6 text-center">
              {authMode === 'login' && 'Welcome Back'}
              {authMode === 'signup' && 'Create Your Account'}
              {authMode === 'reset' && 'Reset Your Password'}
            </h2>
            
            {authError && (
              <div className="mb-6 p-3 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm text-center">
                {authError}
              </div>
            )}
            {authMessage && (
              <div className="mb-6 p-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-sm text-center">
                {authMessage}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
                  <input 
                    type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              {authMode !== 'reset' && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-slate-700">Password</label>
                    {authMode === 'login' && (
                      <button 
                        type="button" 
                        onClick={() => switchAuthMode('reset')}
                        className="text-xs text-emerald-600 font-semibold hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
                    <input 
                      type="password" required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg transition-colors mt-6 shadow-sm"
              >
                {authMode === 'login' ? 'Sign In' : authMode === 'signup' ? 'Create Account' : 'Send Reset Link'}
              </button>
            </form>

            <div className="mt-6 flex flex-col items-center gap-3 text-sm text-slate-500">
              {authMode === 'login' ? (
                <div>
                  Don't have an account?{' '}
                  <button type="button" onClick={() => switchAuthMode('signup')} className="text-emerald-600 font-bold hover:underline">
                    Sign up here
                  </button>
                </div>
              ) : (
                <div>
                  Remembered your password?{' '}
                  <button type="button" onClick={() => switchAuthMode('login')} className="text-emerald-600 font-bold hover:underline">
                    Log in instead
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // APP RENDERER
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-slate-600 font-medium">Connecting to secure cloud database...</p>
      </div>
    );
  }

  // --- CUSTOM TOOLTIPS ---
  const TimelineTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const total = payload.find(p => p.dataKey === 'total')?.value || payload.reduce((sum, p) => p.dataKey !== 'total' ? sum + p.value : sum, 0);
      return (
        <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-lg min-w-[200px] text-xs sm:text-sm">
          <p className="text-slate-500 font-medium mb-2 pb-2 border-b border-slate-100">{label}</p>
          <div className="space-y-2">
            {payload.filter(p => p.dataKey !== 'total' && p.value > 0).map((entry, index) => (
              <div key={index} className="flex justify-between items-center text-sm gap-4">
                <span className="flex items-center gap-2 truncate max-w-[120px]"><div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }}></div>{entry.name}</span>
                <span className="font-semibold">{formatCurrency(entry.value)}</span>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-slate-100 flex justify-between items-center text-base">
              <span className="font-semibold text-slate-700">Total</span>
              <span className="font-bold text-slate-900">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomPieTooltip = ({ active, payload, total }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const percent = total > 0 ? ((data.value / total) * 100).toFixed(1) : 0;
      return (
        <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-lg text-xs sm:text-sm z-50">
          <p className="font-semibold text-slate-700 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: data.payload.color || data.payload.fill || '#10b981' }}></span>{data.name}
          </p>
          <p className="text-slate-900 font-bold mt-1 text-sm sm:text-base">{formatCurrency(data.value)} <span className="text-slate-500 font-medium text-xs sm:text-sm">({percent}%)</span></p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900">
      
      {/* MOBILE TOP HEADER */}
      <header className="md:hidden flex justify-between items-center bg-slate-900 text-white p-4 sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-2 font-bold text-xl">
          <Wallet className="w-6 h-6 text-emerald-400" /> NexusWealth
        </div>
        <div className="relative">
          <button 
            onClick={() => setIsLogoutMenuOpen(!isLogoutMenuOpen)}
            className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold uppercase"
          >
            {authUser?.email?.charAt(0) || 'U'}
          </button>
          {isLogoutMenuOpen && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
              <div className="p-3 border-b border-slate-100">
                <p className="text-xs text-slate-500 truncate">{authUser?.email}</p>
              </div>
              <button onClick={handleLogout} className="w-full text-left px-4 py-3 text-red-600 hover:bg-slate-50 flex items-center gap-3 transition-colors font-medium text-sm">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-300 flex-col h-screen sticky top-0">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-400" /> NexusWealth
          </h1>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-slate-800 hover:text-white'}`}>
            <LayoutDashboard className="w-5 h-5" /> Dashboard
          </button>
          <button onClick={() => setActiveTab('analytics')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'analytics' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-slate-800 hover:text-white'}`}>
            <PieChartIcon className="w-5 h-5" /> Analytics
          </button>
          <button onClick={() => setActiveTab('search')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'search' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-slate-800 hover:text-white'}`}>
            <FileText className="w-5 h-5" /> Reports & Search
          </button>
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-slate-800 hover:text-white'}`}>
            <Settings className="w-5 h-5" /> Settings
          </button>
        </nav>
        
        {/* User Menu with functional Logout */}
        <div className="p-4 m-4 bg-slate-800 rounded-xl border border-slate-700 relative select-none">
          {isLogoutMenuOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-10 animate-in fade-in slide-in-from-bottom-2">
              <button onClick={handleLogout} className="w-full text-left px-4 py-3 text-red-400 hover:bg-slate-700 flex items-center gap-3 transition-colors font-medium">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          )}
          <div onClick={() => setIsLogoutMenuOpen(!isLogoutMenuOpen)} className="flex items-center gap-3 cursor-pointer hover:bg-slate-700/50 p-2 -m-2 rounded-lg transition-colors">
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold uppercase shrink-0">
               {authUser?.email?.charAt(0) || 'U'}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-semibold text-white truncate">{authUser?.email?.split('@')[0] || 'User'}</p>
              <p className="text-xs text-slate-400 truncate" title={authUser?.email}>{authUser?.email}</p>
            </div>
            <ChevronUp className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isLogoutMenuOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </aside>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around items-center z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button onClick={() => setActiveTab('dashboard')} className={`p-3 flex flex-col items-center gap-1 flex-1 ${activeTab === 'dashboard' ? 'text-emerald-600' : 'text-slate-400'}`}>
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-medium">Dashboard</span>
        </button>
        <button onClick={() => setActiveTab('analytics')} className={`p-3 flex flex-col items-center gap-1 flex-1 ${activeTab === 'analytics' ? 'text-emerald-600' : 'text-slate-400'}`}>
          <PieChartIcon className="w-5 h-5" />
          <span className="text-[10px] font-medium">Analytics</span>
        </button>
        <button onClick={() => setActiveTab('search')} className={`p-3 flex flex-col items-center gap-1 flex-1 ${activeTab === 'search' ? 'text-emerald-600' : 'text-slate-400'}`}>
          <FileText className="w-5 h-5" />
          <span className="text-[10px] font-medium">Reports</span>
        </button>
        <button onClick={() => setActiveTab('settings')} className={`p-3 flex flex-col items-center gap-1 flex-1 ${activeTab === 'settings' ? 'text-emerald-600' : 'text-slate-400'}`}>
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-medium">Settings</span>
        </button>
      </nav>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-4 pb-24 md:p-8 overflow-y-auto overflow-x-hidden w-full max-w-full">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 md:mb-8 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 capitalize">{activeTab.replace('-', ' ')}</h1>
            <p className="text-xs md:text-sm text-slate-500 flex items-center gap-1 mt-1">
              <Calendar className="w-4 h-4"/> {formattedToday}
            </p>
          </div>
          <button 
            onClick={() => openEntryModal()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" /> Log Asset Entry
          </button>
        </header>

        {/* ADDED: Visual Error Banner so silent failures never happen again */}
        {dbError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex justify-between items-start md:items-center animate-in fade-in">
            <p className="text-sm font-medium">{dbError}</p>
            <button onClick={() => setDbError('')} className="text-red-500 hover:text-red-700 shrink-0 ml-4"><X className="w-5 h-5"/></button>
          </div>
        )}

        {/* --- TABS --- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 md:space-y-8 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              <div onClick={() => openDetailModal('total')} className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-emerald-300 active:bg-slate-50 transition-all cursor-pointer group">
                <div className="flex justify-between items-start mb-2 md:mb-4">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-slate-500 group-hover:text-emerald-600 transition-colors">Total Net Worth</p>
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{formatCurrency(currentMetrics.total)}</h2>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600 shrink-0"><Wallet className="w-5 h-5 md:w-6 md:h-6" /></div>
                </div>
                <p className="text-xs md:text-sm text-slate-400 flex items-center gap-1">Click to view breakdown <ArrowUpRight className="w-3 h-3"/></p>
              </div>

              <div onClick={() => openDetailModal('liquid')} className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 active:bg-slate-50 transition-all cursor-pointer group">
                <div className="flex justify-between items-start mb-2 md:mb-4">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-slate-500 group-hover:text-blue-600 transition-colors">Liquid Assets</p>
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{formatCurrency(currentMetrics.liquid)}</h2>
                  </div>
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 shrink-0"><TrendingUp className="w-5 h-5 md:w-6 md:h-6" /></div>
                </div>
                <p className="text-xs md:text-sm text-slate-400 flex items-center gap-1">Click to view breakdown <ArrowUpRight className="w-3 h-3"/></p>
              </div>

              <div onClick={() => openDetailModal('tangible')} className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-violet-300 active:bg-slate-50 transition-all cursor-pointer group sm:col-span-2 lg:col-span-1">
                <div className="flex justify-between items-start mb-2 md:mb-4">
                  <div>
                    <p className="text-xs md:text-sm font-medium text-slate-500 group-hover:text-violet-600 transition-colors">Tangible Assets</p>
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{formatCurrency(currentMetrics.tangible)}</h2>
                  </div>
                  <div className="p-2 rounded-lg bg-violet-100 text-violet-600 shrink-0"><Building className="w-5 h-5 md:w-6 md:h-6" /></div>
                </div>
                <p className="text-xs md:text-sm text-slate-400 flex items-center gap-1">Click to view breakdown <ArrowUpRight className="w-3 h-3"/></p>
              </div>
            </div>

            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-base md:text-lg font-bold text-slate-900 mb-4 md:mb-6">Net Worth Growth</h3>
              <div className="h-64 md:h-80 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} dy={10} minTickGap={20} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(val) => currencySettings.display === 'USD' ? `$${(val/currencySettings.usdRate/1000).toFixed(0)}k` : `${val/1000}k`} />
                    <RechartsTooltip content={<TimelineTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                    {uniqueAssetNames.map((name) => <Area key={name} type="monotone" dataKey={name} stackId="1" stroke={getAssetColor(name)} fill={getAssetColor(name)} fillOpacity={0.6} />)}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden max-w-full">
              <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                <h3 className="text-base md:text-lg font-bold text-slate-900">Recent Logs</h3>
              </div>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs md:text-sm border-b border-slate-200">
                      <th className="p-3 md:p-4 font-medium whitespace-nowrap">Date</th>
                      <th className="p-3 md:p-4 font-medium whitespace-nowrap">Asset Name</th>
                      <th className="p-3 md:p-4 font-medium text-right whitespace-nowrap">Value Recorded</th>
                      <th className="p-3 md:p-4 font-medium whitespace-nowrap">Type</th>
                      <th className="p-3 md:p-4 font-medium whitespace-nowrap">Remarks</th>
                      <th className="p-3 md:p-4 font-medium text-center whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...entries].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 10).map((entry) => (
                      <tr key={entry.id} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors text-xs md:text-sm">
                        <td className="p-3 md:p-4 text-slate-700 whitespace-nowrap">{entry.date}</td>
                        <td className="p-3 md:p-4 font-medium text-slate-900 whitespace-nowrap">{entry.assetName}</td>
                        <td className="p-3 md:p-4 text-right font-semibold text-emerald-600 whitespace-nowrap">{formatCurrency(entry.value)}</td>
                        <td className="p-3 md:p-4 whitespace-nowrap">
                          <div className="flex gap-2">
                            <span className={`px-2 py-1 rounded text-[10px] md:text-xs ${entry.liquidity === 'liquid' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>{entry.liquidity}</span>
                            <span className={`px-2 py-1 rounded text-[10px] md:text-xs ${entry.tangibility === 'tangible' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-700'}`}>{entry.tangibility}</span>
                          </div>
                        </td>
                        <td className="p-3 md:p-4 text-slate-500 max-w-[150px] truncate" title={entry.remarks}>{entry.remarks || '-'}</td>
                        <td className="p-3 md:p-4 flex justify-center gap-4">
                          <button onClick={() => openEntryModal(entry)} className="text-slate-400 hover:text-blue-600 p-1"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteEntry(entry.id)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                    {entries.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-500 font-medium text-sm">No logs found. Add your first asset to get started!</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6 md:space-y-8 animate-in fade-in duration-300">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 hidden md:block">Portfolio Analytics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {/* Liquidity */}
              <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-base md:text-lg font-bold text-slate-900 mb-4 md:mb-6 text-center">Liquidity Ratio</h3>
                <div className="h-56 md:h-64 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[{ name: 'Liquid Assets', value: currentMetrics.liquid, color: '#3b82f6' }, { name: 'Non-Liquid', value: currentMetrics.nonLiquid, color: '#94a3b8' }]} cx="50%" cy="50%" innerRadius="60%" outerRadius="80%" paddingAngle={5} dataKey="value">
                        {[{color: '#3b82f6'}, {color: '#94a3b8'}].map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Pie>
                      <RechartsTooltip content={<CustomPieTooltip total={currentMetrics.total} />} />
                      <Legend wrapperStyle={{ fontSize: '12px' }}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tangibility */}
              <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-base md:text-lg font-bold text-slate-900 mb-4 md:mb-6 text-center">Tangibility Ratio</h3>
                <div className="h-56 md:h-64 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[{ name: 'Tangible', value: currentMetrics.tangible, color: '#8b5cf6' }, { name: 'Intangible', value: currentMetrics.intangible, color: '#cbd5e1' }]} cx="50%" cy="50%" innerRadius="60%" outerRadius="80%" paddingAngle={5} dataKey="value">
                        {[{color: '#8b5cf6'}, {color: '#cbd5e1'}].map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Pie>
                      <RechartsTooltip content={<CustomPieTooltip total={currentMetrics.total} />} />
                      <Legend wrapperStyle={{ fontSize: '12px' }}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Position Type Analysis */}
              <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-1 md:col-span-2">
                <h3 className="text-base md:text-lg font-bold text-slate-900 mb-4 md:mb-6 text-center">Asset Composition</h3>
                <div className="h-56 md:h-64 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={currentAssets.filter(a => a.value > 0).map(a => ({ name: a.assetName, value: a.value, color: getAssetColor(a.assetName) }))} cx="50%" cy="50%" innerRadius="60%" outerRadius="80%" paddingAngle={2} dataKey="value">
                        {currentAssets.filter(a => a.value > 0).map((entry, index) => <Cell key={`cell-${index}`} fill={getAssetColor(entry.assetName)} />)}
                      </Pie>
                      <RechartsTooltip content={<CustomPieTooltip total={currentMetrics.total} />} />
                      <Legend wrapperStyle={{ fontSize: '12px' }}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'search' && (
           <div className="space-y-6 md:space-y-8 animate-in fade-in duration-300">
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-lg md:text-xl font-bold text-slate-900 mb-4 flex items-center gap-2"><Search className="w-5 h-5"/> Time Report</h2>
              <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input type="date" value={searchParams.start} onChange={e => setSearchParams({...searchParams, start: e.target.value})} className="w-full px-3 py-2 md:px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div className="flex-1 w-full">
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input type="date" value={searchParams.end} onChange={e => setSearchParams({...searchParams, end: e.target.value})} className="w-full px-3 py-2 md:px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200 overflow-hidden max-w-full">
              <h3 className="text-base md:text-lg font-bold text-slate-900 mb-4 md:mb-6">Changes Breakdown</h3>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs md:text-sm border-b border-slate-200">
                      <th className="p-3 md:p-4 font-medium whitespace-nowrap">Asset Name</th>
                      <th className="p-3 md:p-4 font-medium text-right whitespace-nowrap">Start Value</th>
                      <th className="p-3 md:p-4 font-medium text-right whitespace-nowrap">End Value</th>
                      <th className="p-3 md:p-4 font-medium text-right whitespace-nowrap">Net Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.positions.map((pos) => (
                      <tr key={pos.name} className="border-b border-slate-50 text-xs md:text-sm">
                        <td className="p-3 md:p-4 font-medium text-slate-900 whitespace-nowrap">{pos.name}</td>
                        <td className="p-3 md:p-4 text-right text-slate-600 whitespace-nowrap">{formatCurrency(pos.startValue)}</td>
                        <td className="p-3 md:p-4 text-right text-slate-600 whitespace-nowrap">{formatCurrency(pos.endValue)}</td>
                        <td className={`p-3 md:p-4 text-right font-bold whitespace-nowrap ${pos.change > 0 ? 'text-emerald-600' : pos.change < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {pos.change > 0 ? '+' : ''}{formatCurrency(pos.change)}
                        </td>
                      </tr>
                    ))}
                    {searchResults.positions.length === 0 && <tr><td colSpan="4" className="p-6 text-center text-slate-500 text-sm">No data found for this period.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
           <div className="max-w-2xl bg-white p-5 md:p-8 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in duration-300 mx-auto md:mx-0">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Settings className="w-6 h-6 text-slate-400"/> Settings
            </h2>
            
            {/* Account Info Panel for Mobile Verification */}
            <div className="mb-8 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <h3 className="text-sm font-bold text-slate-700 mb-1">Account Connection</h3>
              <p className="text-xs text-slate-500 mb-2">Ensure you are logged into the same account across devices to sync data.</p>
              <div className="flex items-center gap-2 text-sm bg-white p-2 rounded border border-slate-200 overflow-hidden">
                <User className="w-4 h-4 text-slate-400 shrink-0"/> 
                <span className="truncate">{authUser?.email}</span>
              </div>
              <div className="mt-2 text-[10px] font-mono text-slate-400 break-all">UID: {authUser?.uid}</div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Display Currency</label>
                <div className="flex gap-4">
                  <button onClick={() => handleUpdateSettings({...currencySettings, display: 'BDT'})} className={`flex-1 py-3 rounded-xl border-2 font-bold transition-all text-sm md:text-base ${currencySettings.display === 'BDT' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 active:bg-slate-50'}`}>৳ BDT</button>
                  <button onClick={() => handleUpdateSettings({...currencySettings, display: 'USD'})} className={`flex-1 py-3 rounded-xl border-2 font-bold transition-all text-sm md:text-base ${currencySettings.display === 'USD' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 active:bg-slate-50'}`}>$ USD</button>
                </div>
              </div>
              {currencySettings.display === 'USD' && (
                <div className="pt-4 border-t border-slate-100 animate-in slide-in-from-top-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Exchange Rate (1 USD = ? BDT)</label>
                  <input type="number" value={currencySettings.usdRate} onChange={(e) => handleUpdateSettings({...currencySettings, usdRate: Number(e.target.value) || 1})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-base md:text-lg font-medium"/>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* DYNAMIC ENTRY MODAL */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="text-lg md:text-xl font-bold text-slate-900">{editingEntry ? 'Edit Asset Log' : 'Log Asset State'}</h3>
              <button onClick={() => setIsEntryModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5 md:w-6 md:h-6" /></button>
            </div>
            <div className="overflow-y-auto p-4 md:p-6">
              <form id="entryForm" onSubmit={handleSaveEntry} className="space-y-4 md:space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Asset Name</label>
                    <input type="text" required placeholder="e.g., Cash, Gold, Apartment 4B" value={formData.assetName} onChange={e => setFormData({...formData, assetName: e.target.value})} className="w-full px-3 py-2 md:px-4 md:py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" list="asset-suggestions"/>
                    <datalist id="asset-suggestions">{uniqueAssetNames.map(name => <option key={name} value={name} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Current Value (BDT)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 md:top-2.5 text-slate-500 font-bold text-sm">৳</span>
                      <input type="number" required min="0" value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} className="w-full pl-8 pr-3 py-2 md:pr-4 md:py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"/>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Date Logged</label>
                    <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-3 py-2 md:px-4 md:py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"/>
                  </div>
                  <div>
                    <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Liquidity</label>
                    <select value={formData.liquidity} onChange={e => setFormData({...formData, liquidity: e.target.value})} className="w-full px-3 py-2 md:px-4 md:py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                      <option value="liquid">Liquid Asset</option><option value="non-liquid">Non-Liquid Asset</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Tangibility</label>
                    <select value={formData.tangibility} onChange={e => setFormData({...formData, tangibility: e.target.value})} className="w-full px-3 py-2 md:px-4 md:py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                      <option value="tangible">Tangible</option><option value="intangible">Intangible</option>
                    </select>
                  </div>
                </div>
              </form>
            </div>
            <div className="p-4 md:p-6 border-t border-slate-100 flex gap-3 shrink-0 bg-white">
              <button type="button" onClick={() => setIsEntryModalOpen(false)} className="flex-1 px-4 py-2.5 text-slate-700 bg-slate-100 active:bg-slate-200 hover:bg-slate-200 rounded-lg font-medium text-sm transition-colors">Cancel</button>
              <button type="submit" form="entryForm" className="flex-1 px-4 py-2.5 text-white bg-emerald-600 active:bg-emerald-800 hover:bg-emerald-700 rounded-lg font-medium text-sm transition-colors">Save Entry</button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detailModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
            <div className="p-4 md:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="text-base md:text-lg font-bold text-slate-900">{detailModal.title}</h3>
              <button onClick={() => setDetailModal({...detailModal, isOpen: false})} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 md:p-6 overflow-y-auto">
              <ul className="space-y-4">
                {detailModal.data.map((asset, index) => (
                  <li key={index} className="flex justify-between items-center border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                    <div className="overflow-hidden pr-3">
                      <p className="font-semibold text-slate-800 text-sm md:text-base truncate">{asset.assetName}</p>
                      <p className="text-[10px] md:text-xs text-slate-400">Updated: {asset.date}</p>
                    </div>
                    <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-1 md:px-3 rounded-lg text-sm md:text-base shrink-0">
                      {formatCurrency(asset.value)}
                    </span>
                  </li>
                ))}
              </ul>
              {detailModal.data.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No assets found.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}