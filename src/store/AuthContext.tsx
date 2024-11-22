import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface User {
  id: string;
  email: string | null;
  businessName?: string;
  website?: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, businessName?: string, website?: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const userData = userDoc.data();
          
          if (userData) {
            setUser({
              id: firebaseUser.uid,
              email: firebaseUser.email,
              businessName: userData.businessName,
              website: userData.website,
              role: userData.role || 'user',
              status: userData.status || 'active'
            });
          } else {
            // If user document doesn't exist, create it
            const newUser = {
              id: firebaseUser.uid,
              email: firebaseUser.email,
              role: 'user',
              status: 'active',
              createdAt: new Date().toISOString()
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
            setUser(newUser as User);
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Error setting up user:', error);
        setUser(null);
      } finally {
        setLoading(false);
        setInitializing(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signup = async (email: string, password: string, businessName?: string, website?: string) => {
    try {
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const { user: firebaseUser } = userCredential;

      const userData = {
        email: firebaseUser.email,
        businessName,
        website,
        role: 'user',
        status: 'active',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', firebaseUser.uid), userData);
      
      // Set the user state immediately after signup
      setUser({
        id: firebaseUser.uid,
        email: firebaseUser.email,
        businessName,
        website,
        role: 'user',
        status: 'active'
      });

      navigate('/business');
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setLoading(true);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const { user: firebaseUser } = userCredential;

      // Fetch user data immediately after login
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      const userData = userDoc.data();

      if (userData) {
        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          businessName: userData.businessName,
          website: userData.website,
          role: userData.role || 'user',
          status: userData.status || 'active'
        });
      }

      navigate('/business');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await signOut(auth);
      setUser(null);
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = () => {
    return user?.role === 'admin';
  };

  // Show loading spinner only during initial load
  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}