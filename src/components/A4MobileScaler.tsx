"use client";

import React, { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/useMediaQuery";

const A4_WIDTH = 794;

interface Props {
  children: React.ReactNode;
  className?: string;
}

/** A4 고정폭(794px) 양식을 모바일 뷰포트에 맞게 자동 축소합니다. */
export default function A4MobileScaler({ children, className = "" }: Props) {
  const isMobile = useIsMobile();
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!isMobile) {
      setScale(1);
      setScaledHeight(undefined);
      return;
    }

    const update = () => {
      const padding = 24;
      const available = window.innerWidth - padding;
      const nextScale = Math.min(1, Math.max(0.35, available / A4_WIDTH));
      setScale(nextScale);
      if (innerRef.current) {
        setScaledHeight(innerRef.current.offsetHeight * nextScale);
      }
    };

    update();
    window.addEventListener("resize", update);
    const node = innerRef.current;
    const ro = node ? new ResizeObserver(update) : null;
    if (node) ro?.observe(node);

    return () => {
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [isMobile, children]);

  if (!isMobile) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={`w-full flex justify-center overflow-x-hidden ${className}`}
      style={{ height: scaledHeight ? scaledHeight : undefined }}
    >
      <div
        ref={innerRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top center",
          width: A4_WIDTH,
        }}
      >
        {children}
      </div>
    </div>
  );
}
