'use client';

import { motion } from 'framer-motion';

interface SOSButtonProps {
  onPress: () => void;
  isActive: boolean;
}

export default function SOSButton({ onPress, isActive }: SOSButtonProps) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer rings */}
      {!isActive && (
        <>
          <motion.div
            className="absolute rounded-full border-2 border-orange-500/30"
            style={{ width: 220, height: 220 }}
            animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute rounded-full border-2 border-orange-500/20"
            style={{ width: 220, height: 220 }}
            animate={{ scale: [1, 2.2], opacity: [0.4, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut', delay: 0.8 }}
          />
        </>
      )}

      {/* Active pulse rings */}
      {isActive && (
        <>
          <motion.div
            className="absolute rounded-full bg-orange-500/10"
            style={{ width: 280, height: 280 }}
            animate={{ scale: [1, 1.3], opacity: [0.3, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute rounded-full bg-orange-500/15"
            style={{ width: 220, height: 220 }}
            animate={{ scale: [0.95, 1.1, 0.95], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}

      {/* Main button */}
      <motion.button
        onClick={onPress}
        className={`relative z-10 rounded-full flex items-center justify-center font-bold text-white transition-all ${
          isActive
            ? 'bg-red-700 glow-orange w-44 h-44'
            : 'bg-gradient-to-br from-orange-400 to-orange-600 hover:from-orange-500 hover:to-orange-700 w-40 h-40 shadow-lg'
        }`}
        whileTap={{ scale: 0.92 }}
        animate={isActive ? { scale: [1, 1.05, 1] } : {}}
        transition={isActive ? { duration: 1.5, repeat: Infinity } : {}}
      >
        <div className="text-center">
          <div className="text-3xl font-black tracking-wider">SOS</div>
          <div className="text-xs text-red-200/80 mt-1">
            {isActive ? 'CALL ACTIVE' : 'TAP FOR HELP'}
          </div>
        </div>
      </motion.button>
    </div>
  );
}
