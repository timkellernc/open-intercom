import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    StatusBar,
    Animated,
    PanResponder,
} from 'react-native';
import { colors, spacing, typography } from '../constants/theme';
import Svg, { Path, Circle } from 'react-native-svg';

import { webSocketService } from '../services/WebSocketService';
import { audioService } from '../services/AudioService';

interface IntercomScreenProps {
    username: string;
    serverUrl: string;
    onLogout: () => void;
    onOpenSettings: () => void;
}

export const IntercomScreen: React.FC<IntercomScreenProps> = ({
    username,
    serverUrl,
    onLogout,
    onOpenSettings
}) => {
    const [isTalking, setIsTalking] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [activeUsers, setActiveUsers] = useState<string[]>([]);

    // Animation for PTT button
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // Subscribe to WebSocket events
        const onConnected = () => setIsConnected(true);
        const onDisconnected = () => setIsConnected(false);
        const onUserList = (users: string[]) => {
            // Filter out self
            const others = users.filter(u => u !== username);
            setActiveUsers(others);
        };
        const onUserJoined = (user: string) => {
            if (user !== username) {
                setActiveUsers(prev => [...prev, user]);
            }
        };
        const onUserLeft = (user: string) => {
            setActiveUsers(prev => prev.filter(u => u !== user));
        };

        webSocketService.on('connected', onConnected);
        webSocketService.on('disconnected', onDisconnected);
        webSocketService.on('user_list', onUserList);
        webSocketService.on('user_joined', onUserJoined);
        webSocketService.on('user_left', onUserLeft);

        return () => {
            webSocketService.off('connected', onConnected);
            webSocketService.off('disconnected', onDisconnected);
            webSocketService.off('user_list', onUserList);
            webSocketService.off('user_joined', onUserJoined);
            webSocketService.off('user_left', onUserLeft);
        };
    }, [username]);

    const startTalking = async () => {
        setIsTalking(true);
        Animated.spring(scaleAnim, {
            toValue: 0.95,
            useNativeDriver: true,
        }).start();
        await audioService.startRecording();
    };

    const stopTalking = async () => {
        setIsTalking(false);
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
        }).start();
        await audioService.stopRecording();
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.statusContainer}>
                    <View style={[styles.statusDot, isConnected && styles.statusDotConnected]} />
                    <Text style={styles.statusText} numberOfLines={1}>
                        {isConnected ? `Logged in as ${username}` : 'Connecting...'}
                    </Text>
                </View>

                <TouchableOpacity onPress={onOpenSettings} style={styles.iconButton}>
                    <Svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0" fill={colors.textSecondary} stroke="none" />
                        <Path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z" fill={colors.textSecondary} stroke="none" />
                    </Svg>
                </TouchableOpacity>
            </View>

            {/* Main Content */}
            <View style={styles.content}>
                {/* User List */}
                <View style={styles.userList}>
                    <Text style={styles.sectionTitle}>Active Users ({activeUsers.length})</Text>
                    {activeUsers.map((user, index) => (
                        <View key={index} style={styles.userItem}>
                            <View style={styles.userAvatar}>
                                <Text style={styles.userAvatarText}>{user.charAt(0)}</Text>
                            </View>
                            <Text style={styles.userName}>{user}</Text>
                        </View>
                    ))}
                </View>

                {/* PTT Button */}
                <View style={styles.pttContainer}>
                    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPressIn={startTalking}
                            onPressOut={stopTalking}
                            style={[
                                styles.pttButton,
                                isTalking ? styles.pttButtonActive : styles.pttButtonInactive
                            ]}
                        >
                            <View style={[
                                styles.pttInner,
                                isTalking ? styles.pttInnerActive : styles.pttInnerInactive
                            ]}>
                                <Svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                    <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                    <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                    <Path d="M12 19v4" />
                                    <Path d="M8 23h8" />
                                </Svg>
                                <Text style={styles.pttText}>{isTalking ? 'TALKING' : 'HOLD TO TALK'}</Text>
                            </View>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.md,
        backgroundColor: colors.surface,
        margin: spacing.md,
        borderRadius: 12,
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    statusDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.error,
        marginRight: spacing.sm,
    },
    statusDotConnected: {
        backgroundColor: colors.success,
        shadowColor: colors.success,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 5,
    },
    statusText: {
        ...typography.body,
        color: colors.textSecondary,
        fontSize: 14,
        flex: 1,
    },
    iconButton: {
        padding: spacing.xs,
    },
    content: {
        flex: 1,
        padding: spacing.md,
        justifyContent: 'space-between',
    },
    userList: {
        flex: 1,
    },
    sectionTitle: {
        ...typography.label,
        marginBottom: spacing.md,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.md,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        padding: spacing.sm,
        borderRadius: 8,
    },
    userAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.md,
    },
    userAvatarText: {
        color: 'white',
        fontWeight: 'bold',
    },
    userName: {
        ...typography.body,
    },
    pttContainer: {
        alignItems: 'center',
        marginBottom: spacing.xl,
    },
    pttButton: {
        width: 200,
        height: 200,
        borderRadius: 100,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.30,
        shadowRadius: 4.65,
        elevation: 8,
    },
    pttButtonInactive: {
        backgroundColor: '#1e293b', // Dark slate
        borderWidth: 4,
        borderColor: colors.primary,
    },
    pttButtonActive: {
        backgroundColor: colors.talking,
        borderWidth: 4,
        borderColor: '#fca5a5', // Light red
        shadowColor: colors.talking,
        shadowOpacity: 0.6,
        shadowRadius: 20,
    },
    pttInner: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    pttInnerInactive: {
        opacity: 0.8,
    },
    pttInnerActive: {
        opacity: 1,
    },
    pttText: {
        color: 'white',
        fontWeight: 'bold',
        marginTop: spacing.sm,
        fontSize: 16,
        letterSpacing: 1,
    },
});
