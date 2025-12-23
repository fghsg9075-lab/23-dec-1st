import React, { useState } from 'react';
import { Gift, ArrowRight, AlertCircle, CheckCircle, Loader2, Sparkles, Zap } from 'lucide-react';
import { User, GiftCode } from '../types';
// --- FIREBASE LIVE IMPORTS ---
// हम यहाँ आपके द्वारा सेटअप किए गए रीयल-टाइम डेटाबेस और फ़ायरस्टोर सिंक का उपयोग कर रहे हैं।
import { rtdb, saveUserToLive } from '../firebase';
import { ref, get, update } from 'firebase/database';

interface Props {
  user: User;
  onSuccess: (updatedUser: User) => void;
}

/**
 * RedeemSection Component:
 * यह हिस्सा छात्रों को एडमिन द्वारा दिए गए रिडीम कोड का उपयोग करने की अनुमति देता है।
 * अब यह पूरी तरह से क्लाउड-आधारित है, जिससे कोड कहीं भी इस्तेमाल किया जा सकता है।
 */
export const RedeemSection: React.FC<Props> = ({ user, onSuccess }) => {
  // --- LOCAL STATES FOR UI CONTROL ---
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [msg, setMsg] = useState('');

  /**
   * handleRedeem Function:
   * यह फंक्शन कोड की वैधता की जाँच करता है और छात्र के क्रेडिट्स को लाइव अपडेट करता है।
   */
  const handleRedeem = async () => {
    const cleanCode = code.trim().toUpperCase(); // कोड को साफ़ और बड़े अक्षरों में करना
    
    // अगर कोड खाली है तो कुछ न करें
    if (!cleanCode) return;
    
    setStatus('LOADING');
    setMsg('Checking code with cloud database...');
    
    try {
        // --- STEP 1: FETCH CODE FROM FIREBASE RTDB ---
        // हम 'redeem_codes' नोड में इस विशिष्ट कोड को ढूँढ रहे हैं।
        const codeRef = ref(rtdb, `redeem_codes/${cleanCode}`);
        const snapshot = await get(codeRef);

        // यदि कोड डेटाबेस में मौजूद नहीं है
        if (!snapshot.exists()) {
            setStatus('ERROR');
            setMsg('Invalid Gift Code. Please contact Ehsan Sir for a valid code.');
            return;
        }

        const targetCode = snapshot.val() as GiftCode;

        // --- STEP 2: CHECK REDEMPTION STATUS ---
        // हम यह सुनिश्चित करते हैं कि एक कोड दो बार इस्तेमाल न हो सके।
        if (targetCode.isRedeemed) {
            setStatus('ERROR');
            setMsg('This unique code has already been used by another student.');
            return;
        }

        // --- STEP 3: LIVE REDEMPTION PROCESS ---
        // 1. क्लाउड में कोड को 'Redeemed' के रूप में मार्क करें।
        await update(codeRef, {
            isRedeemed: true,
            redeemedBy: user.id,
            redeemedByName: user.name,
            redeemedDate: new Date().toISOString()
        });

        // 2. छात्र के क्रेडिट्स की गणना करें।
        const creditAmount = Number(targetCode.amount) || 0;
        const updatedUser: User = { 
            ...user, 
            credits: (Number(user.credits) || 0) + creditAmount, 
            redeemedCodes: [...(user.redeemedCodes || []), cleanCode] 
        };
        
        // --- STEP 4: SYNC UPDATED USER TO FIRESTORE ---
        // यह सबसे ज़रूरी स्टेप है जिससे एडमिन को छात्र के नए क्रेडिट्स तुरंत दिखेंगे।
        await saveUserToLive(updatedUser);
        
        // बैकअप के लिए लोकल स्टोरेज को भी अपडेट करें
        localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));

        // सफलता का संदेश दिखाएँ
        setStatus('SUCCESS');
        setMsg(`🎉 Congratulations! ${creditAmount} Credits added to your account.`);
        setCode(''); // इनपुट फील्ड साफ़ करें
        
        // पैरेंट कंपोनेंट (App.tsx) को सूचित करें
        onSuccess(updatedUser);
        
        // 4 सेकंड बाद UI को वापस सामान्य करें
        setTimeout(() => {
            setStatus('IDLE');
            setMsg('');
        }, 4000);

    } catch (error) {
        // नेटवर्क या डेटाबेस एरर हैंडलिंग
        console.error("Redemption Critical Error:", error);
        setStatus('ERROR');
        setMsg('Cloud connection failed. Please check your internet and try again.');
    }
  };

  return (
    <div className="bg-white rounded-[32px] p-8 border-2 border-slate-50 shadow-2xl shadow-slate-200/50 mt-8 animate-in slide-in-from-bottom-6 duration-500">
        {/* HEADER SECTION WITH ICON */}
        <div className="flex items-center gap-4 mb-8">
            <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-3.5 rounded-2xl text-white shadow-xl shadow-indigo-100 ring-4 ring-white">
                <Gift size={32} strokeWidth={2.5} />
            </div>
            <div>
                <h3 className="font-black text-slate-900 text-xl tracking-tight">Redeem Gift Code</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.15em] mt-0.5 flex items-center gap-1">
                   <Sparkles size={12} className="text-amber-400" /> Powered by NST AI Cloud
                </p>
            </div>
        </div>
        
        {/* INPUT AND BUTTON SECTION */}
        <div className="relative group">
            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                <Zap size={20} fill="currentColor" />
            </div>
            <input 
                type="text" 
                placeholder="EX: NST-X92-PREMIUM" 
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                disabled={status === 'LOADING'}
                className="w-full pl-14 pr-16 py-5 bg-slate-50 border-2 border-slate-100 rounded-[24px] font-black text-slate-700 text-lg focus:outline-none focus:border-indigo-500 focus:bg-white transition-all uppercase placeholder:font-bold placeholder:text-slate-300 shadow-inner"
            />
            <button 
                onClick={handleRedeem}
                disabled={status === 'LOADING' || !code}
                className="absolute right-2.5 top-2.5 bottom-2.5 bg-slate-900 text-white px-6 rounded-[18px] hover:bg-indigo-600 disabled:opacity-50 transition-all active:scale-95 shadow-xl flex items-center justify-center min-w-[60px]"
            >
                {status === 'LOADING' ? (
                    <Loader2 size={24} className="animate-spin" />
                ) : (
                    <ArrowRight size={24} strokeWidth={3} />
                )}
            </button>
        </div>

        {/* FEEDBACK MESSAGES (ERROR/SUCCESS) */}
        <div className="mt-6 min-h-[48px]">
            {status === 'ERROR' && (
                <div className="flex items-center gap-3 text-red-600 text-sm font-black bg-red-50 p-4 rounded-2xl border border-red-100 animate-in shake-in duration-300">
                    <AlertCircle size={20} />
                    <span>{msg}</span>
                </div>
            )}
            
            {status === 'SUCCESS' && (
                <div className="flex items-center gap-3 text-emerald-700 text-sm font-black bg-emerald-50 p-4 rounded-2xl border border-emerald-100 animate-in zoom-in-95 duration-300">
                    <CheckCircle size={20} />
                    <span>{msg}</span>
                </div>
            )}
            
            {status === 'IDLE' && !msg && (
                <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 leading-relaxed">
                    Note: Gift codes are unique and can only be used once. 
                    <br />Please double-check for typos.
                </p>
            )}
        </div>
    </div>
  );
};
