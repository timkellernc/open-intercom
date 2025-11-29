export const colors = {
    background: '#0f172a', // slate-900
    surface: '#1e293b',    // slate-800
    primary: '#3b82f6',    // blue-500
    primaryHover: '#2563eb', // blue-600
    text: '#f8fafc',       // slate-50
    textSecondary: '#94a3b8', // slate-400
    border: 'rgba(255, 255, 255, 0.1)',
    success: '#10b981',    // emerald-500
    error: '#ef4444',      // red-500
    talking: '#ef4444',    // red-500 (for PTT button active)
    listening: '#3b82f6',  // blue-500 (for PTT button inactive)
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
};

export const typography = {
    h1: {
        fontSize: 24,
        fontWeight: 'bold' as const,
        color: colors.text,
    },
    body: {
        fontSize: 16,
        color: colors.text,
    },
    label: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 4,
    },
};
