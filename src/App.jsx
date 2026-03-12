import React, { useState, useMemo, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import { 
  LayoutDashboard, PieChart as PieChartIcon, Search, Plus, 
  Settings, Edit2, Trash2, ArrowUpRight, ArrowDownRight, 
  Wallet, Building, TrendingUp, X, Calendar, ChevronDown, ChevronUp, FileText, LogOut, Loader2
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// --- FIREBASE INITIALIZATION ---
// This uses the environment's built-in cloud storage automatically.
// If you host this externally, replace the fallback object with your own Firebase keys.
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
const appId = 'my-personal-tracker'; // You can leave this as a string

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#14b8a6', '#ef4444', '#f97316', '#06b6d4'];

export default function App() {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [entries, setEntries] = useState([]);
  const [authUser, setAuthUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLogoutMenuOpen, setIsLogoutMenuOpen] = useState(false);
  
  // Settings
  const [currencySettings, setCurrencySettings] = useState({
    base: 'BDT',
    display: 'BDT',
    usdRate: 110 
  });

  // Modals & Forms
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  
  const todayString = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState({
    date: todayString, assetName: '', value: 0, liquidity: 'liquid', tangibility: 'tangible', remarks: ''
  });

  const [detailModal, setDetailModal] = useState({ isOpen: false, title: '', data: [], type: '' });
  const [searchParams, setSearchParams] = useState({ start: '2025-10-01', end: todayString });
  const [expandedDetails, setExpandedDetails] = useState({ liquid: false, tangible: false, position: false });

  // --- FIREBASE AUTH & DATA FETCHING ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Authentication failed:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (!user) setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) return;

    setIsLoading(true);

    // Fetch Entries
    const entriesRef = collection(db, 'artifacts', appId, 'users', authUser.uid, 'entries');
    const unsubscribeEntries = onSnapshot(entriesRef, (snapshot) => {
      const fetchedEntries = [];
      snapshot.forEach((doc) => {
        fetchedEntries.push({ id: doc.id, ...doc.data() });
      });
      setEntries(fetchedEntries);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching entries:", error);
      setIsLoading(false);
    });

    // Fetch Settings
    const settingsRef = collection(db, 'artifacts', appId, 'users', authUser.uid, 'settings');
    const unsubscribeSettings = onSnapshot(settingsRef, (snapshot) => {
      snapshot.forEach(doc => {
        if (doc.id === 'displayConfig') {
          setCurrencySettings(doc.data());
        }
      });
    }, (error) => {
      console.error("Error fetching settings:", error);
    });

    return () => {
      unsubscribeEntries();
      unsubscribeSettings();
    };
  }, [authUser]);

  // --- DERIVED DATA & LOGIC ---
  const uniqueAssetNames = useMemo(() => Array.from(new Set(entries.map(e => e.assetName))), [entries]);
  const getAssetColor = (name) => COLORS[uniqueAssetNames.indexOf(name) % COLORS.length];

  const formatCurrency = (val) => {
    if (val === undefined || val === null) return '';
    const converted = currencySettings.display === 'USD' ? val / currencySettings.usdRate : val;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencySettings.display,
      maximumFractionDigits: currencySettings.display === 'USD' ? 2 : 0
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
      uniqueAssetNames.forEach(name => {
        if (dataPoint[name] === undefined) dataPoint[name] = 0;
      });
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
      return {
        name,
        startValue: startVal,
        endValue: endVal,
        change: endVal - startVal
      };
    });

    return { startMetrics, endMetrics, positions, filteredTimeline };
  }, [entries, searchParams, timelineData]);

  const formattedToday = useMemo(() => {
    const d = new Date();
    const day = d.getDate();
    const month = d.toLocaleString('default', { month: 'long' });
    const year = d.getFullYear();
    const weekday = d.toLocaleString('default', { weekday: 'long' });
    return `${day} ${month} ${year} (${weekday})`;
  }, []);

  // --- DATABASE WRITE HANDLERS ---
  const handleSaveEntry = async (e) => {
    e.preventDefault();
    if (!authUser) return;

    const entryId = editingEntry ? editingEntry.id : Date.now().toString();
    const newEntry = { 
      ...formData, 
      id: entryId, 
      value: Number(formData.value) 
    };

    try {
      const docRef = doc(db, 'artifacts', appId, 'users', authUser.uid, 'entries', entryId);
      await setDoc(docRef, newEntry);
      setIsEntryModalOpen(false);
    } catch (error) {
      console.error("Error saving to database:", error);
    }
  };

  const handleDeleteEntry = async (id) => {
    if (!authUser) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', authUser.uid, 'entries', id.toString()));
    } catch (error) {
      console.error("Error deleting from database:", error);
    }
  };

  const handleUpdateSettings = async (newSettings) => {
    // Optimistic UI update
    setCurrencySettings(newSettings);
    if (!authUser) return;

    try {
      const docRef = doc(db, 'artifacts', appId, 'users', authUser.uid, 'settings', 'displayConfig');
      await setDoc(docRef, newSettings);
    } catch (error) {
      console.error("Error saving settings to database:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsLogoutMenuOpen(false);
    } catch (error) {
      console.error("Logout error:", error);
    }
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


  // --- CUSTOM TOOLTIPS ---
  const TimelineTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const total = payload.find(p => p.dataKey === 'total')?.value || payload.reduce((sum, p) => p.dataKey !== 'total' ? sum + p.value : sum, 0);
      return (
        <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-lg min-w-[250px]">
          <p className="text-slate-500 font-medium mb-2 pb-2 border-b border-slate-100">{label}</p>
          <div className="space-y-2">
            {payload.filter(p => p.dataKey !== 'total' && p.value > 0).map((entry, index) => (
              <div key={index} className="flex justify-between items-center text-sm">
                <span className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                  {entry.name}
                </span>
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
        <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-lg text-sm z-50">
          <p className="font-semibold text-slate-700 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: data.payload.color || data.payload.fill || '#10b981' }}></span>
            {data.name}
          </p>
          <p className="text-slate-900 font-bold mt-1 text-base">
            {formatCurrency(data.value)} <span className="text-slate-500 font-medium text-sm">({percent}%)</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // --- RENDERERS FOR TABS ---
  const renderDashboard = () => (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={() => openDetailModal('total')}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500 group-hover:text-emerald-600 transition-colors">Total Net Worth</p>
              <h2 className="text-3xl font-bold text-slate-900 mt-1">{formatCurrency(currentMetrics.total)}</h2>
            </div>
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
              <Wallet className="w-6 h-6" />
            </div>
          </div>
          <p className="text-sm text-slate-400 flex items-center gap-1">Click to view breakdown <ArrowUpRight className="w-3 h-3"/></p>
        </div>

        <div 
          onClick={() => openDetailModal('liquid')}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500 group-hover:text-blue-600 transition-colors">Liquid Assets</p>
              <h2 className="text-3xl font-bold text-slate-900 mt-1">{formatCurrency(currentMetrics.liquid)}</h2>
            </div>
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <p className="text-sm text-slate-400 flex items-center gap-1">Click to view breakdown <ArrowUpRight className="w-3 h-3"/></p>
        </div>

        <div 
          onClick={() => openDetailModal('tangible')}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-violet-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500 group-hover:text-violet-600 transition-colors">Tangible Assets</p>
              <h2 className="text-3xl font-bold text-slate-900 mt-1">{formatCurrency(currentMetrics.tangible)}</h2>
            </div>
            <div className="p-2 rounded-lg bg-violet-100 text-violet-600">
              <Building className="w-6 h-6" />
            </div>
          </div>
          <p className="text-sm text-slate-400 flex items-center gap-1">Click to view breakdown <ArrowUpRight className="w-3 h-3"/></p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-slate-900">Net Worth Growth & Composition</h3>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
              <YAxis 
                axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }}
                tickFormatter={(val) => currencySettings.display === 'USD' ? `$${(val/currencySettings.usdRate/1000).toFixed(1)}k` : `${val/1000}k`}
              />
              <RechartsTooltip content={<TimelineTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
              {uniqueAssetNames.map((name) => (
                <Area key={name} type="monotone" dataKey={name} stackId="1" stroke={getAssetColor(name)} fill={getAssetColor(name)} fillOpacity={0.6} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
          <h3 className="text-lg font-bold text-slate-900">Recent Logs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Asset Name</th>
                <th className="p-4 font-medium text-right">Value Recorded</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Remarks</th>
                <th className="p-4 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...entries].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 10).map((entry) => (
                <tr key={entry.id} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors text-sm">
                  <td className="p-4 text-slate-700 whitespace-nowrap">{entry.date}</td>
                  <td className="p-4 font-medium text-slate-900">{entry.assetName}</td>
                  <td className="p-4 text-right font-semibold text-emerald-600">{formatCurrency(entry.value)}</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded text-xs ${entry.liquidity === 'liquid' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>{entry.liquidity}</span>
                      <span className={`px-2 py-1 rounded text-xs ${entry.tangibility === 'tangible' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-700'}`}>{entry.tangibility}</span>
                    </div>
                  </td>
                  <td className="p-4 text-slate-500 max-w-[200px] truncate" title={entry.remarks}>{entry.remarks || '-'}</td>
                  <td className="p-4 flex justify-center gap-3">
                    <button onClick={() => openEntryModal(entry)} className="text-slate-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDeleteEntry(entry.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500 font-medium">
                    No logs found. Add your first asset to get started!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderAnalytics = () => {
    const liqPercent = currentMetrics.total ? ((currentMetrics.liquid / currentMetrics.total) * 100).toFixed(1) : 0;
    const nonLiqPercent = currentMetrics.total ? ((currentMetrics.nonLiquid / currentMetrics.total) * 100).toFixed(1) : 0;
    const liqData = [
      { name: 'Liquid Assets', value: currentMetrics.liquid, color: '#3b82f6' },
      { name: 'Non-Liquid Assets', value: currentMetrics.nonLiquid, color: '#94a3b8' }
    ];

    const tangPercent = currentMetrics.total ? ((currentMetrics.tangible / currentMetrics.total) * 100).toFixed(1) : 0;
    const intangPercent = currentMetrics.total ? ((currentMetrics.intangible / currentMetrics.total) * 100).toFixed(1) : 0;
    const tangData = [
      { name: 'Tangible Assets', value: currentMetrics.tangible, color: '#8b5cf6' },
      { name: 'Intangible Assets', value: currentMetrics.intangible, color: '#cbd5e1' }
    ];

    const positionData = currentAssets
      .filter(a => a.value > 0)
      .map(a => ({
        name: a.assetName,
        value: a.value,
        color: getAssetColor(a.assetName)
      }))
      .sort((a, b) => b.value - a.value);

    return (
      <div className="space-y-8 animate-in fade-in duration-300">
        <h2 className="text-2xl font-bold text-slate-900">Portfolio Analytics</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          
          {/* LIQUIDITY ANALYSIS */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-6 text-center">Liquidity Ratio</h3>
            <div className="h-64 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={liqData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {liqData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <RechartsTooltip content={<CustomPieTooltip total={currentMetrics.total} />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center mb-6">
              <p className="text-2xl font-bold text-blue-600">{liqPercent}% Liquid</p>
              <p className="text-sm text-slate-500">{nonLiqPercent}% Non-Liquid</p>
            </div>
            
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <button 
                onClick={() => setExpandedDetails(p => ({...p, liquid: !p.liquid}))}
                className="w-full flex justify-between items-center p-4 bg-slate-50 hover:bg-slate-100 transition-colors font-medium text-slate-700"
              >
                View Liquidity Details
                {expandedDetails.liquid ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
              </button>
              {expandedDetails.liquid && (
                <div className="p-4 bg-white border-t border-slate-100">
                  <h4 className="font-semibold text-slate-800 mb-3 border-b pb-2">Liquid ({currentAssets.filter(a => a.liquidity === 'liquid').length})</h4>
                  <ul className="space-y-2 mb-6 text-sm">
                    {currentAssets.filter(a => a.liquidity === 'liquid').map(a => (
                      <li key={a.assetName} className="flex justify-between">
                        <span className="text-slate-600">{a.assetName}</span>
                        <span className="font-medium text-slate-900">{formatCurrency(a.value)}</span>
                      </li>
                    ))}
                  </ul>
                  <h4 className="font-semibold text-slate-800 mb-3 border-b pb-2">Non-Liquid ({currentAssets.filter(a => a.liquidity === 'non-liquid').length})</h4>
                  <ul className="space-y-2 text-sm">
                    {currentAssets.filter(a => a.liquidity === 'non-liquid').map(a => (
                      <li key={a.assetName} className="flex justify-between">
                        <span className="text-slate-600">{a.assetName}</span>
                        <span className="font-medium text-slate-900">{formatCurrency(a.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* TANGIBILITY ANALYSIS */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-6 text-center">Tangibility Ratio</h3>
            <div className="h-64 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={tangData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {tangData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <RechartsTooltip content={<CustomPieTooltip total={currentMetrics.total} />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center mb-6">
              <p className="text-2xl font-bold text-violet-600">{tangPercent}% Tangible</p>
              <p className="text-sm text-slate-500">{intangPercent}% Intangible</p>
            </div>
            
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <button 
                onClick={() => setExpandedDetails(p => ({...p, tangible: !p.tangible}))}
                className="w-full flex justify-between items-center p-4 bg-slate-50 hover:bg-slate-100 transition-colors font-medium text-slate-700"
              >
                View Tangibility Details
                {expandedDetails.tangible ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
              </button>
              {expandedDetails.tangible && (
                <div className="p-4 bg-white border-t border-slate-100">
                  <h4 className="font-semibold text-slate-800 mb-3 border-b pb-2">Tangible ({currentAssets.filter(a => a.tangibility === 'tangible').length})</h4>
                  <ul className="space-y-2 mb-6 text-sm">
                    {currentAssets.filter(a => a.tangibility === 'tangible').map(a => (
                      <li key={a.assetName} className="flex justify-between">
                        <span className="text-slate-600">{a.assetName}</span>
                        <span className="font-medium text-slate-900">{formatCurrency(a.value)}</span>
                      </li>
                    ))}
                  </ul>
                  <h4 className="font-semibold text-slate-800 mb-3 border-b pb-2">Intangible ({currentAssets.filter(a => a.tangibility === 'intangible').length})</h4>
                  <ul className="space-y-2 text-sm">
                    {currentAssets.filter(a => a.tangibility === 'intangible').map(a => (
                      <li key={a.assetName} className="flex justify-between">
                        <span className="text-slate-600">{a.assetName}</span>
                        <span className="font-medium text-slate-900">{formatCurrency(a.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* POSITION TYPE ANALYSIS */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-6 text-center">Asset Position Ratio</h3>
            <div className="h-64 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={positionData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                    {positionData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <RechartsTooltip content={<CustomPieTooltip total={currentMetrics.total} />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center mb-6">
              <p className="text-lg font-bold text-slate-800">Composition Breakdown</p>
              <p className="text-sm text-slate-500">Across {positionData.length} distinct assets</p>
            </div>
            
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <button 
                onClick={() => setExpandedDetails(p => ({...p, position: !p.position}))}
                className="w-full flex justify-between items-center p-4 bg-slate-50 hover:bg-slate-100 transition-colors font-medium text-slate-700"
              >
                View Position Details
                {expandedDetails.position ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
              </button>
              {expandedDetails.position && (
                <div className="p-4 bg-white border-t border-slate-100">
                  <ul className="space-y-2 text-sm">
                    {positionData.map((a, index) => (
                      <li key={index} className="flex justify-between items-center">
                        <span className="text-slate-600 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }}></span>
                          {a.name}
                        </span>
                        <div className="text-right">
                          <span className="font-medium text-slate-900 block">{formatCurrency(a.value)}</span>
                          <span className="text-xs text-slate-400 block">{((a.value / currentMetrics.total) * 100).toFixed(1)}%</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    );
  };

  const renderSearch = () => (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2"><Search className="w-5 h-5"/> Comprehensive Time Report</h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
            <input 
              type="date" 
              value={searchParams.start} 
              onChange={e => setSearchParams({...searchParams, start: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
            <input 
              type="date" 
              value={searchParams.end} 
              onChange={e => setSearchParams({...searchParams, end: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl">
          <h3 className="text-emerald-800 font-semibold mb-2">Position on {searchParams.start}</h3>
          <p className="text-3xl font-bold text-emerald-900">{formatCurrency(searchResults.startMetrics.total)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl">
          <h3 className="text-blue-800 font-semibold mb-2">Position on {searchParams.end}</h3>
          <p className="text-3xl font-bold text-blue-900">{formatCurrency(searchResults.endMetrics.total)}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Asset Changes Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="p-4 font-medium">Asset Name</th>
                <th className="p-4 font-medium text-right">Start Value</th>
                <th className="p-4 font-medium text-right">End Value</th>
                <th className="p-4 font-medium text-right">Net Change</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.positions.map((pos) => (
                <tr key={pos.name} className="border-b border-slate-50 text-sm">
                  <td className="p-4 font-medium text-slate-900">{pos.name}</td>
                  <td className="p-4 text-right text-slate-600">{formatCurrency(pos.startValue)}</td>
                  <td className="p-4 text-right text-slate-600">{formatCurrency(pos.endValue)}</td>
                  <td className={`p-4 text-right font-bold ${pos.change > 0 ? 'text-emerald-600' : pos.change < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                    {pos.change > 0 ? '+' : ''}{formatCurrency(pos.change)}
                  </td>
                </tr>
              ))}
              {searchResults.positions.length === 0 && <tr><td colSpan="4" className="p-4 text-center text-slate-500">No data for this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      
      {searchResults.filteredTimeline.length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={searchResults.filteredTimeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tickFormatter={(val) => `${val/1000}k`} tick={{ fill: '#64748b', fontSize: 12 }} />
              <RechartsTooltip content={<TimelineTooltip />} />
              {uniqueAssetNames.map((name) => (
                <Area key={name} type="monotone" dataKey={name} stackId="1" stroke={getAssetColor(name)} fill={getAssetColor(name)} fillOpacity={0.6} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  const renderSettings = () => (
    <div className="max-w-2xl bg-white p-8 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in duration-300">
      <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
        <Settings className="w-6 h-6 text-slate-400"/> Settings
      </h2>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Display Currency</label>
          <p className="text-sm text-slate-500 mb-4">Choose which currency to view your dashboard in. Base values are always stored in BDT.</p>
          <div className="flex gap-4">
            <button 
              onClick={() => handleUpdateSettings({...currencySettings, display: 'BDT'})}
              className={`flex-1 py-3 rounded-xl border-2 font-bold transition-all ${currencySettings.display === 'BDT' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
            >
              ৳ BDT
            </button>
            <button 
              onClick={() => handleUpdateSettings({...currencySettings, display: 'USD'})}
              className={`flex-1 py-3 rounded-xl border-2 font-bold transition-all ${currencySettings.display === 'USD' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
            >
              $ USD
            </button>
          </div>
        </div>

        {currencySettings.display === 'USD' && (
          <div className="pt-4 border-t border-slate-100 animate-in slide-in-from-top-2">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Exchange Rate (1 USD = ? BDT)</label>
            <input 
              type="number" 
              value={currencySettings.usdRate}
              onChange={(e) => handleUpdateSettings({...currencySettings, usdRate: Number(e.target.value) || 1})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-lg font-medium"
            />
          </div>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-slate-600 font-medium">Connecting to secure cloud database...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen sticky top-0">
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
              <button 
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 text-red-400 hover:bg-slate-700 flex items-center gap-3 transition-colors font-medium"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          )}
          <div 
            onClick={() => setIsLogoutMenuOpen(!isLogoutMenuOpen)}
            className="flex items-center gap-3 cursor-pointer hover:bg-slate-700/50 p-2 -m-2 rounded-lg transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold">
               {authUser ? (authUser.displayName?.charAt(0) || 'U') : 'G'}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-semibold text-white truncate">
                 {authUser ? (authUser.displayName || 'Cloud User') : 'Guest'}
              </p>
              <p className="text-xs text-slate-400 truncate" title={authUser?.uid}>
                 ID: {authUser?.uid ? authUser.uid.substring(0,8) + '...' : 'Not connected'}
              </p>
            </div>
            <ChevronUp className={`w-4 h-4 text-slate-400 transition-transform ${isLogoutMenuOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 capitalize">{activeTab.replace('-', ' ')}</h1>
            <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
              <Calendar className="w-4 h-4"/> {formattedToday}
            </p>
          </div>
          <button 
            onClick={() => openEntryModal()}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" /> Log Asset Entry
          </button>
        </header>

        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'analytics' && renderAnalytics()}
        {activeTab === 'search' && renderSearch()}
        {activeTab === 'settings' && renderSettings()}
      </main>

      {/* DYNAMIC ENTRY MODAL */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-bold text-slate-900">{editingEntry ? 'Edit Asset Log' : 'Log Asset State'}</h3>
              <button onClick={() => setIsEntryModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSaveEntry} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Asset Name</label>
                  <input 
                    type="text" required placeholder="e.g., Cash, Gold, Apartment 4B"
                    value={formData.assetName} onChange={e => setFormData({...formData, assetName: e.target.value})}
                    className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    list="asset-suggestions"
                  />
                  <datalist id="asset-suggestions">
                    {uniqueAssetNames.map(name => <option key={name} value={name} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Current Value (BDT)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-500 font-bold">৳</span>
                    <input 
                      type="number" required min="0"
                      value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})}
                      className="w-full pl-8 pr-4 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date Logged</label>
                  <input 
                    type="date" required
                    value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})}
                    className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Liquidity</label>
                  <select 
                    value={formData.liquidity} onChange={e => setFormData({...formData, liquidity: e.target.value})}
                    className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="liquid">Liquid Asset</option>
                    <option value="non-liquid">Non-Liquid Asset</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tangibility</label>
                  <select 
                    value={formData.tangibility} onChange={e => setFormData({...formData, tangibility: e.target.value})}
                    className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="tangible">Tangible</option>
                    <option value="intangible">Intangible</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Remarks (Optional)</label>
                  <textarea 
                    rows="2" placeholder="Note about this valuation..."
                    value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})}
                    className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  />
                </div>
              </div>
              <div className="pt-4 flex gap-3 mt-2">
                <button type="button" onClick={() => setIsEntryModalOpen(false)} className="flex-1 px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium">Save Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detailModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900">{detailModal.title}</h3>
              <button onClick={() => setDetailModal({...detailModal, isOpen: false})} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {detailModal.data.length === 0 ? (
                <p className="text-center text-slate-500 py-4">No assets found for this category.</p>
              ) : (
                <ul className="space-y-4">
                  {detailModal.data.map((asset, index) => (
                    <li key={index} className="flex justify-between items-center border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="font-semibold text-slate-800">{asset.assetName}</p>
                        <p className="text-xs text-slate-400">Last updated: {asset.date}</p>
                      </div>
                      <span className="font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg">
                        {formatCurrency(asset.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <span className="font-medium text-slate-600">Total Sum:</span>
              <span className="font-bold text-lg text-emerald-600">
                {formatCurrency(detailModal.data.reduce((sum, item) => sum + item.value, 0))}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}