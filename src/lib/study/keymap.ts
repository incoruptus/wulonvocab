/**
 * 学习会话键位表（UI 提示与帮助弹窗的唯一事实来源）
 * ------------------------------------------------------------------
 * 翻卡模式：空格显示释义；D/F/J/K 四档评级（家位行，与空格同排）。
 * 选择题模式：W/E/I/O 直选四项；F/J 上一个 / 下一个词（可不作答跳过）。
 * 通用：空格/回车 继续；R 发音；U 撤销；Esc 退出；? 打开快捷键帮助。
 */

export interface KeyBinding {
  label: string;
  keys: string[];
  desc?: string;
}

/** 选择题选项键位（左上/右上/左下/右下 布局对应的打字键位） */
export const CHOICE_OPTION_KEYS = ["w", "e", "i", "o"] as const;

export const KEYMAP_FLIP: KeyBinding[] = [
  { label: "显示释义", keys: ["空格"], desc: "先回忆，再翻面对照" },
  { label: "忘记", keys: ["D", "1"] },
  { label: "模糊", keys: ["F", "2"] },
  { label: "记得", keys: ["J", "3"], desc: "最常用" },
  { label: "轻松", keys: ["K", "4"] },
];

export const KEYMAP_CHOICE: KeyBinding[] = [
  { label: "选择答案", keys: ["W", "E", "I", "O"], desc: "对应四个选项，直接选中即判定" },
  { label: "上一个词", keys: ["F"], desc: "回到最近跳过的词" },
  { label: "下一个词", keys: ["J"], desc: "不必答完，直接跳过（稍后还会出现）" },
];

export const KEYMAP_COMMON: KeyBinding[] = [
  { label: "继续", keys: ["空格", "Enter"] },
  { label: "朗读单词", keys: ["R"] },
  { label: "星标单词", keys: ["S"], desc: "加入星标，稍后在词库中筛选" },
  { label: "撤销上一次作答", keys: ["U"] },
  { label: "退出学习", keys: ["Esc"] },
  { label: "快捷键帮助", keys: ["?"] },
];
