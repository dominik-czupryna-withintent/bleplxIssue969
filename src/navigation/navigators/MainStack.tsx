import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import * as screenComponents from '../../screens';
import {useCommonScreenOptions} from '../components';

export type MainStackParamList = {
  DASHBOARD_SCREEN: undefined;
};

const MainStack = createNativeStackNavigator<MainStackParamList>();

export function MainStackComponent() {
  const commonScreenOptions = useCommonScreenOptions();

  return (
    <MainStack.Navigator screenOptions={commonScreenOptions}>
      <MainStack.Screen
        name="DASHBOARD_SCREEN"
        component={screenComponents.DashboardScreen}
        options={{
          headerTitle: 'Dashboard',
        }}
      />
    </MainStack.Navigator>
  );
}
