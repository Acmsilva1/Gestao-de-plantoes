import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginView from './views/LoginView';
import DoctorView from './views/DoctorView';
import ManagerView from './views/ManagerView';
import AdminView from './views/AdminView';
import PwaInstallPrompt from './components/PwaInstallPrompt';

const PrivateRoute = ({ children, requiredPerfil = 'medico' }) => {
    const { session, loading } = useAuth();
    
    if (loading) return null;
    if (!session) return <Navigate to="/" replace />;
    
    if (session.perfil !== requiredPerfil) {
        return <Navigate to="/" replace />; // Redireciona pro login se o perfil não bater
    }
    
    return children;
};

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <PwaInstallPrompt />
                <Routes>
                    <Route path="/" element={<LoginView />} />
                    
                    <Route 
                        path="/medico/*" 
                        element={
                            <PrivateRoute requiredPerfil="medico">
                                <DoctorView />
                            </PrivateRoute>
                        } 
                    />
                    
                    <Route 
                        path="/gestor/*" 
                        element={
                            <PrivateRoute requiredPerfil="gestor">
                                <ManagerView />
                            </PrivateRoute>
                        } 
                    />

                    <Route 
                        path="/admin/*" 
                        element={
                            <PrivateRoute requiredPerfil="admin">
                                <AdminView />
                            </PrivateRoute>
                        } 
                    />
                    
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}
