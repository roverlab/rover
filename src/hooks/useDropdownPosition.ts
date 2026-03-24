import { useState, useCallback, useRef } from 'react';

export interface DropdownPosition {
    top: number;
    left: number;
}

export interface UseDropdownPositionOptions {
    /** 菜单宽度，默认 120 */
    menuWidth?: number;
    /** 菜单高度，默认 130 */
    menuHeight?: number;
    /** 与触发元素的间隙，默认 4 */
    gap?: number;
    /** 与视口边缘的最小间距，默认 8 */
    edgePadding?: number;
}

/**
 * 通用下拉菜单位置计算 Hook
 * 自动检测视口边界，当菜单靠近底部时向上显示，避免被遮挡
 */
export function useDropdownPosition(options: UseDropdownPositionOptions = {}) {
    const {
        menuWidth = 120,
        menuHeight = 130,
        gap = 4,
        edgePadding = 8,
    } = options;

    const [position, setPosition] = useState<DropdownPosition>({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    /**
     * 计算并设置下拉菜单位置
     * @param buttonElement 触发按钮元素，不传则使用 buttonRef.current
     */
    const calculatePosition = useCallback((buttonElement?: HTMLElement | null) => {
        const button = buttonElement || buttonRef.current;
        if (!button) return;

        const rect = button.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // 计算垂直位置：优先向下显示，如果超出底部则向上显示
        const preferBelowTop = rect.bottom + gap;
        const placeAboveTop = rect.top - menuHeight - gap;
        const top = preferBelowTop + menuHeight <= viewportHeight - edgePadding
            ? preferBelowTop
            : Math.max(edgePadding, placeAboveTop);

        // 计算水平位置：优先右对齐，如果超出左边界则左对齐
        const preferredLeft = rect.right - menuWidth;
        const minLeft = edgePadding;
        const maxLeft = Math.max(edgePadding, viewportWidth - menuWidth - edgePadding);
        const left = Math.min(Math.max(preferredLeft, minLeft), maxLeft);

        setPosition({ top, left });
    }, [menuWidth, menuHeight, gap, edgePadding]);

    /**
     * 设置按钮 ref
     */
    const setButtonRef = useCallback((el: HTMLButtonElement | null) => {
        buttonRef.current = el;
    }, []);

    return {
        position,
        calculatePosition,
        buttonRef,
        setButtonRef,
    };
}

export default useDropdownPosition;
