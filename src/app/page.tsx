'use client';

import { motion } from 'framer-motion';
import { Shield, Phone, Building2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="h-screen w-screen bg-white flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 text-center"
      >
        <motion.div
          className="w-20 h-20 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-4"
          animate={{ boxShadow: ['0 0 20px rgba(220,38,38,0.2)', '0 0 40px rgba(220,38,38,0.4)', '0 0 20px rgba(220,38,38,0.2)'] }}
          transition={{ duration: 3, repeat: Infinity }}
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
      <div className="w-full max-w-md space-y-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Link href="/civilian" className="block">
            <div className="group bg-orange-50/50 border border-orange-200 rounded-2xl p-5 hover:bg-orange-50 hover:border-orange-500/30 transition-all cursor-pointer">
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
            <div className="group bg-orange-50/50 border border-orange-200 rounded-2xl p-5 hover:bg-orange-50 hover:border-blue-600/30 transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Institution War Room</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Dispatch & monitoring dashboard
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
        className="mt-12 text-center"
      >
        <p className="text-[10px] text-zinc-500">
          Vaasta 2.0 · LangGraph + Groq + Supabase Realtime
        </p>
      </motion.div>
    </div>
  );
}
