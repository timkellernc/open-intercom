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
    useWindowDimensions,
} from 'react-native';
import { colors, spacing, typography } from '../constants/theme';
import Svg, { Path, Circle } from 'react-native-svg';

import { webSocketService, ChannelGroup, Channel } from '../services/WebSocketService';
import { audioService } from '../services/AudioService';
import { ChannelGroupSelector } from '../components/ChannelGroupSelector';
import { ChannelList } from '../components/ChannelList';

interface IntercomScreenProps {
    username: string;
    serverUrl: string;
    onLogout: () => void;
    onOpenSettings: () => void;
    onOpenPeople: () => void;
}

export const IntercomScreen: React.FC<IntercomScreenProps> = ({
    username,
    serverUrl,
    onLogout,
    onOpenSettings,
    onOpenPeople
}) => {
    const { width: screenWidth } = useWindowDimensions();
    const [isTalking, setIsTalking] = useState(false);
    const [isConnected, setIsConnected] = useState(webSocketService.isConnected);
    const [activeUsers, setActiveUsers] = useState<string[]>(
        webSocketService.getUsers().filter(u => u !== username)
    );

    // Channel State
    const [allChannels, setAllChannels] = useState<Channel[]>(webSocketService.getAllChannels());
    const [channelGroups, setChannelGroups] = useState<ChannelGroup[]>(webSocketService.getChannelGroups());
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [listenChannels, setListenChannels] = useState<number[]>([]);
    const [talkChannels, setTalkChannels] = useState<number[]>([]);
    const [activeChannels, setActiveChannels] = useState<number[]>([]); // Channels with activity
    const [pressedChannels, setPressedChannels] = useState<number[]>([]); // Channels being pressed for PTT

    // Push-to-talk configuration
    const CHANNEL_HOLD_DURATION_MS = 100; // Time in ms user must hold before activating (300ms = 0.3s)
    const channelHoldTimers = useRef<Map<number, NodeJS.Timeout>>(new Map());

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

        const onChannelGroups = (groups: ChannelGroup[]) => {
            setChannelGroups(groups);
            // Select first group by default if none selected
            if (groups.length > 0 && !selectedGroupId) {
                // We need allChannels to be populated first ideally, but we can just set the ID
                // and let the effect or render handle it.
                // However, handleSelectGroup uses allChannels.
                // Let's just set the ID here and handle the logic in an effect or when both are ready.
                // Or just call handleSelectGroup if we have channels.
            }
        };

        const onChannelList = (channelsList: Channel[]) => {
            setAllChannels(channelsList);
        };

        const onChannelActivity = (activeIds: number[]) => {
            console.log('IntercomScreen: Active Channels Update:', activeIds);
            setActiveChannels(activeIds);
        };

        webSocketService.on('channel_groups', onChannelGroups);
        webSocketService.on('channel_list', onChannelList);
        webSocketService.on('channel_activity', onChannelActivity);

        // Initial fetch to handle race condition where user_list event 
        // might have fired before we subscribed
        const currentUsers = webSocketService.getUsers();
        if (currentUsers.length > 0) {
            onUserList(currentUsers);
        }

        return () => {
            webSocketService.off('connected', onConnected);
            webSocketService.off('disconnected', onDisconnected);
            webSocketService.off('user_list', onUserList);
            webSocketService.off('user_joined', onUserJoined);
            webSocketService.off('user_joined', onUserJoined);
            webSocketService.off('user_left', onUserLeft);
            webSocketService.off('channel_groups', onChannelGroups);
            webSocketService.off('channel_list', onChannelList);
            webSocketService.off('channel_activity', onChannelActivity);
        };
    }, [username]); // Removed selectedGroupId dependency

    // Effect to select default group when data is available
    useEffect(() => {
        if (channelGroups.length > 0 && allChannels.length > 0 && !selectedGroupId) {
            handleSelectGroup(channelGroups[0].id);
        }
    }, [channelGroups, allChannels, selectedGroupId]);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            // Clear all pending hold timers
            channelHoldTimers.current.forEach(timer => clearTimeout(timer));
            channelHoldTimers.current.clear();
        };
    }, []);

    const handleSelectGroup = (groupId: number) => {
        setSelectedGroupId(groupId);
        const group = channelGroups.find(g => g.id === groupId);
        if (group) {
            // Filter allChannels to find the ones in this group
            const groupChannels = allChannels.filter(c => group.channelIds.includes(c.id));
            setChannels(groupChannels);
        }
    };

    const toggleListen = (channelId: number) => {
        setListenChannels(prev => {
            const newChannels = prev.includes(channelId)
                ? prev.filter(id => id !== channelId)
                : [...prev, channelId];

            audioService.setListenChannels(newChannels);
            return newChannels;
        });
    };

    const toggleTalk = (channelId: number) => {
        setTalkChannels(prev => {
            const newChannels = prev.includes(channelId)
                ? prev.filter(id => id !== channelId)
                : [...prev, channelId];

            audioService.setTalkChannels(newChannels);
            return newChannels;
        });
    };

    const handleChannelPressIn = async (channelId: number) => {
        // Clear any existing timer for this channel
        const existingTimer = channelHoldTimers.current.get(channelId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set timer to activate channel after hold duration
        const timer = setTimeout(() => {
            // Add to pressed channels for visual feedback (only after hold duration)
            setPressedChannels(prev => {
                if (prev.includes(channelId)) return prev;
                return [...prev, channelId];
            });

            // Activate the channel after hold duration
            setTalkChannels(prev => {
                if (prev.includes(channelId)) return prev;
                const newTalkChannels = [...prev, channelId];
                audioService.setTalkChannels(newTalkChannels);

                // Start recording if this is the first channel activated
                if (newTalkChannels.length === 1 && !isTalking) {
                    startTalking();
                }

                return newTalkChannels;
            });

            // Remove timer from map
            channelHoldTimers.current.delete(channelId);
        }, CHANNEL_HOLD_DURATION_MS);

        // Store timer
        channelHoldTimers.current.set(channelId, timer);
    };

    const handleChannelPressOut = async (channelId: number) => {
        // Clear timer if exists (user released before hold duration)
        const timer = channelHoldTimers.current.get(channelId);
        if (timer) {
            clearTimeout(timer);
            channelHoldTimers.current.delete(channelId);
        }

        // Remove from pressed channels
        setPressedChannels(prev => {
            return prev.filter(id => id !== channelId);
        });

        // Remove from talk channels
        setTalkChannels(prev => {
            const newTalkChannels = prev.filter(id => id !== channelId);
            audioService.setTalkChannels(newTalkChannels);

            // Stop recording if no channels are active
            if (newTalkChannels.length === 0 && isTalking) {
                stopTalking();
            }

            return newTalkChannels;
        });
    };

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

                <TouchableOpacity onPress={onOpenPeople} style={styles.iconButton}>
                    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <Path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                        <Path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                    </Svg>
                </TouchableOpacity>
            </View>

            {/* Main Content */}
            <View style={styles.content}>
                {/* Channel Group Selector */}
                <View style={styles.channelGroupContainer}>
                    <ChannelGroupSelector
                        groups={channelGroups}
                        selectedGroupId={selectedGroupId}
                        onSelectGroup={handleSelectGroup}
                    />
                </View>

                {/* Channel List */}
                <View style={styles.channelListContainer}>
                    <ChannelList
                        channels={channels}
                        listenChannels={listenChannels}
                        talkChannels={talkChannels}
                        activeChannels={activeChannels}
                        isTalking={isTalking}
                        onToggleListen={toggleListen}
                        onToggleTalk={toggleTalk}
                        onChannelPressIn={handleChannelPressIn}
                        onChannelPressOut={handleChannelPressOut}
                        pressedChannels={pressedChannels}
                    />
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
                                {
                                    width: screenWidth - (spacing.md * 2), // Full width minus padding
                                    height: (screenWidth - (spacing.md * 2)) / 2, // Half of width
                                },
                                isTalking ? styles.pttButtonActive : styles.pttButtonInactive
                            ]}
                        >
                            <View style={[
                                styles.pttInner,
                                isTalking ? styles.pttInnerActive : styles.pttInnerInactive,
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
        marginTop: 0,
        marginBottom: 0,
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
    },
    channelGroupContainer: {
        marginBottom: spacing.xs,
    },
    channelListContainer: {
        flex: 1,
        marginBottom: spacing.md
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
        marginBottom: -spacing.lg,
        marginTop: 'auto', // Push to bottom
    },
    pttButton: {
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
        marginBottom: spacing.md,
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
        marginTop: spacing.md,
        fontSize: 16,
        letterSpacing: 1,
    },
});
