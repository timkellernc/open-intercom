import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
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

  const handleLogin = (username: string, serverUrl: string) => {
    setCredentials({ username, serverUrl });
    webSocketService.connect(serverUrl, username);
    setCurrentScreen('intercom');
  };

  const handleLogout = () => {
    webSocketService.disconnect();
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
