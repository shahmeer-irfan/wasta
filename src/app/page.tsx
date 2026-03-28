'use client';

import { motion } from 'framer-motion';
import { Phone, Building2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';

const EmergencyShader = dynamic(() => import('@/components/ui/emergency-shader'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-gradient-to-b from-orange-50 via-white to-orange-50" />,
});

export default function Home() {
  return (
    <div className="h-screen w-screen bg-white flex flex-col items-center justify-center px-6 relative overflow-hidden">

      {/* ── WebGL Shader Background (light, subtle orange energy) ── */}
      <div className="absolute inset-0 pointer-events-none">
        <EmergencyShader />
      </div>

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 text-center relative z-10"
      >
        <motion.div
          className="w-40 h-40 mx-auto mb-0 relative z-20 flex items-center justify-center"
          animate={{ 
            filter: [
              'drop-shadow(0 0 10px rgba(249,115,22,0.25))',
              'drop-shadow(0 0 30px rgba(249,115,22,0.45))',
              'drop-shadow(0 0 10px rgba(249,115,22,0.25))'
            ] 
          }}
          transition={{ duration: 2.8, repeat: Infinity }}
        >
          <Image 
            src="/logoBackgroundRemoved.png" 
            alt="Waasta Logo" 
            fill 
            className="object-contain" 
            priority 
          />
        </motion.div>
        <h1 className="text-5xl font-black bg-clip-text text-transparent bg-gradient-to-br from-orange-600 to-orange-400 tracking-tighter">
          WAASTA
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          AI-Powered Emergency Response · Karachi
        </p>
      </motion.div>

      {/* Navigation cards */}
      <div className="w-full max-w-md space-y-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Link href="/civilian" className="block">
            <div className="group bg-white/80 backdrop-blur-sm border-[1.5px] border-orange-200 shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-2xl p-5 hover:border-orange-500 hover:shadow-[0_8px_30px_rgba(249,115,22,0.15)] transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Civilian SOS</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Report an emergency
                    </div>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                  <ArrowRight className="w-4 h-4 text-orange-500" />
                </div>
              </div>
            </div>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Link href="/institution/dashboard" className="block">
            <div className="group bg-white/80 backdrop-blur-sm border-[1.5px] border-orange-300 shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-2xl p-5 hover:border-orange-600 hover:shadow-[0_8px_30px_rgba(234,88,12,0.15)] transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-600 to-orange-700 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Institution War Room</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Dispatch &amp; monitoring
                    </div>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                  <ArrowRight className="w-4 h-4 text-orange-600" />
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-12 text-center relative z-10"
      >
        <p className="text-[10px] text-zinc-400">
          Waasta 2.0 · LangGraph + Groq Whisper + Supabase Realtime + WebRTC
        </p>
      </motion.div>
    </div>
  );
}
