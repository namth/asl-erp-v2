'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { useAiDrawerStore } from '@/stores/ai-drawer-store';

export function AiChatButton() {
  const openDrawer = useAiDrawerStore((state) => state.openDrawer);

  return (
    <button
      type="button"
      onClick={() => openDrawer?.()}
      className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors relative flex items-center justify-center group"
      title="Trợ lý AI"
      aria-label="Mở Trợ lý AI"
    >
      <Sparkles className="w-5 h-5 text-amber-300 group-hover:scale-110 transition-transform" />
    </button>
  );
}

export default AiChatButton;
