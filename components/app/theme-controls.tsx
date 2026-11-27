'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Check, Moon, Palette, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { THEME_PRESETS, applyThemePreset, getSavedThemePreset, type ThemePreset } from '@/lib/theme';

export function ThemeControls() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [preset, setPreset] = React.useState<ThemePreset>('default');

  React.useEffect(() => {
    const saved = getSavedThemePreset();
    setPreset(saved);
    applyThemePreset(saved);
  }, []);

  const selectPreset = (p: ThemePreset) => {
    setPreset(p);
    applyThemePreset(p);
  };

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            aria-label="Theme & Presets"
          >
            <Palette className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 p-1.5 shadow-md ring-1 ring-foreground/10">
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1">
            Color Scheme
          </DropdownMenuLabel>
          {THEME_PRESETS.map((item) => (
            <DropdownMenuItem
              key={item.value}
              onClick={() => selectPreset(item.value)}
              className="flex items-center justify-between text-xs px-2 py-1.5 cursor-pointer rounded-md"
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full border border-foreground/20"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.label}</span>
              </div>
              {preset === item.value && <Check className="size-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1">
            Appearance
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => setTheme('light')}
            className="flex items-center justify-between text-xs px-2 py-1.5 cursor-pointer rounded-md"
          >
            <div className="flex items-center gap-2">
              <Sun className="size-3.5" />
              <span>Light</span>
            </div>
            {theme === 'light' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setTheme('dark')}
            className="flex items-center justify-between text-xs px-2 py-1.5 cursor-pointer rounded-md"
          >
            <div className="flex items-center gap-2">
              <Moon className="size-3.5" />
              <span>Dark</span>
            </div>
            {theme === 'dark' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-foreground"
        aria-label="Toggle dark mode"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      >
        <Sun className="hidden size-4 dark:block transition-all" />
        <Moon className="size-4 dark:hidden transition-all" />
      </Button>
    </div>
  );
}
