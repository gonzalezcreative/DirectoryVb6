import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { 
  collection, 
  addDoc, 
  updateDoc,
  doc, 
  query, 
  onSnapshot,
  Timestamp,
  where,
  or,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';

export interface Lead {
  id: string;
  category: string;
  equipmentTypes: string[];
  rentalDuration: string;
  startDate: string;
  budget: string;
  street: string;
  city: string;
  zipCode: string;
  name: string;
  email: string;
  phone: string;
  details: string;
  status: 'New' | 'Purchased' | 'Archived';
  leadStatus?: string;
  createdAt: string;
  purchasedBy: string[];
  purchaseDates: { [userId: string]: string };
}

interface LeadState {
  leads: Lead[];
  loading: boolean;
  error: string | null;
}

type LeadAction = 
  | { type: 'SET_LEADS'; payload: Lead[] }
  | { type: 'ADD_LEAD'; payload: Lead }
  | { type: 'UPDATE_LEAD'; payload: Lead }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string };

const initialState: LeadState = {
  leads: [],
  loading: true,
  error: null
};

const LeadContext = createContext<{
  state: LeadState;
  addLead: (lead: Omit<Lead, 'id' | 'status' | 'createdAt' | 'purchasedBy' | 'purchaseDates'>) => Promise<void>;
  purchaseLead: (leadId: string) => Promise<void>;
  updateLeadStatus: (leadId: string, status: string) => Promise<void>;
} | undefined>(undefined);

function leadReducer(state: LeadState, action: LeadAction): LeadState {
  switch (action.type) {
    case 'SET_LEADS':
      return {
        ...state,
        leads: action.payload,
        loading: false
      };
    case 'ADD_LEAD':
      return {
        ...state,
        leads: [...state.leads, action.payload]
      };
    case 'UPDATE_LEAD':
      return {
        ...state,
        leads: state.leads.map(lead =>
          lead.id === action.payload.id ? action.payload : lead
        )
      };
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload
      };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        loading: false
      };
    default:
      return state;
  }
}

export function LeadProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(leadReducer, initialState);
  const { user } = useAuth();

  useEffect(() => {
    let q;
    
    if (user) {
      if (user.role === 'admin') {
        // Admin sees all leads
        q = query(collection(db, 'leads'));
      } else {
        // Regular users see new leads and leads they've purchased
        q = query(
          collection(db, 'leads'),
          or(
            where('status', '==', 'New'),
            where('purchasedBy', 'array-contains', user.id)
          )
        );
      }
    } else {
      // Non-authenticated users only see new leads
      q = query(collection(db, 'leads'), where('status', '==', 'New'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const leads = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lead[];
      
      dispatch({ type: 'SET_LEADS', payload: leads });
    }, (error) => {
      console.error('Error fetching leads:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message });
    });

    return () => unsubscribe();
  }, [user]);

  const addLead = async (leadData: Omit<Lead, 'id' | 'status' | 'createdAt' | 'purchasedBy' | 'purchaseDates'>) => {
    try {
      const newLead = {
        ...leadData,
        status: 'New' as const,
        createdAt: Timestamp.now().toDate().toISOString(),
        purchasedBy: [],
        purchaseDates: {}
      };

      await addDoc(collection(db, 'leads'), newLead);
    } catch (error) {
      console.error('Error adding lead:', error);
      throw error;
    }
  };

  const purchaseLead = async (leadId: string) => {
    if (!user) throw new Error('Must be logged in to purchase leads');
    
    try {
      const leadRef = doc(db, 'leads', leadId);
      const lead = state.leads.find(l => l.id === leadId);
      
      if (!lead) throw new Error('Lead not found');
      if (lead.purchasedBy.includes(user.id)) throw new Error('You have already purchased this lead');
      if (lead.purchasedBy.length >= 3) throw new Error('This lead has reached its maximum number of purchases');

      const updates: any = {
        purchasedBy: arrayUnion(user.id),
        [`purchaseDates.${user.id}`]: Timestamp.now().toDate().toISOString()
      };

      // If this is the third purchase, update status to Archived
      if (lead.purchasedBy.length === 2) {
        updates.status = 'Archived';
      } else {
        updates.status = 'Purchased';
      }

      await updateDoc(leadRef, updates);
    } catch (error) {
      console.error('Error purchasing lead:', error);
      throw error;
    }
  };

  const updateLeadStatus = async (leadId: string, status: string) => {
    try {
      const leadRef = doc(db, 'leads', leadId);
      await updateDoc(leadRef, {
        leadStatus: status,
        updatedAt: Timestamp.now().toDate().toISOString()
      });
    } catch (error) {
      console.error('Error updating lead status:', error);
      throw error;
    }
  };

  return (
    <LeadContext.Provider value={{ state, addLead, purchaseLead, updateLeadStatus }}>
      {children}
    </LeadContext.Provider>
  );
}

export function useLeads() {
  const context = useContext(LeadContext);
  if (context === undefined) {
    throw new Error('useLeads must be used within a LeadProvider');
  }
  return context;
}