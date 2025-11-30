/**
 * Tooltip - Modern animated tooltip component
 */

import { useState, useRef, useEffect, ReactNode } from 'react';

interface TooltipProps {
    content: string;
    children: ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
    delay?: number;
    disabled?: boolean;
}

export function Tooltip({ content, children, position = 'top', delay = 200, disabled = false }: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState({ x: 0, y: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<number | null>(null);

    const showTooltip = () => {
        timeoutRef.current = window.setTimeout(() => {
            setIsVisible(true);
        }, delay);
    };

    const hideTooltip = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setIsVisible(false);
    };

    useEffect(() => {
        if (isVisible && triggerRef.current && tooltipRef.current) {
            const triggerRect = triggerRef.current.getBoundingClientRect();
            const tooltipRect = tooltipRef.current.getBoundingClientRect();

            let x = 0;
            let y = 0;

            switch (position) {
                case 'top':
                    x = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
                    y = triggerRect.top - tooltipRect.height - 8;
                    break;
                case 'bottom':
                    x = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
                    y = triggerRect.bottom + 8;
                    break;
                case 'left':
                    x = triggerRect.left - tooltipRect.width - 8;
                    y = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
                    break;
                case 'right':
                    x = triggerRect.right + 8;
                    y = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
                    break;
            }

            // Keep tooltip within viewport
            x = Math.max(8, Math.min(x, window.innerWidth - tooltipRect.width - 8));
            y = Math.max(8, Math.min(y, window.innerHeight - tooltipRect.height - 8));

            setCoords({ x, y });
        }
    }, [isVisible, position]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    if (!content || disabled) {
        return <>{children}</>;
    }

    return (
        <>
            <div
                ref={triggerRef}
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
                className="inline-flex"
            >
                {children}
            </div>
            {isVisible && (
                <div
                    ref={tooltipRef}
                    className="fixed z-[9999] px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md shadow-lg
                        border border-slate-700/50 backdrop-blur-sm
                        animate-tooltip-fade-in
                        pointer-events-none"
                    style={{
                        left: coords.x,
                        top: coords.y,
                    }}
                >
                    {content}
                    {/* Arrow */}
                    <div
                        className={`absolute w-2 h-2 bg-slate-900 border-slate-700/50 transform rotate-45 ${
                            position === 'top' ? 'bottom-[-5px] left-1/2 -translate-x-1/2 border-r border-b' :
                            position === 'bottom' ? 'top-[-5px] left-1/2 -translate-x-1/2 border-l border-t' :
                            position === 'left' ? 'right-[-5px] top-1/2 -translate-y-1/2 border-r border-t' :
                            'left-[-5px] top-1/2 -translate-y-1/2 border-l border-b'
                        }`}
                    />
                </div>
            )}
        </>
    );
}
