import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TouchableOpacity,
    Switch,
    ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { colors, spacing, typography } from '../constants/theme';

interface SettingsModalProps {
    visible: boolean;
    onClose: () => void;
    onLogout: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
    visible,
    onClose,
    onLogout,
}) => {
    const [jitterBufferMs, setJitterBufferMs] = useState(50);
    const [isAutoJitter, setIsAutoJitter] = useState(true);
    const [audioQuality, setAudioQuality] = useState('quality'); // eco, balanced, quality

    useEffect(() => {
        if (visible) {
            loadSettings();
        }
    }, [visible]);

    const loadSettings = async () => {
        try {
            const savedJitter = await AsyncStorage.getItem('jitterBufferMs');
            const savedAuto = await AsyncStorage.getItem('autoJitter');
            const savedQuality = await AsyncStorage.getItem('audioQuality');

            if (savedJitter) setJitterBufferMs(parseInt(savedJitter, 10));
            if (savedAuto) setIsAutoJitter(savedAuto === 'true');
            if (savedQuality) setAudioQuality(savedQuality);
        } catch (error) {
            console.error('Failed to load settings', error);
        }
    };

    const saveSettings = async () => {
        try {
            await AsyncStorage.setItem('jitterBufferMs', jitterBufferMs.toString());
            await AsyncStorage.setItem('autoJitter', isAutoJitter.toString());
            await AsyncStorage.setItem('audioQuality', audioQuality);
        } catch (error) {
            console.error('Failed to save settings', error);
        }
    };

    const handleClose = () => {
        saveSettings();
        onClose();
    };

    const handleLogout = () => {
        onLogout();
        onClose();
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={handleClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Settings</Text>
                        <TouchableOpacity onPress={handleClose}>
                            <Text style={styles.closeButton}>Done</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.scrollContent}>
                        {/* Jitter Buffer Settings */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Jitter Buffer</Text>

                            <View style={styles.row}>
                                <Text style={styles.label}>Auto-adjust</Text>
                                <Switch
                                    value={isAutoJitter}
                                    onValueChange={setIsAutoJitter}
                                    trackColor={{ false: colors.surface, true: colors.primary }}
                                    thumbColor={'white'}
                                />
                            </View>

                            <View style={styles.sliderContainer}>
                                <View style={styles.row}>
                                    <Text style={styles.label}>Buffer Size</Text>
                                    <Text style={styles.value}>{jitterBufferMs} ms</Text>
                                </View>
                                <Slider
                                    style={styles.slider}
                                    minimumValue={0}
                                    maximumValue={500}
                                    step={10}
                                    value={jitterBufferMs}
                                    onValueChange={setJitterBufferMs}
                                    disabled={isAutoJitter}
                                    minimumTrackTintColor={colors.primary}
                                    maximumTrackTintColor={colors.surface}
                                    thumbTintColor={isAutoJitter ? colors.textSecondary : 'white'}
                                />
                            </View>
                        </View>

                        {/* Audio Quality Settings */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Audio Quality</Text>

                            <TouchableOpacity
                                style={[styles.option, audioQuality === 'eco' && styles.optionSelected]}
                                onPress={() => setAudioQuality('eco')}
                            >
                                <View>
                                    <Text style={styles.optionTitle}>Eco</Text>
                                    <Text style={styles.optionDesc}>~173 MB/hr (48kHz, 8-bit)</Text>
                                </View>
                                {audioQuality === 'eco' && <View style={styles.checkMark} />}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.option, audioQuality === 'balanced' && styles.optionSelected]}
                                onPress={() => setAudioQuality('balanced')}
                            >
                                <View>
                                    <Text style={styles.optionTitle}>Balanced</Text>
                                    <Text style={styles.optionDesc}>~259 MB/hr (48kHz, 12-bit)</Text>
                                </View>
                                {audioQuality === 'balanced' && <View style={styles.checkMark} />}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.option, audioQuality === 'quality' && styles.optionSelected]}
                                onPress={() => setAudioQuality('quality')}
                            >
                                <View>
                                    <Text style={styles.optionTitle}>Quality</Text>
                                    <Text style={styles.optionDesc}>~345 MB/hr (48kHz, 16-bit)</Text>
                                </View>
                                {audioQuality === 'quality' && <View style={styles.checkMark} />}
                            </TouchableOpacity>
                        </View>

                        {/* Logout Button */}
                        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                            <Text style={styles.logoutText}>Log Out</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: colors.background,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        height: '80%',
        padding: spacing.lg,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.xl,
    },
    title: {
        ...typography.h1,
        fontSize: 24,
    },
    closeButton: {
        color: colors.primary,
        fontSize: 16,
        fontWeight: 'bold',
    },
    scrollContent: {
        flex: 1,
    },
    section: {
        marginBottom: spacing.xl,
    },
    sectionTitle: {
        ...typography.label,
        fontSize: 14,
        textTransform: 'uppercase',
        marginBottom: spacing.md,
        color: colors.textSecondary,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    label: {
        ...typography.body,
        fontSize: 16,
    },
    value: {
        ...typography.body,
        color: colors.primary,
        fontWeight: 'bold',
    },
    sliderContainer: {
        marginTop: spacing.md,
    },
    slider: {
        width: '100%',
        height: 40,
    },
    option: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: 12,
        marginBottom: spacing.sm,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    optionSelected: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
    },
    optionTitle: {
        ...typography.body,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    optionDesc: {
        ...typography.label,
        fontSize: 12,
        marginBottom: 0,
    },
    checkMark: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.primary,
    },
    logoutButton: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        padding: spacing.md,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: spacing.xl,
        marginBottom: spacing.xl,
    },
    logoutText: {
        color: colors.error,
        fontWeight: 'bold',
        fontSize: 16,
    },
});
