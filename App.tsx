import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LoginScreen } from './src/screens/LoginScreen';
import { IntercomScreen } from './src/screens/IntercomScreen';
import { SettingsModal } from './src/components/SettingsModal';
import { colors } from './src/constants/theme';
import { webSocketService } from './src/services/WebSocketService';
import { audioService } from './src/services/AudioService';

const App = () => {
  const [currentScreen, setCurrentScreen] = useState<'login' | 'intercom'>('login');
  const [credentials, setCredentials] = useState({ username: '', serverUrl: '' });
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);

  const handleLogin = async (username: string, serverUrl: string) => {
    setCredentials({ username, serverUrl });

    // Force Opus codec (ignore stored setting for now)
    // const useOpus = await AsyncStorage.getItem('useOpus');
    const codec = 'opus'; // useOpus === 'true' ? 'opus' : 'pcm';

    console.log(`Connecting with codec: ${codec}`);
    webSocketService.connect(serverUrl, username, codec);
    audioService.start(); // Start audio engine for playback
    setCurrentScreen('intercom');
  };

  const handleLogout = () => {
    webSocketService.disconnect();
    audioService.stop(); // Stop audio engine
    setCredentials({ username: '', serverUrl: '' });
    setCurrentScreen('login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      {currentScreen === 'login' ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <>
          <IntercomScreen
            username={credentials.username}
            serverUrl={credentials.serverUrl}
            onLogout={handleLogout}
            onOpenSettings={() => setIsSettingsVisible(true)}
          />
          <SettingsModal
            visible={isSettingsVisible}
            onClose={() => setIsSettingsVisible(false)}
            onLogout={handleLogout}
          />
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default App;
