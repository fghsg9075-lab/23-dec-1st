import React, { useState } from 'react';
import { Gift, ArrowRight, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { User, GiftCode } from '../types';
// Firebase Imports
import { rtdb, saveUserToLive } from '../firebase';
import { ref, get, set, update } from 'firebase/database';

interface Props {
  user: User;
  onSuccess: (updatedUser: User) => void;
}

export const RedeemSection: React.FC<Props> = ({ user, onSuccess }) => {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [msg, setMsg] = useState('');

  const handleRedeem = async () => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return;

    setStatus('LOADING');
    
    try {
        // 1. Firebase Realtime Database से कोड चेक करें
        const codeRef = ref(rtdb, `redeem_codes/${cleanCode}`);
        const snapshot = await get(codeRef);

        if (!snapshot.exists()) {
            setStatus('ERROR');
            setMsg('Invalid Code. Please check and try again.');
            return;
        }

        const targetCode = snapshot.val() as GiftCode;

        // 2. चेक करें कि कोड पहले इस्तेमाल तो नहीं हुआ
        if (targetCode.isRedeemed) {
            setStatus('ERROR');
            setMsg('This code has already been redeemed.');
            return;
        }

        // --- SUCCESS LOGIC (LIVE SYNC) ---

        // 3. Firebase में कोड को 'Redeemed' मार्क करें
        await update(codeRef, {
            isRedeemed: true,
            redeemedBy: user.id,
            redeemedByName: user.name,
            redeemedDate: new Date().toISOString()
        });

        // 4. छात्र के Credits अपडेट करें
        const amountToAdd = Number(targetCode.amount) || 0;
        const updatedUser: User = { 
            ...user, 
            credits: (Number(user.credits) || 0) + amountToAdd, 
            redeemedCodes: [...(user.redeemedCodes || []), cleanCode] 
        };
        
        // 5. अपडेटेड यूज़र को Firestore Cloud में सेव करें
        await saveUserToLive(updatedUser);
        
        // लोकल स्टोरेज अपडेट करें ताकि ऐप तुरंत रिफ्लेक्ट करे
        localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));

        setStatus('SUCCESS');
        setMsg(`Success! 🎉 Added ${amountToAdd} Credits to your account.`);
        setCode('');
        onSuccess(updatedUser);
        
        // 3 सेकंड बाद मैसेज हटा दें
        setTimeout(() => {
            setStatus('IDLE');
            setMsg('');
        }, 3000);

    } catch (error) {
        console.error("Redeem Error:", error);
        setStatus('ERROR');
        setMsg('Connection failed. Please try again later.');
    }
  };

  return (
    <div className="bg-white rounded-[32px] p-8 border-2 border-slate-50 shadow-xl shadow-slate-100/50 mt-6 animate-in slide-in-from-bottom-4">
        <div className="flex items-center gap-4 mb-6">
            <div className="bg-gradient-to-br from-purple-500 to-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-purple-200">
                <Gift size={28} />
            </div>
            <div>
                <h3 className="font-black text-slate-800 text-lg">Redeem Gift Code</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Enter your secret code below</p>
            </div>
        </div>
        
        <div className="relative group">
            <input 
                type="text" 
                placeholder="Ex: NST-FREE-100" 
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                disabled={status === 'LOADING'}
                className="w-full pl-6 pr-14 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-700 focus:outline-none focus:border-purple-500 focus:bg-white transition-all uppercase placeholder:font-medium placeholder:text-slate-300"
            />
            <button 
                onClick={handleRedeem}
                disabled={status === 'LOADING' || !code}
                className="absolute right-2 top-2 bottom-2 bg-slate-900 text-white px-4 rounded-xl hover:bg-purple-600 disabled:opacity-50 transition-all active:scale-95 shadow-lg flex items-center justify-center min-w-[50px]"
            >
                {status === 'LOADING' ? <Loader2 size={20} className="animate-spin" /> : <ArrowRight size={22} />}
            </button>
        </div>

        {/* STATUS MESSAGES */}
        {status === 'ERROR' && (
            <div className="mt-4 flex items-center gap-2 text-red-500 text-xs font-black bg-red-50 p-3 rounded-xl border border-red-100 animate-in shake">
                <AlertCircle size={16} /> {msg}
            </div>
        )}
        
        {status === 'SUCCESS' && (
            <div className="mt-4 flex items-center gap-2 text-green-600 text-xs font-black bg-green-50 p-3 rounded-xl border border-green-100 animate-in zoom-in">
                <CheckCircle size={16} /> {msg}
            </div>
        )}
    </div>
  );
};
