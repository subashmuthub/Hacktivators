import { useState, useEffect } from 'react';

export interface User {
    email: string;
    name: string;
    role: 'student' | 'teacher';
    isPremium: boolean;
    joinedAt: string;
}

const USERS_KEY = 'cogniflow_users';
const SESSION_KEY = 'cogniflow_session';

function getUsers(): Record<string, { password: string; user: User }> {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); } catch { return {}; }
}

function saveUsers(users: Record<string, { password: string; user: User }>) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) {
            try { setUser(JSON.parse(raw)); } catch { }
        }
        setLoading(false);
    }, []);

    const signup = (email: string, password: string, name: string, role: 'student' | 'teacher'): string | null => {
        const users = getUsers();
        if (users[email]) return 'An account with this email already exists.';
        const newUser: User = { email, name, role, isPremium: false, joinedAt: new Date().toISOString() };
        users[email] = { password, user: newUser };
        saveUsers(users);
        localStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
        setUser(newUser);
        return null;
    };

    const login = (email: string, password: string): string | null => {
        const users = getUsers();
        const record = users[email];
        if (!record) return 'No account found with this email.';
        if (record.password !== password) return 'Incorrect password.';
        localStorage.setItem(SESSION_KEY, JSON.stringify(record.user));
        setUser(record.user);
        return null;
    };

    const logout = () => {
        localStorage.removeItem(SESSION_KEY);
        setUser(null);
    };

    const upgradeToPremium = () => {
        if (!user) return;
        const updated = { ...user, isPremium: true };
        const users = getUsers();
        if (users[user.email]) {
            users[user.email].user = updated;
            saveUsers(users);
        }
        localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
        setUser(updated);
    };

    return { user, loading, signup, login, logout, upgradeToPremium };
}
