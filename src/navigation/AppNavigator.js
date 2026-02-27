import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import AuthNavigator from './AuthNavigator';
import FarmerNavigator from './FarmerNavigator';
import ContractorNavigator from './ContractorNavigator';
import BuyerNavigator from './BuyerNavigator';
import { colors } from '../config/theme';

export default function AppNavigator() {
  const { user, userProfile, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user || !userProfile?.role) {
    return <AuthNavigator />;
  }

  switch (userProfile.role) {
    case 'farmer':
      return <FarmerNavigator />;
    case 'contractor':
      return <ContractorNavigator />;
    case 'buyer':
      return <BuyerNavigator />;
    default:
      return <AuthNavigator />;
  }
}
