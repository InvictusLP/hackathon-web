'use client';

import { createContext, useContext } from 'react';
import { GripVertical } from 'lucide-react';
import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type SeparatorProps,
} from 'react-resizable-panels';
import { cn } from '@/lib/utils';

const PanelGroupContext = createContext<{ orientation: 'horizontal' | 'vertical' }>({
  orientation: 'horizontal',
});

export const ResizablePanelGroup = ({
  orientation = 'horizontal',
  className,
  ...props
}: GroupProps) => (
  <PanelGroupContext.Provider value={{ orientation }}>
    <Group
      orientation={orientation}
      className={cn(
        'flex h-full w-full',
        orientation === 'vertical' && 'flex-col',
        className,
      )}
      {...props}
    />
  </PanelGroupContext.Provider>
);

export const ResizablePanel = Panel;

export interface ResizableHandleProps extends SeparatorProps {
  withHandle?: boolean;
  orientation?: 'horizontal' | 'vertical';
}

export const ResizableHandle = ({
  withHandle = true,
  orientation: propOrientation,
  className,
  ...props
}: ResizableHandleProps) => {
  const { orientation: contextOrientation } = useContext(PanelGroupContext);
  const isVertical = propOrientation
    ? propOrientation === 'vertical'
    : contextOrientation === 'vertical';

  return (
    <Separator
      className={cn(
        'relative flex items-center justify-center bg-border/25 hover:bg-primary/50 transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring select-none z-20 shrink-0 group',
        isVertical
          ? 'h-2 w-full cursor-row-resize after:absolute after:inset-x-0 after:-top-1.5 after:h-5 after:w-full'
          : 'w-2 h-full cursor-col-resize after:absolute after:inset-y-0 after:-left-1.5 after:w-5 after:h-full',
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div
          className={cn(
            'z-10 flex items-center justify-center rounded-xs bg-muted/90 group-hover:bg-primary/70 transition-colors shadow-2xs border border-border/60',
            isVertical ? 'h-1.5 w-8' : 'h-8 w-1.5',
          )}
        >
          <GripVertical
            className={cn(
              'size-2 text-muted-foreground group-hover:text-primary-foreground transition-colors',
              isVertical && 'rotate-90',
            )}
          />
        </div>
      )}
    </Separator>
  );
};
