"use client";

import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { FadeLoader } from "react-spinners";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// Match the hugeicons above: a 16px (size-4) box, 2px strokes, currentColor.
// FadeLoader's ring radius is hardcoded to `margin + 18`, so it can't be drawn
// that small — build it at a comfortable size and scale the whole thing down.
const ICON_SIZE = 16;
const STROKE = 2;
const BAR_MARGIN = 2;
const BAR_LENGTH = 12;
const RING = BAR_MARGIN + 18; // FadeLoader's internal radius
const NATURAL_SIZE = RING * 2 + BAR_LENGTH;
const SCALE = ICON_SIZE / NATURAL_SIZE;
const BAR_WIDTH = STROKE / SCALE;
// FadeLoader offsets its own box by RING and centers the bars on
// (margin + width/2, margin + length/2); pin the box to the middle of the icon
// slot and translate that point back onto it.
const CENTER_X = BAR_MARGIN + BAR_WIDTH / 2;
const CENTER_Y = BAR_MARGIN + BAR_LENGTH / 2;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            strokeWidth={2}
            className="size-4"
          />
        ),
        info: (
          <HugeiconsIcon
            icon={InformationCircleIcon}
            strokeWidth={2}
            className="size-4"
          />
        ),
        warning: (
          <HugeiconsIcon
            icon={Alert02Icon}
            strokeWidth={2}
            className="size-4"
          />
        ),
        error: (
          <HugeiconsIcon
            icon={MultiplicationSignCircleIcon}
            strokeWidth={2}
            className="size-4"
          />
        ),
        loading: (
          <span className="relative block size-4">
            <FadeLoader
              color="currentColor"
              height={BAR_LENGTH}
              width={BAR_WIDTH}
              radius={BAR_WIDTH / 2}
              margin={BAR_MARGIN}
              cssOverride={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 0,
                height: 0,
                transformOrigin: "0 0",
                transform: `translate(${-CENTER_X * SCALE}px, ${-CENTER_Y * SCALE}px) scale(${SCALE})`,
              }}
            />
          </span>
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
