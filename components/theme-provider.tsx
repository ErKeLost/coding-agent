"use client";

import * as React from "react";

type Theme = "light" | "dark" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: string | string[];
  defaultTheme?: Theme;
  enableSystem?: boolean;
  enableColorScheme?: boolean;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: Exclude<Theme, "system">;
  setTheme: (theme: Theme) => void;
  themes: Theme[];
  systemTheme: Exclude<Theme, "system">;
};

const ThemeProviderContext = React.createContext<ThemeProviderState | undefined>(
  undefined
);

const MEDIA_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_STORAGE_KEY = "theme";
const AVAILABLE_THEMES: Theme[] = ["light", "dark", "system"];

function getSystemTheme(): Exclude<Theme, "system"> {
  if (typeof window === "undefined") return "light";
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function readStoredTheme(storageKey: string, fallback: Theme): Theme {
  if (typeof window === "undefined") return fallback;

  try {
    const storedTheme = window.localStorage.getItem(storageKey);
    if (
      storedTheme === "light" ||
      storedTheme === "dark" ||
      storedTheme === "system"
    ) {
      return storedTheme;
    }
  } catch {}

  return fallback;
}

function applyThemeToDocument({
  attribute,
  enableColorScheme,
  resolvedTheme,
}: {
  attribute: string | string[];
  enableColorScheme: boolean;
  resolvedTheme: Exclude<Theme, "system">;
}) {
  const root = document.documentElement;
  const attributes = Array.isArray(attribute) ? attribute : [attribute];

  for (const currentAttribute of attributes) {
    if (currentAttribute === "class") {
      root.classList.remove("light", "dark");
      root.classList.add(resolvedTheme);
      continue;
    }

    root.setAttribute(currentAttribute, resolvedTheme);
  }

  if (enableColorScheme) {
    root.style.colorScheme = resolvedTheme;
  }
}

export function ThemeProvider({
  children,
  attribute = "data-theme",
  defaultTheme = "system",
  enableSystem = true,
  enableColorScheme = true,
  storageKey = DEFAULT_STORAGE_KEY,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() =>
    readStoredTheme(storageKey, defaultTheme)
  );
  const [systemTheme, setSystemTheme] = React.useState<Exclude<Theme, "system">>(
    () => getSystemTheme()
  );

  React.useEffect(() => {
    if (!enableSystem) return;

    const mediaQuery = window.matchMedia(MEDIA_QUERY);
    const handleChange = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [enableSystem]);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      setThemeState(readStoredTheme(storageKey, defaultTheme));
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [defaultTheme, storageKey]);

  const resolvedTheme =
    theme === "system" && enableSystem ? systemTheme : (theme as Exclude<Theme, "system">);

  React.useEffect(() => {
    applyThemeToDocument({
      attribute,
      enableColorScheme,
      resolvedTheme,
    });
  }, [attribute, enableColorScheme, resolvedTheme]);

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      setThemeState(nextTheme);
      try {
        window.localStorage.setItem(storageKey, nextTheme);
      } catch {}
    },
    [storageKey]
  );

  const value = React.useMemo<ThemeProviderState>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      themes: enableSystem ? AVAILABLE_THEMES : ["light", "dark"],
      systemTheme,
    }),
    [enableSystem, resolvedTheme, setTheme, systemTheme, theme]
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeProviderContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
