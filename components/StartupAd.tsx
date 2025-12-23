
import React, { useEffect, useState, useCallback } from 'react';
import { StartupConfig } from '../types';
import { Sparkles, CheckCircle, Zap } from 'lucide-react';

interface Props {
    config: StartupConfig;
    onClose: () => void;
}

export const StartupAd: React.FC<Props> = ({ config, onClose }) => {
    const [timeLeft, setTimeLeft] = useState(config.duration);

    const memoizedOnClose = useCallback(onClose, [onClose]);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    memoizedOnClose();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [config.duration, memoizedOnClose]);

    return (
        <div 
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-300"
            style={{ backgroundColor: config.bgColor, color: config.textColor }}
        >
            <div className="absolute top-4 right-4 text-xs font-bold opacity-70 border border-current px-3 py-1 rounded-full">
                Auto-closing in {timeLeft}s
            </div>

            <div className="mb-8">
                {/* GLOWING NSTA LOGO */}
                <div className="mb-6 relative">
                    <h1 className="text-8xl font-black tracking-tighter" style={{
                        textShadow: '0 0 20px rgba(255,255,255,0.8), 0 0 40px rgba(255,255,255,0.4), 0 0 60px rgba(255,255,255,0.2)'
                    }}>
                        NSTA
                    </h1>
                    <div className="absolute inset-0 bg-white/20 blur-3xl rounded-full scale-150 animate-pulse"></div>
                </div>

                <h2 className="text-3xl md:text-5xl font-black mb-4 tracking-tight leading-tight relative z-10">
                    {config.title}
                </h2>
                <div className="h-2 w-32 bg-white/30 rounded-full mx-auto relative z-10"></div>
            </div>

            <div className="space-y-4 max-w-lg w-full">
                {config.features.map((feat, idx) => (
                    <div 
                        key={idx} 
                        className="flex items-center gap-4 bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/20 shadow-lg transform hover:scale-105 transition-transform"
                    >
                        <div className="bg-white text-black p-2 rounded-full">
                            <CheckCircle size={24} />
                        </div>
                        <span className="text-xl font-bold">{feat}</span>
                    </div>
                ))}
            </div>

            <div className="mt-12 text-sm font-bold opacity-60 uppercase tracking-[0.2em] animate-pulse">
                Developed by Nadim Anwar
            </div>
        </div>
    );
};
