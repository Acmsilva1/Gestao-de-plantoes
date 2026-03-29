import React, { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const raw = window.localStorage.getItem('maestro-session');
        if (raw) {
            try {
                setSession(JSON.parse(raw));
            } catch {
                window.localStorage.removeItem('maestro-session');
            }
        }
        setLoading(false);
    }, []);

    const login = (data, isManager = false) => {
        const newSession = { ...data, isManager };
        window.localStorage.setItem('maestro-session', JSON.stringify(newSession));
        setSession(newSession);
    };

    const logout = () => {
        window.localStorage.removeItem('maestro-session');
        setSession(null);
    };

    return (
        <AuthContext.Provider value={{ session, login, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
