import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './shared/context/AuthContext';
import LoginView from './features/auth/views/LoginView';
import DoctorView from './features/doctor/views/DoctorView';
import ManagerView from './features/manager/views/ManagerView';
import AdminView from './features/auth/views/AdminView';
import PwaInstallPrompt from './shared/components/PwaInstallPrompt';

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
