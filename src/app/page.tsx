'use client';

import { motion } from 'framer-motion';
import { Shield, Phone, Building2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

// Heartbeat ECG waveform path (normalized to an 800x160 viewBox)
const HEARTBEAT_PATH =
  'M0,80 L120,80 L140,80 L155,30 L170,130 L185,20 L200,130 L215,80 L240,80 L800,80';

export default function Home() {
  return (
    <div className="h-screen w-screen bg-white flex flex-col items-center justify-center px-6 relative overflow-hidden">

      {/* ── Heartbeat Background ─────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* 4 staggered ECG rows at different vertical positions */}
        {[0.06, 0.32, 0.58, 0.84].map((yFrac, rowIdx) => (
          <svg
            key={rowIdx}
            viewBox="0 0 800 160"
            preserveAspectRatio="none"
            className="absolute w-full"
            style={{ top: `${yFrac * 100}%`, height: 120, opacity: rowIdx === 1 ? 0.22 : 0.10 }}
          >
            {/* Static faint baseline */}
            <path
              d={HEARTBEAT_PATH}
              fill="none"
              stroke="#f97316"
              strokeWidth="1.5"
              strokeOpacity="0.4"
            />
            {/* Animated sweep — draws line, then fades, repeats */}
            <motion.path
              d={HEARTBEAT_PATH}
              fill="none"
              stroke="#fb923c"
              strokeWidth={rowIdx === 1 ? 2.5 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, 1, 1], opacity: [0, 1, 0] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay: rowIdx * 0.6,
                ease: 'easeOut',
                times: [0, 0.7, 1],
              }}
            />
          </svg>
        ))}

        {/* Outer radial glow pulse centered on screen */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 220,
            height: 220,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, rgba(251,146,60,0.18) 0%, transparent 70%)',
          }}
          animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Inner tighter glow */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 100,
            height: 100,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, rgba(249,115,22,0.22) 0%, transparent 70%)',
          }}
          animate={{ scale: [1, 1.9, 1], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
        />
      </div>

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 text-center relative z-10"
      >
        <motion.div
          className="w-20 h-20 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-4"
          animate={{ boxShadow: ['0 0 20px rgba(249,115,22,0.15)', '0 0 40px rgba(249,115,22,0.35)', '0 0 20px rgba(249,115,22,0.15)'] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        >
          <Shield className="w-10 h-10 text-orange-500" />
        </motion.div>
        <h1 className="text-3xl font-black text-zinc-900 tracking-tight">
          VAASTA
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
            <div className="group bg-white/80 backdrop-blur-sm border border-orange-200 rounded-2xl p-5 hover:bg-orange-50 hover:border-orange-500/30 transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <Phone className="w-6 h-6 text-orange-500" />
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Civilian SOS</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Emergency call simulation
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-orange-500 transition-colors" />
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
            <div className="group bg-white/80 backdrop-blur-sm border border-orange-200 rounded-2xl p-5 hover:bg-orange-50 hover:border-blue-600/30 transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Institution War Room</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Dispatch &amp; monitoring dashboard
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-blue-500 transition-colors" />
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
        <p className="text-[10px] text-zinc-500">
          Vaasta 2.0 · LangGraph + Groq + Supabase Realtime
        </p>
      </motion.div>
    </div>
  );
}
