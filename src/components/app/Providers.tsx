"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { TooltipPrimitive } from "@/components/ui/overlay";
import { useAppStore } from "@/lib/store";

/** 已解析的主题（含 system），水合后才准确；渲染期读取它不会产生 hydration 不匹配 */
const ResolvedThemeContext = createContext<"light" | "dark">("light");

export function useResolvedTheme() {
  return useContext(ResolvedThemeContext);
}

/** 应用 Provider：状态水合、主题、Tooltip、Toast */
export function Providers({ children }: { children: React.ReactNode }) {
  const hydrated = useAppStore((s) => s.hydrated);
  const setHydrated = useAppStore((s) => s.setHydrated);
  const theme = useAppStore((s) => s.settings.theme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => {
      useAppStore.getState().setHydrated(true);
      // 数据迁移：补齐新版本引入的默认数据源
      useAppStore.getState().ensureLookupSources();
    });
    void useAppStore.persist.rehydrate();
    // 若同一会话内已水合过（如路由切换），直接标记
    if (useAppStore.persist.hasHydrated()) {
      setHydrated(true);
      useAppStore.getState().ensureLookupSources();
    }
    return unsub;
  }, [setHydrated]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      try {
        localStorage.setItem("wv-theme", theme === "system" ? (media.matches ? "dark" : "light") : theme);
      } catch {
        /* ignore */
      }
      setResolvedTheme(dark ? "dark" : "light");
    };
    apply();
    const onChange = () => {
      if (theme === "system") apply();
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return (
    <ResolvedThemeContext.Provider value={resolvedTheme}>
      <TooltipPrimitive.Provider delayDuration={180} skipDelayDuration={300}>
        {children}
        <Toaster
          position="bottom-right"
          theme={resolvedTheme}
          toastOptions={{
            style: {
              borderRadius: "12px",
              border: "none",
              boxShadow: "0 0 0 1px #00000014, 0px 8px 16px -4px #0000000a, 0px 24px 32px -8px #0000000f",
              fontSize: "13px",
            },
          }}
        />
        {!hydrated ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex justify-center">
            <div className="rounded-full bg-gray-1000/90 px-3 py-1.5 text-[12px] text-background-100 shadow-geist-lg">
              正在载入 WulonVocab 数据…
            </div>
          </div>
        ) : null}
      </TooltipPrimitive.Provider>
    </ResolvedThemeContext.Provider>
  );
}
