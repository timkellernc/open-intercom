import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList } from 'react-native';
import { colors, spacing, typography } from '../constants/theme';
import Svg, { Path } from 'react-native-svg';
import { ChannelGroup } from '../services/WebSocketService';

interface ChannelGroupSelectorProps {
    groups: ChannelGroup[];
    selectedGroupId: number | null;
    onSelectGroup: (groupId: number) => void;
}

export const ChannelGroupSelector: React.FC<ChannelGroupSelectorProps> = ({
    groups,
    selectedGroupId,
    onSelectGroup
}) => {
    const [modalVisible, setModalVisible] = React.useState(false);

    const selectedGroup = groups.find(g => g.id === selectedGroupId);

    const handleSelect = (id: number) => {
        onSelectGroup(id);
        setModalVisible(false);
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.selector}
                onPress={() => setModalVisible(true)}
            >
                <Text style={styles.selectorText}>
                    {selectedGroup ? selectedGroup.name : 'Select Group...'}
                </Text>
                <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2">
                    <Path d="M6 9l6 6 6-6" />
                </Svg>
            </TouchableOpacity>

            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Channel Group</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2">
                                    <Path d="M18 6L6 18M6 6l12 12" />
                                </Svg>
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={groups}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[
                                        styles.groupItem,
                                        item.id === selectedGroupId && styles.groupItemSelected
                                    ]}
                                    onPress={() => handleSelect(item.id)}
                                >
                                    <Text style={[
                                        styles.groupName,
                                        item.id === selectedGroupId && styles.groupNameSelected
                                    ]}>
                                        {item.name}
                                    </Text>
                                    {item.id === selectedGroupId && (
                                        <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                                            <Path d="M20 6L9 17l-5-5" />
                                        </Svg>
                                    )}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: spacing.sm,
    },
    selector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
        padding: spacing.sm,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    selectorText: {
        ...typography.body,
        color: colors.text,
        flex: 1,
        textAlign: 'center',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: colors.background,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: spacing.md,
        maxHeight: '50%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
    },
    groupItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    groupItemSelected: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)', // Primary with opacity
    },
    groupName: {
        ...typography.body,
        color: colors.text,
    },
    groupNameSelected: {
        color: colors.primary,
        fontWeight: 'bold',
    },
});
