import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

// Plan configurations - moved outside component to avoid fast refresh warning
const PLAN_CONFIGS = {
  free: {
    name: 'Free',
    maxServices: 3,
    maxEmployees: 2,
    maxBookingsPerMonth: 50,
    features: ['basicSupport', 'basicAnalytics', 'profileCustomization'],
    price: 0
  },
  basic: {
    name: 'Basic',
    maxServices: 10,
    maxEmployees: 5,
    maxBookingsPerMonth: 200,
    features: ['basicSupport', 'basicAnalytics', 'employeeManagement', 'profileCustomization'],
    price: 29
  },
  professional: {
    name: 'Professional',
    maxServices: 25,
    maxEmployees: 15,
    maxBookingsPerMonth: 1000,
    features: ['basicSupport', 'basicAnalytics', 'employeeManagement', 'advancedAnalytics', 'customBranding', 'profileCustomization'],
    price: 79
  },
  enterprise: {
    name: 'Enterprise',
    maxServices: -1, // unlimited
    maxEmployees: -1, // unlimited
    maxBookingsPerMonth: -1, // unlimited
    features: ['prioritySupport', 'advancedAnalytics', 'employeeManagement', 'customBranding', 'apiAccess', 'whiteLabel', 'profileCustomization'],
    price: 199
  }
};

const SubscriptionContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

export const SubscriptionProvider = ({ children }) => {
  const { currentUser, userRole } = useAuth();
  const [subscriptionData, setSubscriptionData] = useState({
    plan: 'free',
    status: 'active',
    trialEndsAt: null,
    currentPeriodEnd: null,
    usage: {
      services: 0,
      employees: 0,
      bookingsThisMonth: 0
    }
  });

  const fetchSubscriptionData = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    try {
      const token = await currentUser.getIdToken();
      // Use full backend URL in production, relative URL in development
      const apiBaseUrl = import.meta.env.DEV ? '' : 'https://zootel.shop';
      const response = await fetch(`${apiBaseUrl}/api/subscription`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSubscriptionData(prev => ({ ...prev, ...data }));
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Failed to fetch subscription data:', errorData);
        throw new Error(errorData.message || 'Failed to fetch subscription data');
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
      // Don't throw here to prevent crashes, just log the error
    }
  }, [currentUser]);

  useEffect(() => {
    fetchSubscriptionData();
  }, [fetchSubscriptionData]);

  const startTrial = async (planId) => {
    try {
      const token = await currentUser.getIdToken();
      // Use full backend URL in production, relative URL in development
      const apiBaseUrl = import.meta.env.DEV ? '' : 'https://zootel.shop';
      const response = await fetch(`${apiBaseUrl}/api/companies/subscription/trial`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ planId })
      });

      if (response.ok) {
        await fetchSubscriptionData();
        return { success: true };
      } else {
        const errorData = await response.json();
        return { success: false, error: errorData.message };
      }
    } catch (error) {
      console.error('Error starting trial:', error);
      return { success: false, error: 'Failed to start trial' };
    }
  };

  const subscribe = async (planId, billingPeriod = 'monthly') => {
    try {
      const token = await currentUser.getIdToken();
      // Use full backend URL in production, relative URL in development
      const apiBaseUrl = import.meta.env.DEV ? '' : 'https://zootel.shop';
      const response = await fetch(`${apiBaseUrl}/api/companies/subscription/subscribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ planId, billingPeriod })
      });

      if (response.ok) {
        await fetchSubscriptionData();
        return { success: true };
      } else {
        const errorData = await response.json();
        return { success: false, error: errorData.message };
      }
    } catch (error) {
      console.error('Error subscribing:', error);
      return { success: false, error: 'Failed to subscribe' };
    }
  };

  const cancelSubscription = async () => {
    try {
      const token = await currentUser.getIdToken();
      // Use full backend URL in production, relative URL in development
      const apiBaseUrl = import.meta.env.DEV ? '' : 'https://zootel.shop';
      const response = await fetch(`${apiBaseUrl}/api/companies/subscription/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        await fetchSubscriptionData();
        return { success: true };
      } else {
        const errorData = await response.json();
        return { success: false, error: errorData.message };
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      return { success: false, error: 'Failed to cancel subscription' };
    }
  };

  // Feature access checking
  const hasFeature = (featureName) => {
    // Service providers (pet_company) get all features unlimited
    if (userRole === 'pet_company') return true;
    
    if (!subscriptionData.plan) return false;
    
    const plan = PLAN_CONFIGS[subscriptionData.plan];
    if (!plan) return false;
    
    return plan.features.includes(featureName) || false;
  };

  const getFeatureLimit = (featureName) => {
    // Service providers (pet_company) get unlimited access to all features
    if (userRole === 'pet_company') return -1;
    
    if (!subscriptionData.plan) return 0;
    
    const plan = PLAN_CONFIGS[subscriptionData.plan];
    if (!plan) return 0;
    
    return plan.features.includes(featureName) ? -1 : 0; // Unlimited if feature is in features array
  };

  const isFeatureUnlimited = (featureName) => {
    // Service providers (pet_company) get unlimited access to all features
    if (userRole === 'pet_company') return true;
    
    return getFeatureLimit(featureName) === -1;
  };

  const canAccessFeature = (featureName, currentUsage = 0) => {
    if (!hasAccess()) return false;
    
    // Service providers (pet_company) get unlimited access to all features
    if (userRole === 'pet_company') return true;
    
    const limit = getFeatureLimit(featureName);
    if (limit === -1) return true; // unlimited
    if (limit === 0) return false; // not available
    
    return currentUsage < limit;
  };

  // Subscription status checks
  const hasAccess = () => {
    // Service providers (pet_company) always have access to all features
    if (userRole === 'pet_company') return true;
    
    // For other users, check subscription status
    return subscriptionData.status === 'active' || subscriptionData.status === 'trial';
  };

  const isTrialActive = () => {
    if (subscriptionData.status !== 'trial') return false;
    
    const now = new Date();
    return !subscriptionData.trialEndsAt || new Date(subscriptionData.trialEndsAt) > now;
  };

  const isTrialExpired = () => {
    if (subscriptionData.status !== 'trial') return false;
    
    const now = new Date();
    return subscriptionData.trialEndsAt && new Date(subscriptionData.trialEndsAt) <= now;
  };

  const getTrialDaysRemaining = () => {
    if (!isTrialActive()) return 0;
    
    const now = new Date();
    const trialEnd = new Date(subscriptionData.trialEndsAt);
    const diffTime = trialEnd - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  };

  const getSubscriptionStatus = () => {
    if (!hasAccess()) return 'No Access';
    
    if (isTrialActive()) {
      const daysRemaining = getTrialDaysRemaining();
      return `Trial (${daysRemaining} days left)`;
    }
    
    if (isTrialExpired()) {
      return 'Trial Expired';
    }
    
    if (subscriptionData.status === 'active') {
      return `Active - ${PLAN_CONFIGS[subscriptionData.plan]?.name || 'Unknown Plan'}`;
    }
    
    if (subscriptionData.status === 'expired') {
      return 'Subscription Expired';
    }
    
    if (subscriptionData.status === 'cancelled') {
      return 'Subscription Cancelled';
    }
    
    return 'No Active Subscription';
  };

  const getUpgradeMessage = () => {
    if (!subscriptionData.plan) {
      return 'Start your free trial to access premium features';
    }
    
    const currentPlan = PLAN_CONFIGS[subscriptionData.plan];
    if (!currentPlan) return '';
    
    if (subscriptionData.plan === 'free') {
      return 'Upgrade to Basic for advanced analytics and more features';
    }
    
    if (subscriptionData.plan === 'basic') {
      return 'Upgrade to Professional for unlimited access and priority support';
    }
    
    return '';
  };

  const value = {
    // Subscription data
    subscriptionData,
    planConfigs: PLAN_CONFIGS,
    
    // Actions
    startTrial,
    subscribe,
    cancelSubscription,
    fetchSubscriptionData,
    
    // Feature checking
    hasFeature,
    getFeatureLimit,
    isFeatureUnlimited,
    canAccessFeature,
    
    // Status checking
    hasAccess,
    isTrialActive,
    isTrialExpired,
    getTrialDaysRemaining,
    getSubscriptionStatus,
    getUpgradeMessage
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}; 