import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginView from './views/LoginView';
import DoctorView from './views/DoctorView';
import ManagerView from './views/ManagerView';
import PwaInstallPrompt from './components/PwaInstallPrompt';

const PrivateRoute = ({ children, requireManager = false }) => {
    const { session, loading } = useAuth();
    
    if (loading) return null;
    if (!session) return <Navigate to="/" replace />;
    
    if (requireManager && !session.isManager) {
        return <Navigate to="/medico" replace />; // Médico tentando ir pro gestor
    }
    
    if (!requireManager && session.isManager) {
        return <Navigate to="/gestor" replace />; // Gestor tentando ir pro médico
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
                            <PrivateRoute>
                                <DoctorView />
                            </PrivateRoute>
                        } 
                    />
                    
                    <Route 
                        path="/gestor/*" 
                        element={
                            <PrivateRoute requireManager={true}>
                                <ManagerView />
                            </PrivateRoute>
                        } 
                    />
                    
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}
