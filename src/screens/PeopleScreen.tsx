import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    StatusBar,
    FlatList,
} from 'react-native';
import { colors, spacing, typography } from '../constants/theme';
import Svg, { Path } from 'react-native-svg';

interface PeopleScreenProps {
    username: string;
    activeUsers: string[];
    onBack: () => void;
}

export const PeopleScreen: React.FC<PeopleScreenProps> = ({
    username,
    activeUsers,
    onBack
}) => {
    const renderUserItem = ({ item }: { item: string }) => {
        const initials = item
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);

        return (
            <View style={styles.userItem}>
                <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>{initials}</Text>
                </View>
                <Text style={styles.userName}>{item}</Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M19 12H5M12 19l-7-7 7-7" />
                    </Svg>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>People</Text>
                <View style={styles.headerSpacer} />
            </View>

            {/* User Info */}
            <View style={styles.currentUserSection}>
                <Text style={styles.sectionLabel}>YOU</Text>
                <View style={styles.currentUserCard}>
                    <View style={[styles.userAvatar, styles.currentUserAvatar]}>
                        <Text style={styles.userAvatarText}>
                            {username.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                        </Text>
                    </View>
                    <Text style={styles.currentUserName}>{username}</Text>
                </View>
            </View>

            {/* Active Users List */}
            <View style={styles.usersSection}>
                <Text style={styles.sectionLabel}>
                    ACTIVE USERS ({activeUsers.length})
                </Text>
                {activeUsers.length > 0 ? (
                    <FlatList
                        data={activeUsers}
                        keyExtractor={(item) => item}
                        renderItem={renderUserItem}
                        contentContainerStyle={styles.listContent}
                    />
                ) : (
                    <View style={styles.emptyState}>
                        <Svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <Path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                            <Path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                        </Svg>
                        <Text style={styles.emptyStateText}>No other users online</Text>
                        <Text style={styles.emptyStateSubtext}>
                            Other users will appear here when they connect
                        </Text>
                    </View>
                )}
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
    backButton: {
        padding: spacing.xs,
        marginLeft: -spacing.xs,
    },
    headerTitle: {
        ...typography.h1,
        color: colors.text,
        fontSize: 20,
        fontWeight: 'bold',
    },
    headerSpacer: {
        width: 40, // Same as back button to center title
    },
    currentUserSection: {
        padding: spacing.md,
    },
    sectionLabel: {
        ...typography.label,
        color: colors.textSecondary,
        fontSize: 12,
        marginBottom: spacing.sm,
    },
    currentUserCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        padding: spacing.md,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: colors.primary,
    },
    currentUserAvatar: {
        backgroundColor: colors.primary,
    },
    currentUserName: {
        ...typography.body,
        color: colors.text,
        fontSize: 18,
        fontWeight: 'bold',
    },
    usersSection: {
        flex: 1,
        padding: spacing.md,
        paddingTop: 0,
    },
    listContent: {
        paddingBottom: spacing.md,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        padding: spacing.md,
        borderRadius: 12,
        marginBottom: spacing.sm,
    },
    userAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#475569', // slate-600
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.md,
    },
    userAvatarText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 18,
    },
    userName: {
        ...typography.body,
        color: colors.text,
        fontSize: 16,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xl * 2,
    },
    emptyStateText: {
        ...typography.body,
        color: colors.textSecondary,
        fontSize: 18,
        marginTop: spacing.lg,
        fontWeight: '600',
    },
    emptyStateSubtext: {
        ...typography.body,
        color: colors.textSecondary,
        fontSize: 14,
        marginTop: spacing.xs,
        textAlign: 'center',
        paddingHorizontal: spacing.xl,
    },
});
