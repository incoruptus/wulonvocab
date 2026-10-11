/** 浏览器内置语音合成（零配置发音） */
export function speakWord(text: string, lang = "en-US", rate = 0.95): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const lower = lang.toLowerCase();
    const voice =
      voices.find((v) => v.lang?.toLowerCase() === lower) ??
      voices.find((v) => v.lang?.toLowerCase().startsWith(lower.slice(0, 2)));
    if (voice) u.voice = voice;
    u.lang = lang;
    u.rate = rate;
    synth.speak(u);
  } catch {
    /* 忽略语音错误 */
  }
}

/** 停掉当前/排队的语音（退出会话、重新开始等场景） */
export function cancelSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}
