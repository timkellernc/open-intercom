import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TouchableOpacity,
    Switch,
    ScrollView,
    NativeEventEmitter,
    NativeModules,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { colors, spacing, typography } from '../constants/theme';
import { audioService } from '../services/AudioService';

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
    const [jitterBufferMs, setJitterBufferMs] = useState(100);
    const [isAutoJitter, setIsAutoJitter] = useState(true);
    const [audioQuality, setAudioQuality] = useState('quality'); // eco, balanced, quality
    const [volume, setVolume] = useState(2.0); // Default 2.0x
    const [micGain, setMicGain] = useState(1.0); // Default 1.0x (no change)
    const [audioLevel, setAudioLevel] = useState(0.0);
    const [useOpus, setUseOpus] = useState(true); // Default to Opus
    const [scrollEnabled, setScrollEnabled] = useState(true);

    // Listen for jitter buffer changes from native module
    useEffect(() => {
        const { AudioEngine } = NativeModules;
        if (!AudioEngine) return;

        const eventEmitter = new NativeEventEmitter(AudioEngine);

        const jitterSubscription = eventEmitter.addListener('onJitterBufferChange', (event) => {
            console.log('SettingsModal: Jitter buffer changed to', event.bufferMs, 'ms (auto:', event.auto, ')');
            setJitterBufferMs(event.bufferMs);
        });

        const levelSubscription = eventEmitter.addListener('onAudioLevel', (level: number | string) => {
            // Android sends string, iOS sends number
            const val = typeof level === 'string' ? parseFloat(level) : level;
            setAudioLevel(val);
        });

        return () => {
            jitterSubscription.remove();
            levelSubscription.remove();
        };
    }, []);

    const loadSettings = async () => {
        try {
            const savedJitter = await AsyncStorage.getItem('jitterBufferMs');
            const savedAuto = await AsyncStorage.getItem('autoJitter');
            const savedQuality = await AsyncStorage.getItem('audioQuality');
            const savedVolume = await AsyncStorage.getItem('audioVolume');
            const savedMicGain = await AsyncStorage.getItem('micGain');
            const savedUseOpus = await AsyncStorage.getItem('useOpus');

            if (savedJitter) setJitterBufferMs(parseInt(savedJitter, 10));
            if (savedAuto) setIsAutoJitter(savedAuto === 'true');
            if (savedQuality) {
                setAudioQuality(savedQuality);
            }
            if (savedVolume) {
                setVolume(parseFloat(savedVolume));
            }
            if (savedMicGain) {
                setMicGain(parseFloat(savedMicGain));
            }
            if (savedUseOpus) {
                setUseOpus(savedUseOpus === 'true');
            }
        } catch (error) {
            console.error('Failed to load settings', error);
        }
    };

    useEffect(() => {
        if (visible) {
            loadSettings();
        }
    }, [visible]);

    const saveSettings = async () => {
        try {
            await AsyncStorage.setItem('jitterBufferMs', jitterBufferMs.toString());
            await AsyncStorage.setItem('autoJitter', isAutoJitter.toString());
            await AsyncStorage.setItem('audioQuality', audioQuality);
            await AsyncStorage.setItem('audioVolume', volume.toString());
            await AsyncStorage.setItem('micGain', micGain.toString());
            await AsyncStorage.setItem('useOpus', useOpus.toString());
        } catch (error) {
            console.error('Failed to save settings', error);
        }
    };

    const handleVolumeChange = (newVolume: number) => {
        setVolume(newVolume);
        console.log('SettingsModal: Volume changed to', newVolume);
        audioService.setVolume(newVolume);
    };

    const handleMicGainChange = (newGain: number) => {
        setMicGain(newGain);
        audioService.setMicGain(newGain);
    };

    const handleOpusChange = (value: boolean) => {
        setUseOpus(value);
        audioService.setCodec(value ? 'opus' : 'pcm');
        // Re-apply quality settings as bitrate depends on codec
        applyQualitySettings(audioQuality, value);
    };

    const handleQualityChange = (quality: string) => {
        setAudioQuality(quality);
        applyQualitySettings(quality, useOpus);
    };

    const applyQualitySettings = (quality: string, isOpus: boolean) => {
        if (isOpus) {
            let bitrate = 32000;
            switch (quality) {
                case 'eco': bitrate = 16000; break;
                case 'balanced': bitrate = 32000; break;
                case 'quality': bitrate = 64000; break;
            }
            audioService.setOpusBitrate(bitrate);
        } else {
            let bitDepth = 16;
            switch (quality) {
                case 'eco': bitDepth = 8; break;
                case 'balanced': bitDepth = 12; break;
                case 'quality': bitDepth = 16; break;
            }
            audioService.setPCMBitDepth(bitDepth);
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

    const handleJitterChange = (value: number) => {
        setJitterBufferMs(value);
    };

    const handleJitterChangeComplete = (value: number) => {
        setJitterBufferMs(value);
        audioService.setJitterBuffer(value);
        setScrollEnabled(true);
    };

    const handleAutoJitterToggle = (value: boolean) => {
        setIsAutoJitter(value);
        audioService.setAutoJitter(value);
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

                    <ScrollView
                        style={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        scrollEnabled={scrollEnabled}
                    >
                        {/* Jitter Buffer Settings */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Jitter Buffer</Text>

                            <View style={styles.row}>
                                <Text style={styles.label}>Auto-adjust</Text>
                                <Switch
                                    value={isAutoJitter}
                                    onValueChange={handleAutoJitterToggle}
                                    trackColor={{ false: colors.surface, true: colors.primary }}
                                    thumbColor={'white'}
                                />
                            </View>

                            <View style={styles.sliderContainer}>
                                <View style={styles.row}>
                                    <Text style={styles.label}>Buffer Size</Text>
                                    <View style={styles.buttonGroup}>
                                        <TouchableOpacity
                                            style={[styles.adjustButton, isAutoJitter && styles.adjustButtonDisabled]}
                                            onPress={() => {
                                                if (!isAutoJitter) {
                                                    const newValue = Math.max(40, jitterBufferMs - 20);
                                                    handleJitterChangeComplete(newValue);
                                                }
                                            }}
                                            disabled={isAutoJitter}
                                        >
                                            <Text style={styles.adjustButtonText}>-</Text>
                                        </TouchableOpacity>
                                        <Text style={styles.value}>{jitterBufferMs} ms</Text>
                                        <TouchableOpacity
                                            style={[styles.adjustButton, isAutoJitter && styles.adjustButtonDisabled]}
                                            onPress={() => {
                                                if (!isAutoJitter) {
                                                    const newValue = Math.min(500, jitterBufferMs + 20);
                                                    handleJitterChangeComplete(newValue);
                                                }
                                            }}
                                            disabled={isAutoJitter}
                                        >
                                            <Text style={styles.adjustButtonText}>+</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <Slider
                                    style={styles.slider}
                                    minimumValue={40}
                                    maximumValue={500}
                                    step={20}
                                    value={jitterBufferMs}
                                    onValueChange={handleJitterChange}
                                    onSlidingComplete={handleJitterChangeComplete}
                                    disabled={isAutoJitter}
                                    minimumTrackTintColor={isAutoJitter ? colors.textSecondary : colors.primary}
                                    maximumTrackTintColor={colors.surface}
                                    thumbTintColor={isAutoJitter ? colors.textSecondary : colors.primary}
                                    tapToSeek={true}
                                />
                            </View>
                        </View>

                        {/* Volume Control */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Volume</Text>

                            <View style={styles.sliderContainer}>
                                <View style={styles.row}>
                                    <Text style={styles.label}>Playback Volume</Text>
                                    <View style={styles.buttonGroup}>
                                        <TouchableOpacity
                                            style={styles.adjustButton}
                                            onPress={() => {
                                                const newValue = Math.max(0.5, volume - 0.5);
                                                handleVolumeChange(newValue);
                                            }}
                                        >
                                            <Text style={styles.adjustButtonText}>-</Text>
                                        </TouchableOpacity>
                                        <Text style={styles.value}>{volume.toFixed(1)}x</Text>
                                        <TouchableOpacity
                                            style={styles.adjustButton}
                                            onPress={() => {
                                                const newValue = Math.min(4.0, volume + 0.5);
                                                handleVolumeChange(newValue);
                                            }}
                                        >
                                            <Text style={styles.adjustButtonText}>+</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <Slider
                                    style={styles.slider}
                                    minimumValue={0.5}
                                    maximumValue={4.0}
                                    step={0.1}
                                    value={volume}
                                    onValueChange={handleVolumeChange}
                                    minimumTrackTintColor={colors.primary}
                                    maximumTrackTintColor={colors.surface}
                                    thumbTintColor={colors.primary}
                                    tapToSeek={true}
                                />
                                <Text style={styles.optionDesc}>
                                    Adjust how loud incoming audio sounds (0.5x - 4.0x)
                                </Text>
                            </View>

                            <View style={styles.sliderContainer}>
                                <View style={styles.row}>
                                    <Text style={styles.label}>Microphone Gain</Text>
                                    <View style={styles.buttonGroup}>
                                        <TouchableOpacity
                                            style={styles.adjustButton}
                                            onPress={() => {
                                                const newValue = Math.max(0.5, micGain - 0.5);
                                                handleMicGainChange(newValue);
                                            }}
                                        >
                                            <Text style={styles.adjustButtonText}>-</Text>
                                        </TouchableOpacity>
                                        <Text style={styles.value}>{micGain.toFixed(1)}x</Text>
                                        <TouchableOpacity
                                            style={styles.adjustButton}
                                            onPress={() => {
                                                const newValue = Math.min(10.0, micGain + 0.5);
                                                handleMicGainChange(newValue);
                                            }}
                                        >
                                            <Text style={styles.adjustButtonText}>+</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <Slider
                                    style={styles.slider}
                                    minimumValue={0.1}
                                    maximumValue={10.0}
                                    step={0.1}
                                    value={micGain}
                                    onValueChange={handleMicGainChange}
                                    minimumTrackTintColor={colors.primary}
                                    maximumTrackTintColor={colors.surface}
                                    thumbTintColor={colors.primary}
                                    tapToSeek={true}
                                />
                                <Text style={styles.optionDesc}>
                                    Amplify your microphone before sending (0.5x - 3.0x)
                                </Text>

                                <View style={styles.meterContainer}>
                                    <View style={[styles.meterBar, { width: `${Math.min(audioLevel * 100, 100)}%`, backgroundColor: audioLevel > 0.8 ? colors.error : audioLevel > 0.5 ? colors.warning : colors.success }]} />
                                </View>
                            </View>
                        </View>

                        {/* Codec Settings */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Audio Codec</Text>

                            <View style={styles.row}>
                                <Text style={styles.label}>Use Opus Codec</Text>
                                <Switch
                                    value={useOpus}
                                    onValueChange={handleOpusChange}
                                    trackColor={{ false: colors.surface, true: colors.primary }}
                                    thumbColor={'white'}
                                />
                            </View>
                            <Text style={styles.optionDesc}>
                                Opus significantly reduces bandwidth usage while maintaining high audio quality.
                            </Text>
                        </View>

                        {/* Audio Quality Settings */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Audio Quality</Text>

                            <TouchableOpacity
                                style={[styles.option, audioQuality === 'eco' && styles.optionSelected]}
                                onPress={() => handleQualityChange('eco')}
                            >
                                <View>
                                    <Text style={styles.optionTitle}>Eco</Text>
                                    <Text style={styles.optionDesc}>
                                        {useOpus ? '~20 MB/hr (16 kbps)' : '~173 MB/hr (48kHz, 8-bit)'}
                                    </Text>
                                </View>
                                {audioQuality === 'eco' && <View style={styles.checkMark} />}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.option, audioQuality === 'balanced' && styles.optionSelected]}
                                onPress={() => handleQualityChange('balanced')}
                            >
                                <View>
                                    <Text style={styles.optionTitle}>Normal</Text>
                                    <Text style={styles.optionDesc}>
                                        {useOpus ? '~40 MB/hr (32 kbps)' : '~259 MB/hr (48kHz, 12-bit)'}
                                    </Text>
                                </View>
                                {audioQuality === 'balanced' && <View style={styles.checkMark} />}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.option, audioQuality === 'quality' && styles.optionSelected]}
                                onPress={() => handleQualityChange('quality')}
                            >
                                <View>
                                    <Text style={styles.optionTitle}>Quality</Text>
                                    <Text style={styles.optionDesc}>
                                        {useOpus ? '~80 MB/hr (64 kbps)' : '~345 MB/hr (48kHz, 16-bit)'}
                                    </Text>
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
    meterContainer: {
        height: 10,
        backgroundColor: colors.surface,
        borderRadius: 5,
        marginTop: spacing.sm,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
    },
    meterBar: {
        height: '100%',
        backgroundColor: colors.success,
    },
    buttonGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    adjustButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    adjustButtonDisabled: {
        backgroundColor: colors.surface,
    },
    adjustButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
