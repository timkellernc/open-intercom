import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LoginScreen } from './src/screens/LoginScreen';
import { IntercomScreen } from './src/screens/IntercomScreen';
import { PeopleScreen } from './src/screens/PeopleScreen';
import { SettingsModal } from './src/components/SettingsModal';
import { colors } from './src/constants/theme';
import { webSocketService } from './src/services/WebSocketService';
import { audioService } from './src/services/AudioService';

const App = () => {
  const [currentScreen, setCurrentScreen] = useState<'login' | 'intercom' | 'people'>('login');
  const [credentials, setCredentials] = useState({ username: '', serverUrl: '' });
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);

  const handleLogin = async (username: string, serverUrl: string) => {
    setCredentials({ username, serverUrl });

    // Load codec preference from storage BEFORE starting audio engine
    const savedUseOpus = await AsyncStorage.getItem('useOpus');
    const codec = savedUseOpus === 'false' ? 'pcm' : 'opus'; // Default to opus if not set

    console.log(`Connecting with codec: ${codec}`);

    // IMPORTANT: Set codec BEFORE starting audio engine
    // This ensures the codec is set before setupEngine() is called
    audioService.setCodec(codec);

    // Now start audio engine (this will initialize the correct codec)
    audioService.start();

    // Then connect to server with the same codec
    webSocketService.connect(serverUrl, username, codec);

    // Don't switch screen immediately - wait for 'connected' event
  };

  React.useEffect(() => {
    const onConnected = () => {
      if (currentScreen === 'login') {
        setCurrentScreen('intercom');
      }
    };

    const onUserList = (users: string[]) => {
      // Filter out self
      const others = users.filter(u => u !== credentials.username);
      setActiveUsers(others);
    };

    const onUserJoined = (user: string) => {
      if (user !== credentials.username) {
        setActiveUsers(prev => [...prev, user]);
      }
    };

    const onUserLeft = (user: string) => {
      setActiveUsers(prev => prev.filter(u => u !== user));
    };

    webSocketService.on('connected', onConnected);
    webSocketService.on('user_list', onUserList);
    webSocketService.on('user_joined', onUserJoined);
    webSocketService.on('user_left', onUserLeft);

    // Request microphone permission on start
    const checkPermissions = async () => {
      const hasPermission = await audioService.requestPermission();
      if (!hasPermission) {
        // Optionally alert the user
        console.log('Microphone permission denied on start');
      }
    };
    checkPermissions();

    return () => {
      webSocketService.off('connected', onConnected);
      webSocketService.off('user_list', onUserList);
      webSocketService.off('user_joined', onUserJoined);
      webSocketService.off('user_left', onUserLeft);
    };
  }, [currentScreen, credentials.username]);

  const handleLogout = () => {
    webSocketService.disconnect();
    audioService.stop(); // Stop audio engine
    setCredentials({ username: '', serverUrl: '' });
    setActiveUsers([]);
    setCurrentScreen('login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      {currentScreen === 'login' ? (
        <LoginScreen onLogin={handleLogin} />
      ) : currentScreen === 'people' ? (
        <PeopleScreen
          username={credentials.username}
          activeUsers={activeUsers}
          onBack={() => setCurrentScreen('intercom')}
        />
      ) : (
        <>
          <IntercomScreen
            username={credentials.username}
            serverUrl={credentials.serverUrl}
            onLogout={handleLogout}
            onOpenSettings={() => setIsSettingsVisible(true)}
            onOpenPeople={() => setCurrentScreen('people')}
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
