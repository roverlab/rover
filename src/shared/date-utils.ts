/**
 * 日期时间工具函数
 */

/**
 * 格式化日期时间为易读格式
 * @param dateString ISO格式的日期字符串或原有的固定格式
 * @returns 格式化后的日期字符串
 */
export function formatDateTime(dateString: string | undefined): string {
    if (!dateString) return '—';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return dateString; // 如果解析失败，返回原始字符串
        }
        
        const now = new Date();
        const diffInMs = now.getTime() - date.getTime();
        const diffInHours = diffInMs / (1000 * 60 * 60);
        const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
        
        // 如果是今天，显示时间
        if (diffInHours < 24 && date.toDateString() === now.toDateString()) {
            return `今天 ${date.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
            })}`;
        }
        
        // 如果是昨天
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (diffInHours < 48 && date.toDateString() === yesterday.toDateString()) {
            return `昨天 ${date.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
            })}`;
        }
        
        // 如果是今年，只显示月日和时间
        if (date.getFullYear() === now.getFullYear()) {
            return date.toLocaleString('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        // 其他情况显示完整日期
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        console.warn('Date formatting error:', e);
        return dateString; // 出错时返回原始字符串
    }
}

/**
 * 格式化相对时间（多久以前）
 * @param dateString ISO格式的日期字符串
 * @returns 相对时间描述
 */
export function formatRelativeTime(dateString: string | undefined): string {
    if (!dateString) return '从未更新';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return '时间格式错误';
        }
        
        const now = new Date();
        const diffInMs = now.getTime() - date.getTime();
        const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
        const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
        const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
        
        if (diffInMinutes < 1) return '刚刚';
        if (diffInMinutes < 60) return `${diffInMinutes}分钟前`;
        if (diffInHours < 24) return `${diffInHours}小时前`;
        if (diffInDays < 7) return `${diffInDays}天前`;
        
        // 超过一周显示具体日期
        return formatDateTime(dateString);
    } catch (e) {
        console.warn('Relative time formatting error:', e);
        return '时间格式错误';
    }
}