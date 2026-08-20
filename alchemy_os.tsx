import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { Home, PenTool, Lightbulb, Library, Settings, BookOpen, Clock, Loader2, CheckCircle2, AlertCircle, ChevronRight, Menu, X, Plus } from 'lucide-react';

// --- Firebase Initialization ---
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'alchemy-os';

// --- Theme & Styles ---
const theme = {
  bg: 'bg-stone-50',
  surface: 'bg-white',
  textMain: 'text-stone-800',
  textMuted: 'text-stone-500',
  border: 'border-stone-200',
  primary: 'bg-stone-800 hover:bg-stone-900 text-white',
  primaryLight: 'bg-stone-100 text-stone-800',
  accent: 'bg-sage-600 hover:bg-sage-700 text-white', // Assuming a custom sage color, using similar tailwind defaults
  accentSoft: 'bg-emerald-50 text-emerald-800',
};

// --- Helper: Get Current Month ID ---
const getCurrentMonthId = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// --- UI Components ---
const Toast = ({ message, type = 'info', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    info: 'bg-stone-800 text-white',
    success: 'bg-emerald-800 text-white',
    error: 'bg-red-800 text-white'
  };

  return (
    <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg flex items-center gap-3 z-50 animate-in slide-in-from-bottom-5 ${colors[type]}`}>
      {type === 'success' && <CheckCircle2 size={18} />}
      {type === 'error' && <AlertCircle size={18} />}
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
};

const ProgressBar = ({ current, max, label }) => {
  const percentage = Math.min(100, Math.max(0, (current / max) * 100));
  return (
    <div className="w-full">
      <div className="flex justify-between text-sm mb-2">
        <span className="font-medium text-stone-700">{label}</span>
        <span className="text-stone-500">{current} / {max}</span>
      </div>
      <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden">
        <div 
          className="h-full bg-stone-800 transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

const Card = ({ children, className = "" }) => (
  <div className={`bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = 'primary', disabled, isLoading, className = "" }) => {
  const baseStyle = "inline-flex items-center justify-center px-4 py-2 rounded-md font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-stone-800 text-white hover:bg-stone-900 border border-transparent",
    secondary: "bg-white text-stone-700 hover:bg-stone-50 border border-stone-300",
    ghost: "bg-transparent text-stone-600 hover:bg-stone-100 border border-transparent",
  };
  
  return (
    <button 
      onClick={onClick} 
      disabled={disabled || isLoading} 
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
};

const Input = ({ label, type="text", ...props }) => (
  <div className="mb-4">
    {label && <label className="block text-sm font-medium text-stone-700 mb-1">{label}</label>}
    <input 
      type={type}
      className="w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 bg-white"
      {...props}
    />
  </div>
);

const Textarea = ({ label, ...props }) => (
  <div className="mb-4">
    {label && <label className="block text-sm font-medium text-stone-700 mb-1">{label}</label>}
    <textarea 
      className="w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 bg-white min-h-[100px]"
      {...props}
    />
  </div>
);

// --- API Handlers ---
const generateContent = async (prompt, systemInstruction, schema) => {
  const apiKey = ""; // Canvas handles this
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text);
  } catch (error) {
    console.error("Generation failed:", error);
    throw error;
  }
};

// --- Main Application Component ---
export default function AlchemyOS() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Data States
  const [usage, setUsage] = useState({ topicsUsed: 0, businessIdeasUsed: 0 });
  const [brandBrain, setBrandBrain] = useState(null);
  const [services, setServices] = useState([]);
  
  // App Constants
  const LIMITS = { TOPICS: 8, IDEAS: 2 };
  
  const showToast = (message, type = 'info') => setToast({ message, type });

  // 1. Authentication
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Data Fetching (Listeners)
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const monthId = getCurrentMonthId();

    // Listen to current month's usage
    const usageRef = doc(db, 'artifacts', appId, 'users', uid, 'usage', monthId);
    const unsubUsage = onSnapshot(usageRef, (docSnap) => {
      if (docSnap.exists()) {
        setUsage(docSnap.data());
      } else {
        // Initialize month if not exists
        setDoc(usageRef, { topicsUsed: 0, businessIdeasUsed: 0, month: monthId });
        setUsage({ topicsUsed: 0, businessIdeasUsed: 0 });
      }
    }, (err) => console.error("Usage listen error:", err));

    // Listen to Brand Brain
    const brandRef = doc(db, 'artifacts', appId, 'users', uid, 'config', 'brandBrain');
    const unsubBrand = onSnapshot(brandRef, (docSnap) => {
      if (docSnap.exists()) {
        setBrandBrain(docSnap.data());
      } else {
        const defaultBrand = {
          name: 'Priti Jain',
          tone: 'Calm, Deep, Warm, Reflective, Spiritual, Grounded',
          energy: 'Soft authority. Meaningful conversation rather than teaching from a stage.',
          expertise: 'Emotional healing, pattern recognition, spiritual growth',
          audience: 'Women feeling emotionally stuck or repeating patterns'
        };
        setDoc(brandRef, defaultBrand);
        setBrandBrain(defaultBrand);
      }
    });

    // Listen to Services
    const servicesRef = collection(db, 'artifacts', appId, 'users', uid, 'services');
    const unsubServices = onSnapshot(servicesRef, (snapshot) => {
      const svcs = [];
      snapshot.forEach(doc => svcs.push({ id: doc.id, ...doc.data() }));
      setServices(svcs);
    });

    return () => { unsubUsage(); unsubBrand(); unsubServices(); };
  }, [user]);

  // --- Views ---
  const DashboardView = () => (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-serif text-stone-900 mb-2">Welcome, Priti.</h1>
        <p className="text-stone-500">Create meaningful content. Build meaningful experiences.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-stone-100 rounded-lg"><PenTool className="text-stone-700" size={24} /></div>
            <h2 className="text-xl font-medium">Content Studio</h2>
          </div>
          <ProgressBar current={usage.topicsUsed} max={LIMITS.TOPICS} label="Topics Used This Month" />
          <div className="mt-4 flex justify-between items-center">
            <p className="text-sm text-stone-500">
              {LIMITS.TOPICS - usage.topicsUsed} topics remaining
            </p>
            <Button onClick={() => setCurrentView('script-studio')} disabled={usage.topicsUsed >= LIMITS.TOPICS}>
              Create Scripts
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-stone-100 rounded-lg"><Lightbulb className="text-stone-700" size={24} /></div>
            <h2 className="text-xl font-medium">Business Studio</h2>
          </div>
          <ProgressBar current={usage.businessIdeasUsed} max={LIMITS.IDEAS} label="Ideas Generated This Month" />
          <div className="mt-4 flex justify-between items-center">
            <p className="text-sm text-stone-500">
              {LIMITS.IDEAS - usage.businessIdeasUsed} ideas remaining
            </p>
            <Button onClick={() => setCurrentView('business-studio')} disabled={usage.businessIdeasUsed >= LIMITS.IDEAS}>
              Develop Idea
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );

  const ScriptStudioView = () => {
    const [topic, setTopic] = useState('');
    const [intention, setIntention] = useState('Awareness');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedScripts, setGeneratedScripts] = useState(null);
    const [selectedScriptId, setSelectedScriptId] = useState(null);

    const handleGenerate = async () => {
      if (usage.topicsUsed >= LIMITS.TOPICS) {
        showToast("Monthly topic limit reached.", "error");
        return;
      }
      if (!topic.trim()) {
        showToast("Please enter a topic.", "error");
        return;
      }

      setIsGenerating(true);
      try {
        const sysInstruction = `You are the core content brain for ${brandBrain?.name}. 
        Brand Tone: ${brandBrain?.tone}. 
        Brand Energy: ${brandBrain?.energy}.
        Expertise: ${brandBrain?.expertise}.
        
        TASK: Generate EXACTLY 10 highly distinct, premium script options for the user's topic. 
        Each option MUST use a completely different creative angle (e.g., Personal Story, Contrarian, Question-led, Emotional realization).
        Never sound generic, preachy, or like a standard AI template. Avoid lists unless necessary.
        Use soft authority. Pause. Reflect. Feel.
        Do NOT invent services. If a CTA suggests a service, make it vague or refer to general healing if no specific service matches perfectly.`;

        const schema = {
          type: "OBJECT",
          properties: {
            scripts: {
              type: "ARRAY",
              description: "Must contain exactly 10 script options.",
              items: {
                type: "OBJECT",
                properties: {
                  id: { type: "INTEGER" },
                  angle: { type: "STRING", description: "The creative angle (e.g., Emotional Realization)" },
                  hook: { type: "STRING", description: "First 3 seconds" },
                  body: { type: "STRING", description: "The core script" },
                  cta: { type: "STRING", description: "Natural, organic call to action" },
                  visual_direction: { type: "STRING" }
                },
                required: ["id", "angle", "hook", "body", "cta", "visual_direction"]
              }
            }
          },
          required: ["scripts"]
        };

        const result = await generateContent(`Topic: ${topic}\nIntention: ${intention}`, sysInstruction, schema);
        
        if (result && result.scripts && result.scripts.length === 10) {
          setGeneratedScripts(result.scripts);
          
          // Increment Usage Safely (In production, use Firestore Transactions. Doing it client-side for this environment constraints)
          const monthId = getCurrentMonthId();
          const usageRef = doc(db, 'artifacts', appId, 'users', user.uid, 'usage', monthId);
          await setDoc(usageRef, { topicsUsed: usage.topicsUsed + 1 }, { merge: true });
          
          showToast("Generated 10 script options successfully.", "success");
        } else {
           showToast("Generation failed to produce exactly 10 options. Please try again.", "error");
        }
      } catch (err) {
        showToast("Failed to generate scripts.", "error");
        console.error(err);
      } finally {
        setIsGenerating(false);
      }
    };

    const handleSelectScript = async (script) => {
      setSelectedScriptId(script.id);
      try {
        const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'selectedScripts'), {
          ...script,
          topic,
          intention,
          month: getCurrentMonthId(),
          createdAt: serverTimestamp()
        });
        showToast("Script saved to history.", "success");
      } catch (err) {
        showToast("Failed to save script.", "error");
      }
    };

    if (usage.topicsUsed >= LIMITS.TOPICS && !generatedScripts) {
      return (
        <div className="max-w-2xl mx-auto text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-stone-100 mb-6">
            <AlertCircle className="text-stone-500" size={32} />
          </div>
          <h2 className="text-2xl font-serif mb-4">Content Limit Reached</h2>
          <p className="text-stone-600 mb-8">
            Your content planning limit for this month is complete. 
            You have explored all {LIMITS.TOPICS} topics available for this month. 
            Your next topic slot will open next month.
          </p>
          <Button onClick={() => setCurrentView('history')} variant="secondary">View Past Scripts</Button>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto animate-in fade-in">
        <h1 className="text-3xl font-serif mb-8">Script Studio</h1>
        
        {!generatedScripts ? (
          <Card className="p-6 md:p-8">
            <Textarea 
              label="What's on your mind? (Enter a topic)" 
              placeholder="e.g., Why do we keep repeating the same relationship patterns?"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <div className="mb-6">
              <label className="block text-sm font-medium text-stone-700 mb-1">Content Intention</label>
              <select 
                className="w-full rounded-md border border-stone-300 px-3 py-2 bg-white"
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
              >
                {['Awareness', 'Emotional connection', 'Education', 'Storytelling', 'Personal insight'].map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-stone-100">
              <span className="text-sm text-stone-500">
                This will use 1 of your {LIMITS.TOPICS - usage.topicsUsed} remaining topic slots.
              </span>
              <Button onClick={handleGenerate} isLoading={isGenerating}>
                Generate 10 Scripts
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-medium">10 Options for: "{topic}"</h2>
              <Button variant="ghost" onClick={() => { setGeneratedScripts(null); setTopic(''); }}>
                Start New Topic
              </Button>
            </div>
            
            <div className="grid gap-6">
              {generatedScripts.map((script) => (
                <Card key={script.id} className={`p-6 transition-all ${selectedScriptId === script.id ? 'ring-2 ring-stone-800' : ''}`}>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-500 bg-stone-100 px-2 py-1 rounded">
                      Angle: {script.angle}
                    </span>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Hook</h4>
                      <p className="font-medium text-lg">{script.hook}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Body</h4>
                      <p className="text-stone-700 whitespace-pre-wrap">{script.body}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 bg-stone-50 p-4 rounded-lg">
                      <div>
                        <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Visual</h4>
                        <p className="text-sm text-stone-600">{script.visual_direction}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">CTA</h4>
                        <p className="text-sm text-stone-600">{script.cta}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end">
                    <Button 
                      variant={selectedScriptId === script.id ? 'secondary' : 'primary'}
                      onClick={() => handleSelectScript(script)}
                      disabled={selectedScriptId !== null && selectedScriptId !== script.id}
                    >
                      {selectedScriptId === script.id ? 'Selected & Saved' : 'Select This Script'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const BusinessStudioView = () => {
    const [ideaInput, setIdeaInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedIdeas, setGeneratedIdeas] = useState(null);
    const [selectedIdea, setSelectedIdea] = useState(null);
    const [builtWorkshop, setBuiltWorkshop] = useState(null);
    const [isBuilding, setIsBuilding] = useState(false);

    const handleGenerate = async () => {
      if (usage.businessIdeasUsed >= LIMITS.IDEAS) {
        showToast("Monthly business idea limit reached.", "error");
        return;
      }
      if (!ideaInput.trim()) return;

      setIsGenerating(true);
      try {
        const sysInstruction = `You are a strategic business architect for ${brandBrain?.name}.
        Analyze the user's idea/problem space and generate EXACTLY 2 distinct, highly actionable business ideas (Workshops, Classes, or Programs).
        These MUST be grounded in her expertise: ${brandBrain?.expertise}.
        Do not suggest random businesses. Connect them to her audience: ${brandBrain?.audience}.`;

        const schema = {
          type: "OBJECT",
          properties: {
            ideas: {
              type: "ARRAY",
              description: "Must contain exactly 2 business ideas.",
              items: {
                type: "OBJECT",
                properties: {
                  id: { type: "STRING" },
                  name: { type: "STRING" },
                  type: { type: "STRING", description: "Workshop / Class / Program" },
                  audience: { type: "STRING" },
                  problem: { type: "STRING" },
                  promise: { type: "STRING" },
                  format: { type: "STRING" },
                  duration: { type: "STRING" },
                  whyItFits: { type: "STRING" }
                },
                required: ["id", "name", "type", "audience", "problem", "promise", "format", "whyItFits"]
              }
            }
          },
          required: ["ideas"]
        };

        const result = await generateContent(`User Idea: ${ideaInput}\nExisting Services context available internally.`, sysInstruction, schema);
        
        if (result && result.ideas && result.ideas.length === 2) {
          setGeneratedIdeas(result.ideas);
          const monthId = getCurrentMonthId();
          const usageRef = doc(db, 'artifacts', appId, 'users', user.uid, 'usage', monthId);
          await setDoc(usageRef, { businessIdeasUsed: usage.businessIdeasUsed + 1 }, { merge: true });
          showToast("Generated 2 business ideas.", "success");
        } else {
          showToast("Failed to generate exactly 2 ideas.", "error");
        }
      } catch (err) {
        showToast("Failed to generate ideas.", "error");
      } finally {
        setIsGenerating(false);
      }
    };

    const handleBuildWorkshop = async (idea) => {
      setSelectedIdea(idea);
      setIsBuilding(true);
      try {
        const sysInstruction = `You are building a comprehensive curriculum and marketing funnel for a ${idea.type} named "${idea.name}".`;
        const schema = {
          type: "OBJECT",
          properties: {
            modules: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  description: { type: "STRING" },
                  exercise: { type: "STRING" }
                }
              }
            },
            funnel: {
              type: "OBJECT",
              properties: {
                awareness_content: { type: "STRING" },
                lead_magnet: { type: "STRING" },
                core_offer_cta: { type: "STRING" }
              }
            }
          },
          required: ["modules", "funnel"]
        };

        const result = await generateContent(`Build details for: ${JSON.stringify(idea)}`, sysInstruction, schema);
        
        const finalWorkshop = { ...idea, ...result, month: getCurrentMonthId(), createdAt: serverTimestamp() };
        setBuiltWorkshop(finalWorkshop);
        
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'builtWorkshops'), finalWorkshop);
        showToast("Workshop built and saved.", "success");

      } catch (err) {
        showToast("Failed to build workshop.", "error");
      } finally {
        setIsBuilding(false);
      }
    };

    if (usage.businessIdeasUsed >= LIMITS.IDEAS && !generatedIdeas) {
      return (
        <div className="max-w-2xl mx-auto text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-stone-100 mb-6">
            <AlertCircle className="text-stone-500" size={32} />
          </div>
          <h2 className="text-2xl font-serif mb-4">Business Limit Reached</h2>
          <p className="text-stone-600 mb-8">
            You have completed your {LIMITS.IDEAS} business ideas for this month.
            You can continue developing existing ideas, but no new ones can be generated until next month.
          </p>
          <Button onClick={() => setCurrentView('history')} variant="secondary">View Built Workshops</Button>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto animate-in fade-in">
        <h1 className="text-3xl font-serif mb-8">Business Studio</h1>
        
        {!generatedIdeas ? (
          <Card className="p-6 md:p-8">
            <Textarea 
              label="What area or audience problem do you want to explore?" 
              placeholder="e.g., I want to create something for women who feel emotionally stuck."
              value={ideaInput}
              onChange={(e) => setIdeaInput(e.target.value)}
            />
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-stone-100">
              <span className="text-sm text-stone-500">
                This will use 1 of your {LIMITS.IDEAS - usage.businessIdeasUsed} remaining business idea slots.
              </span>
              <Button onClick={handleGenerate} isLoading={isGenerating}>
                Generate 2 Ideas
              </Button>
            </div>
          </Card>
        ) : !builtWorkshop ? (
          <div className="space-y-6">
            <h2 className="text-xl font-medium mb-6">Select an Idea to Develop</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {generatedIdeas.map((idea) => (
                <Card key={idea.id} className="p-6 flex flex-col h-full">
                  <div className="flex-grow space-y-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-sage-600 bg-emerald-50 px-2 py-1 rounded">
                      {idea.type}
                    </span>
                    <h3 className="text-xl font-serif font-medium leading-tight">{idea.name}</h3>
                    <p className="text-sm text-stone-600">{idea.promise}</p>
                    <div className="space-y-2 pt-4 border-t border-stone-100 text-sm">
                      <p><strong>Audience:</strong> {idea.audience}</p>
                      <p><strong>Format:</strong> {idea.format}</p>
                      <p><strong>Why it fits:</strong> {idea.whyItFits}</p>
                    </div>
                  </div>
                  <Button 
                    className="w-full mt-6" 
                    onClick={() => handleBuildWorkshop(idea)}
                    isLoading={isBuilding && selectedIdea?.id === idea.id}
                    disabled={isBuilding}
                  >
                    Build {idea.type}
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in slide-in-from-bottom-4">
            <Button variant="ghost" onClick={() => setBuiltWorkshop(null)} className="mb-4">
              ← Back to Ideas
            </Button>
            <Card className="p-8">
              <div className="mb-8 border-b border-stone-100 pb-6">
                <span className="text-sm font-bold uppercase tracking-wider text-sage-600 mb-2 block">
                  Finalized {builtWorkshop.type}
                </span>
                <h2 className="text-3xl font-serif mb-4">{builtWorkshop.name}</h2>
                <p className="text-lg text-stone-600">{builtWorkshop.promise}</p>
              </div>

              <h3 className="text-xl font-medium mb-4">Curriculum / Modules</h3>
              <div className="space-y-4 mb-8">
                {builtWorkshop.modules.map((mod, idx) => (
                  <div key={idx} className="bg-stone-50 p-4 rounded-lg">
                    <h4 className="font-medium text-stone-900 mb-1">Module {idx + 1}: {mod.title}</h4>
                    <p className="text-sm text-stone-600 mb-2">{mod.description}</p>
                    <p className="text-sm text-stone-500 italic">Exercise: {mod.exercise}</p>
                  </div>
                ))}
              </div>

              <h3 className="text-xl font-medium mb-4">Suggested Funnel</h3>
              <div className="bg-stone-900 text-stone-100 p-6 rounded-lg space-y-4">
                <div>
                  <h4 className="text-xs uppercase text-stone-400 font-bold mb-1">1. Awareness</h4>
                  <p>{builtWorkshop.funnel.awareness_content}</p>
                </div>
                <div>
                  <h4 className="text-xs uppercase text-stone-400 font-bold mb-1">2. Lead Capture</h4>
                  <p>{builtWorkshop.funnel.lead_magnet}</p>
                </div>
                <div>
                  <h4 className="text-xs uppercase text-stone-400 font-bold mb-1">3. Conversion</h4>
                  <p>{builtWorkshop.funnel.core_offer_cta}</p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const BrandBrainView = () => {
    const [localBrain, setLocalBrain] = useState(brandBrain || {});
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
      setIsSaving(true);
      try {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'config', 'brandBrain'), localBrain);
        showToast("Brand Brain updated successfully.", "success");
      } catch (err) {
        showToast("Failed to save.", "error");
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-serif mb-2">Brand Brain</h1>
        <p className="text-stone-500 mb-8">The core intelligence used for every generation.</p>
        
        <Card className="p-6 space-y-4">
          <Input label="Brand / Person Name" value={localBrain.name || ''} onChange={e => setLocalBrain({...localBrain, name: e.target.value})} />
          <Textarea label="Tone of Voice" value={localBrain.tone || ''} onChange={e => setLocalBrain({...localBrain, tone: e.target.value})} />
          <Textarea label="Brand Energy" value={localBrain.energy || ''} onChange={e => setLocalBrain({...localBrain, energy: e.target.value})} />
          <Textarea label="Core Expertise" value={localBrain.expertise || ''} onChange={e => setLocalBrain({...localBrain, expertise: e.target.value})} />
          <Textarea label="Target Audience & Problems" value={localBrain.audience || ''} onChange={e => setLocalBrain({...localBrain, audience: e.target.value})} />
          
          <div className="pt-4 border-t border-stone-100 flex justify-end">
            <Button onClick={handleSave} isLoading={isSaving}>Save Configuration</Button>
          </div>
        </Card>
      </div>
    );
  };

  const ServicesView = () => (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-serif mb-2">Services Library</h1>
          <p className="text-stone-500">Your existing offerings used as context for AI suggestions.</p>
        </div>
        <Button onClick={() => showToast("Adding services manually will be in the next update.", "info")}>
          <Plus size={16} className="mr-2"/> Add Service
        </Button>
      </div>
      
      {services.length === 0 ? (
        <Card className="p-12 text-center text-stone-500">
          No services added yet. The AI will rely on your Brand Brain context.
        </Card>
      ) : (
        <div className="grid gap-4">
           {services.map(svc => <Card key={svc.id} className="p-4">{svc.name}</Card>)}
        </div>
      )}
    </div>
  );

  const HistoryView = () => {
    const [scripts, setScripts] = useState([]);
    useEffect(() => {
      if(!user) return;
      const fetchHistory = async () => {
        const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'selectedScripts'), orderBy('createdAt', 'desc'), limit(20));
        const snap = await getDocs(q);
        setScripts(snap.docs.map(d => ({id: d.id, ...d.data()})));
      };
      fetchHistory();
    }, [user, currentView]);

    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-serif mb-8">History & Monthly Plan</h1>
        <h2 className="text-xl font-medium mb-4">Selected Scripts</h2>
        <div className="space-y-4">
          {scripts.length === 0 && <p className="text-stone-500 italic">No scripts selected yet.</p>}
          {scripts.map(s => (
            <Card key={s.id} className="p-4 flex flex-col md:flex-row justify-between md:items-center gap-4">
               <div>
                 <span className="text-xs text-stone-400 bg-stone-100 px-2 py-1 rounded uppercase mr-2">{s.month}</span>
                 <span className="font-medium">{s.topic}</span>
               </div>
               <div className="text-sm text-stone-500 line-clamp-1 max-w-md">{s.hook}</div>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // --- Main Layout ---
  if (isAuthLoading) return <div className="min-h-screen flex items-center justify-center bg-stone-50"><Loader2 className="animate-spin text-stone-400" size={32} /></div>;

  const NavItem = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => { setCurrentView(id); setIsSidebarOpen(false); }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors
        ${currentView === id ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
    >
      <Icon size={18} />
      {label}
    </button>
  );

  return (
    <div className={`min-h-screen ${theme.bg} text-stone-900 font-sans flex flex-col md:flex-row overflow-hidden`}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-stone-200">
        <h1 className="font-serif text-xl font-medium">Alchemy OS</h1>
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 -mr-2"><Menu /></button>
      </div>

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-stone-200 transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col">
          <div className="p-6 flex justify-between items-center">
            <h1 className="font-serif text-2xl font-medium tracking-tight">Alchemy OS</h1>
            <button className="md:hidden text-stone-500" onClick={() => setIsSidebarOpen(false)}><X size={20}/></button>
          </div>
          
          <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 mt-4 px-4">Core</div>
            <NavItem id="dashboard" icon={Home} label="Dashboard" />
            <NavItem id="script-studio" icon={PenTool} label="Script Studio" />
            <NavItem id="business-studio" icon={Lightbulb} label="Business Studio" />
            
            <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 mt-8 px-4">Library</div>
            <NavItem id="history" icon={Clock} label="History & Plan" />
            <NavItem id="services" icon={Library} label="Services" />
            
            <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 mt-8 px-4">Settings</div>
            <NavItem id="brand-brain" icon={Settings} label="Brand Brain" />
          </nav>

          <div className="p-4 border-t border-stone-100">
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 font-medium">
                PJ
              </div>
              <div className="text-sm font-medium text-stone-700">Priti Jain</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-y-auto">
        <div className="p-6 md:p-10 pb-24">
          {currentView === 'dashboard' && <DashboardView />}
          {currentView === 'script-studio' && <ScriptStudioView />}
          {currentView === 'business-studio' && <BusinessStudioView />}
          {currentView === 'brand-brain' && <BrandBrainView />}
          {currentView === 'services' && <ServicesView />}
          {currentView === 'history' && <HistoryView />}
        </div>
      </main>

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-stone-900/20 z-30 md:hidden animate-in fade-in"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}