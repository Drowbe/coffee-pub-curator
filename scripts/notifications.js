import { MODULE } from './const.js';

const STYLES = {
    info: { icon: 'fa-solid fa-circle-info', color: '#4aa3df' },
    warn: { icon: 'fa-solid fa-triangle-exclamation', color: '#f0ad4e' },
    error: { icon: 'fa-solid fa-circle-exclamation', color: '#d9534f' }
};

function show(level, message, options = {}) {
    const toast = game.modules.get('coffee-pub-blacksmith')?.api?.toast;
    if (typeof toast?.show !== 'function') {
        console[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'info'](`${MODULE.TITLE} | ${message}`);
        return null;
    }

    const style = STYLES[level] ?? STYLES.info;
    return toast.show({
        title: options.title ?? MODULE.TITLE,
        subtitle: String(message ?? ''),
        icon: options.icon ?? style.icon,
        color: options.color ?? style.color,
        duration: options.duration ?? 8,
        moduleId: MODULE.ID,
        stackKey: options.stackKey ?? null
    });
}

export const notify = {
    info: (message, options) => show('info', message, options),
    warn: (message, options) => show('warn', message, options),
    error: (message, options) => show('error', message, options)
};
