import { useEffect } from 'react';
import { Platform, StatusBar } from 'react-native';

export interface StatusBarConfig {
  style?: 'dark-content' | 'light-content' | 'default';
  backgroundColor?: string;
  translucent?: boolean;
  hidden?: boolean;
}

/**
 * Hook for managing status bar configuration in individual screens
 * 
 * This hook allows screens to override the global status bar configuration
 * when needed, and automatically restores the default when the component unmounts.
 */
export const useStatusBar = (config: StatusBarConfig) => {
  useEffect(() => {
    let previousConfig: StatusBarConfig = {};
    
    if (Platform.OS === 'android') {
      // Save current config
      // It's not possible to directly get the current backgroundColor, translucent, or hidden values from StatusBar API.
      // So, we skip saving these values or set them to undefined.
      previousConfig = {
        backgroundColor: undefined,
        translucent: undefined,
        hidden: undefined,
      };
      
      // Apply new config
      if (config.backgroundColor) {
        StatusBar.setBackgroundColor(config.backgroundColor, true);
      }
      if (config.translucent !== undefined) {
        StatusBar.setTranslucent(config.translucent);
      }
      if (config.hidden !== undefined) {
        StatusBar.setHidden(config.hidden, 'slide');
      }
    }
    
    // Apply bar style for both platforms
    if (config.style) {
      StatusBar.setBarStyle(config.style, true);
    }
    
    // Cleanup function to restore previous config
    return () => {
      if (Platform.OS === 'android') {
        if (previousConfig.backgroundColor) {
          StatusBar.setBackgroundColor(previousConfig.backgroundColor, true);
        }
        if (previousConfig.translucent !== undefined) {
          StatusBar.setTranslucent(previousConfig.translucent);
        }
        if (previousConfig.hidden !== undefined) {
          StatusBar.setHidden(previousConfig.hidden, 'slide');
        }
      }
      
      // Restore default bar style
      StatusBar.setBarStyle('dark-content', true);
    };
  }, [config]);
};

export default useStatusBar;