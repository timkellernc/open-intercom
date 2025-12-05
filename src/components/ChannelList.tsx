import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { colors, spacing, typography } from '../constants/theme';
import Svg, { Path } from 'react-native-svg';
import { Channel } from '../services/WebSocketService';

interface ChannelListProps {
    channels: Channel[];
    listenChannels: number[];
    talkChannels: number[];
    activeChannels: number[];
    isTalking: boolean;
    onToggleListen: (channelId: number) => void;
    onToggleTalk: (channelId: number) => void;
    onChannelPressIn?: (channelId: number) => void;
    onChannelPressOut?: (channelId: number) => void;
    pressedChannels?: number[];
}

export const ChannelList: React.FC<ChannelListProps> = ({
    channels,
    listenChannels,
    talkChannels,
    activeChannels,
    isTalking,
    onToggleListen,
    onToggleTalk,
    onChannelPressIn,
    onChannelPressOut,
    pressedChannels = []
}) => {
    const renderItem = ({ item }: { item: Channel }) => {
        const isListening = listenChannels.includes(item.id);
        const isTalkingOnChannel = talkChannels.includes(item.id);
        const isPressed = pressedChannels.includes(item.id);

        // Indicator Logic
        const isSelfTalking = (isTalkingOnChannel && isTalking) || (isPressed && isTalking);
        const isOthersTalking = activeChannels.includes(item.id) && !isSelfTalking;

        return (
            <View style={styles.channelItem}>
                <View
                    style={[
                        styles.channelInfo,
                        isPressed && styles.channelInfoPressed
                    ]}
                    onTouchStart={() => onChannelPressIn?.(item.id)}
                    onTouchEnd={() => onChannelPressOut?.(item.id)}
                    onTouchCancel={() => onChannelPressOut?.(item.id)}
                >
                    {/* Activity Indicator */}
                    <View style={[
                        styles.indicator,
                        isSelfTalking && styles.indicatorRed,
                        isOthersTalking && styles.indicatorGreen
                    ]} />
                    <Text style={styles.channelName}>{item.name}</Text>
                    {isPressed && (
                        <Text style={styles.pressHint}>PRESS TO TALK</Text>
                    )}
                </View>

                <View style={styles.controls}>
                    {/* Listen Toggle */}
                    <TouchableOpacity
                        style={[styles.controlButton, isListening && styles.listenActive]}
                        onPress={() => onToggleListen(item.id)}
                    >
                        <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isListening ? "white" : colors.textSecondary} strokeWidth="2">
                            <Path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                            <Path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                        </Svg>
                    </TouchableOpacity>

                    {/* Talk Toggle */}
                    <TouchableOpacity
                        style={[styles.controlButton, isTalkingOnChannel && styles.talkActive]}
                        onPress={() => onToggleTalk(item.id)}
                    >
                        <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isTalkingOnChannel ? "white" : colors.textSecondary} strokeWidth="2">
                            <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                            <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                            <Path d="M12 19v4" />
                            <Path d="M8 23h8" />
                        </Svg>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Channels</Text>
            <FlatList
                data={channels}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        ...typography.label,
        color: colors.textSecondary,
        marginBottom: spacing.sm,
    },
    listContent: {
        paddingBottom: spacing.md,
    },
    channelItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surface,
        padding: spacing.sm,
        borderRadius: 8,
        marginBottom: spacing.xs * 1.3,
    },
    channelInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        paddingVertical: spacing.md, // Add vertical padding to make touch area larger
        paddingHorizontal: spacing.md,
        marginVertical: -spacing.md, // Negative margin to extend into parent padding
        marginLeft: -spacing.xs,
        marginRight: 10,
        borderRadius: 6,
    },
    channelInfoPressed: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)', // Red tint when pressed
    },
    pressHint: {
        ...typography.body,
        color: colors.error,
        fontSize: 10,
        fontWeight: 'bold',
        marginLeft: spacing.sm,
    },
    indicator: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#334155', // slate-700 (inactive)
        marginRight: spacing.md,
    },
    indicatorGreen: {
        backgroundColor: colors.success,
        shadowColor: colors.success,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
        elevation: 5,
    },
    indicatorRed: {
        backgroundColor: colors.error,
        shadowColor: colors.error,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
        elevation: 5,
    },
    channelName: {
        ...typography.body,
        color: colors.text,
        fontWeight: '600',
        flex: 1,
    },
    controls: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    controlButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    listenActive: {
        backgroundColor: colors.success,
    },
    talkActive: {
        backgroundColor: colors.error,
    },
});
