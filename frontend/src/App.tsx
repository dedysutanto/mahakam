import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Ledgers from './pages/Ledgers'
import Invoices from './pages/Invoices'
import Expenses from './pages/Expenses'
import Reports from './pages/Reports'
import Customers from './pages/Customers'
import Products from './pages/Products'
import Purchases from './pages/Purchases'
import Quotes from './pages/Quotes'
import SuperAdmin from './pages/SuperAdmin'
import Profile from './pages/Profile'
import Taxes from './pages/Taxes'
import SettingsPage from './pages/Settings'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/buku-besar"
        element={
          <ProtectedRoute>
            <Ledgers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faktur"
        element={
          <ProtectedRoute>
            <Invoices />
          </ProtectedRoute>
        }
      />
      <Route
        path="/penawaran"
        element={
          <ProtectedRoute>
            <Quotes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pengeluaran"
        element={
          <ProtectedRoute>
            <Expenses />
          </ProtectedRoute>
        }
      />
      <Route
        path="/produk"
        element={
          <ProtectedRoute>
            <Products />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pembelian"
        element={
          <ProtectedRoute>
            <Purchases />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pajak"
        element={
          <ProtectedRoute>
            <Taxes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/laporan"
        element={
          <ProtectedRoute>
            <Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pelanggan"
        element={
          <ProtectedRoute>
            <Customers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profil"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin-sistem"
        element={
          <ProtectedRoute>
            <SuperAdmin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pengaturan"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
