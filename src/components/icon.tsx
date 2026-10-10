"use client";

import {
  AlignLeft, BookOpen, Flame, GitBranch, Hash, Image as ImageIcon, Info, Languages, Layers,
  Lightbulb, List, Minus, PenLine, Puzzle, Quote, Repeat, Shuffle, Sigma, Sparkles, Star,
  Table2, Tag, Type, Volume2, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  AlignLeft, BookOpen, Flame, GitBranch, Hash, Image: ImageIcon, Info, Languages, Layers,
  Lightbulb, List, Minus, PenLine, Puzzle, Quote, Repeat, Shuffle, Sigma, Sparkles, Star,
  Table2, Tag, Type, Volume2,
};

export function SectionIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = (name && ICONS[name]) || Type;
  return <Icon className={className} />;
}

export const SECTION_ICON_MAP = ICONS;
