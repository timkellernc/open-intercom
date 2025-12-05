import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, typography } from '../constants/theme';
import { webSocketService } from '../services/WebSocketService';

interface LoginScreenProps {
    onLogin: (username: string, serverUrl: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [serverUrl, setServerUrl] = useState('ws://192.168.1.150:3000'); // Default placeholder
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const savedUsername = await AsyncStorage.getItem('username');
            const savedServerUrl = await AsyncStorage.getItem('serverUrl');

            if (savedUsername) setUsername(savedUsername);
            if (savedServerUrl) setServerUrl(savedServerUrl);
        } catch (error) {
            console.error('Failed to load settings', error);
        }
    };

    const handleLogin = async () => {
        if (!username.trim()) {
            Alert.alert('Error', 'Please enter a username');
            return;
        }
        let formattedUrl = serverUrl.trim();
        if (!formattedUrl) {
            Alert.alert('Error', 'Please enter a server address');
            return;
        }



        setIsLoading(true);

        try {
            await AsyncStorage.setItem('username', username);
            await AsyncStorage.setItem('serverUrl', formattedUrl);

            // Auto-prepend ws:// if missing
            if (!formattedUrl.startsWith('ws://') && !formattedUrl.startsWith('wss://')) {
                formattedUrl = `ws://${formattedUrl}`;
            }

            // Start connection
            onLogin(username, formattedUrl);

            // Wait for connection or timeout
            await new Promise<void>((resolve, reject) => {
                let timeoutId: NodeJS.Timeout;

                const cleanup = () => {
                    clearTimeout(timeoutId);
                    webSocketService.off('connected', onConnected);
                    webSocketService.off('error', onError);
                    webSocketService.off('login_error', onError);
                };

                const onConnected = () => {
                    cleanup();
                    resolve();
                };

                const onError = (err: any) => {
                    cleanup();
                    reject(new Error(err?.message || 'Connection failed'));
                };

                // 5 second timeout
                timeoutId = setTimeout(() => {
                    cleanup();
                    reject(new Error('Connection timed out'));
                }, 5000);

                webSocketService.on('connected', onConnected);
                webSocketService.on('error', onError);
                webSocketService.on('login_error', onError);
            });

        } catch (error: any) {
            Alert.alert('Error', error.message);
            webSocketService.disconnect(); // Cancel connection attempt
            setIsLoading(false); // Only stop loading on error (on success, component unmounts)
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <View style={styles.content}>
                <Text style={styles.title}>Open Intercom</Text>
                <Text style={styles.subtitle}>Secure, low-latency voice chat</Text>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Server Address</Text>
                    <TextInput
                        style={styles.input}
                        value={serverUrl}
                        onChangeText={setServerUrl}
                        placeholder="192.168.1.x:3000"
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Username</Text>
                    <TextInput
                        style={styles.input}
                        value={username}
                        onChangeText={setUsername}
                        placeholder="Enter your username"
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>

                <TouchableOpacity
                    style={[styles.button, isLoading && styles.buttonDisabled]}
                    onPress={handleLogin}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.buttonText}>Connect</Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'center',
    },
    content: {
        padding: spacing.xl,
        width: '100%',
        maxWidth: 500,
        alignSelf: 'center',
    },
    title: {
        ...typography.h1,
        fontSize: 32,
        textAlign: 'center',
        marginBottom: spacing.xs,
        color: colors.primary,
    },
    subtitle: {
        ...typography.body,
        textAlign: 'center',
        marginBottom: spacing.xl,
        color: colors.textSecondary,
    },
    inputGroup: {
        marginBottom: spacing.lg,
    },
    label: {
        ...typography.label,
        marginLeft: spacing.xs,
    },
    input: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        padding: spacing.md,
        color: colors.text,
        fontSize: 16,
    },
    button: {
        backgroundColor: colors.primary,
        padding: spacing.md,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: spacing.sm,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
