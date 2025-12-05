//
//  AudioEngine.swift
//  OpenIntercomMobile
//
//  Created by OpenIntercom on 11/29/25.
//

import Foundation
import AVFoundation
import React

@objc(AudioEngine)
class AudioEngine: RCTEventEmitter {
  
  private var engine: AVAudioEngine!
  private var playerNode: AVAudioPlayerNode!
  private var inputConverter: AVAudioConverter!
  private var outputConverter: AVAudioConverter!
  
  private var processingFormat: AVAudioFormat! // Float32, 48kHz (Internal)
  private var networkFormat: AVAudioFormat!    // Int16, 48kHz (Network)
  
  private var isRunning = false
  private var isSetup = false
  private var micGain: Float = 1.0 // Microphone gain multiplier (default 1.0 = no change)
  private var volume: Float = 2.0 // Playback volume (default 2.0)
  
  // Opus codec support
  private var useOpus: Bool = true // Default to Opus
  private var opusEncoder: OpaquePointer?
  private var opusDecoder: OpaquePointer?
  private let opusFrameSize: Int = 960  // 20ms at 48kHz
  private var opusBitrate: Int32 = 32000 // 32 kbps (Normal quality)
  
  // PCM bit depth control
  private var pcmBitDepth: Int = 16  // 8, 12, or 16 bits
  
  // Jitter buffer
  private var jitterBufferMs: Int = 100  // Default 100ms
  private var isAutoJitter: Bool = true
  private var audioQueue: [(Data, Date)] = []  // Queue of (audio data, arrival time)
  private var jitterTimer: DispatchSourceTimer?
  private let jitterQueue = DispatchQueue(label: "com.openintercom.jitter", qos: .userInteractive)
  private var lastPlayTime: Date?
  private var lastAdjustTime: Date = Date()  // Track when we last adjusted buffer
  private var packetArrivalTimes: [TimeInterval] = []  // For auto-adjust
  private let queueLock = NSLock()
  
  // New Jitter Buffer Logic
  private var isBuffering = true
  private var bufferedDuration: TimeInterval = 0
  private var lastUnderrunTime: Date = Date()
  private var underrunCount = 0
  private var hasScheduledBuffers = false // Track if we have buffers scheduled to the player
  private var scheduledBufferCount = 0 // Track how many buffers are currently scheduled
  
  private var lastLevelSendTime: Date = Date()
  private var lastHighJitterTime: Date = Date() // Track when jitter was last high
  
  // Session Stats
  private var sessionStartTime: Date?
  private var totalSentBytes: Int = 0
  
  override init() {
    super.init()
    print("AudioEngine initialized")
  }
  
  // ... (rest of file)

  private func processAudioQueue() {
    queueLock.lock()
    defer { queueLock.unlock() }
    
    // Calculate current buffered duration
    if useOpus {
        // For Opus, we assume ~20ms per packet as it's VBR and hard to calculate exact duration without decoding
        let packetDuration = 0.02 // 20ms
        bufferedDuration = Double(audioQueue.count) * packetDuration
    } else {
        // For PCM, calculate exact duration based on bytes
        var totalBytes = 0
        for (data, _) in audioQueue {
            totalBytes += data.count
        }
        
        let bytesPerSample = pcmBitDepth / 8
        // 48kHz, 1 channel
        let bytesPerSecond = 48000 * 1 * bytesPerSample
        bufferedDuration = Double(totalBytes) / Double(bytesPerSecond)
    }
    
    // Determine if we should be buffering based on whether we have active playback
    // Note: playerNode.isPlaying is unreliable - it stays true even after buffers finish
    // So we track manually whether we have buffers scheduled
    let targetDuration = Double(jitterBufferMs) / 1000.0
    let maxBufferDuration = targetDuration * 1.5 // More aggressive: drop if 1.5x target (was 2.0x)
    
    // Log state occasionally for debugging
    if Int.random(in: 0...100) == 0 {
        sendLog("AudioEngine: hasScheduledBuffers=\(hasScheduledBuffers), isBuffering=\(isBuffering), queue=\(audioQueue.count), scheduled=\(scheduledBufferCount), duration=\(String(format: "%.3f", bufferedDuration))s, target=\(jitterBufferMs)ms")
    }
    
    // Buffer overflow protection: drop oldest packets if buffer is too large
    // For real-time audio, we want to stay close to the target buffer size
    if bufferedDuration > maxBufferDuration {
        let targetPackets = Int(targetDuration / 0.02) // How many packets for target duration
        let packetsToKeep = max(targetPackets, 3) // Keep at least 3 packets
        let packetsToRemove = audioQueue.count - packetsToKeep
        if packetsToRemove > 0 {
            sendLog("AudioEngine: Buffer overflow! Dropping \(packetsToRemove) old packets (buffer was \(String(format: "%.3f", bufferedDuration))s, target \(String(format: "%.3f", targetDuration))s)")
            for _ in 0..<packetsToRemove {
                audioQueue.removeFirst()
            }
            // Recalculate buffered duration
            bufferedDuration = Double(audioQueue.count) * 0.02
        }
    }
    
    // State machine:
    // 1. If no buffers scheduled and we have no data -> do nothing
    // 2. If no buffers scheduled and we have data -> buffer until target, then start
    // 3. If buffers are scheduled -> schedule new data immediately as it arrives
    
    if !hasScheduledBuffers {
        // Player has no buffers - need to buffer before starting
        if audioQueue.isEmpty {
            // No data to play, stay stopped
            isBuffering = false
            return
        }
        
        // We have data but no buffers scheduled - buffer up
        if !isBuffering {
            isBuffering = true
            sendLog("AudioEngine: No buffers scheduled, starting buffering (target: \(jitterBufferMs)ms)")
        }
        
        // Log buffering progress occasionally
        if Int.random(in: 0...10) == 0 {
            sendLog("AudioEngine: Buffering... \(String(format: "%.3f", bufferedDuration))s / \(String(format: "%.3f", targetDuration))s")
        }
        
        // Check if we have enough buffer to start
        if bufferedDuration >= targetDuration {
            sendLog("AudioEngine: Buffer full (\(String(format: "%.3f", bufferedDuration))s >= \(String(format: "%.3f", targetDuration))s), starting playback")
            sendLog("AudioEngine: About to flush queue with \(audioQueue.count) packets")
            isBuffering = false
            hasScheduledBuffers = true // Mark that we're about to schedule buffers
            flushQueueToPlayer()
            sendLog("AudioEngine: After flush, queue has \(audioQueue.count) packets")
        }
    } else {
        // Buffers are scheduled - just add new data immediately
        isBuffering = false
        flushQueueToPlayer()
    }
  }
  
  private func flushQueueToPlayer() {
    // For real-time audio, only schedule a small number of buffers ahead
    // This prevents latency buildup while maintaining smooth playback
    let maxScheduledBuffers = 5 // Only keep 5 buffers (~100ms) scheduled ahead
    
    var count = 0
    while !audioQueue.isEmpty && scheduledBufferCount < maxScheduledBuffers {
      let (data, _) = audioQueue.removeFirst()
      scheduledBufferCount += 1 // Increment here while we hold the lock
      playAudioData(data)
      count += 1
    }
    
    // If we still have packets in queue after scheduling, we're building up latency
    // Drop old packets to keep the queue fresh for real-time audio
    if !audioQueue.isEmpty && scheduledBufferCount >= maxScheduledBuffers {
      let excessPackets = audioQueue.count
      if excessPackets > 3 { // Only drop if we have significant excess
        let packetsToDrop = excessPackets - 2 // Keep 2 packets in reserve
        if packetsToDrop > 0 {
          sendLog("AudioEngine: Dropping \(packetsToDrop) old packets to maintain real-time audio (queue: \(audioQueue.count), scheduled: \(scheduledBufferCount))")
          for _ in 0..<packetsToDrop {
            audioQueue.removeFirst()
          }
        }
      }
    }
  }
  
  private func handleUnderrun() {
    queueLock.lock()
    if !isBuffering {
      sendLog("Underrun detected! Re-buffering...")
      isBuffering = true
      underrunCount += 1
      lastUnderrunTime = Date()
      
      // Auto-adjust: Increase buffer if we hit underrun
      if isAutoJitter && jitterBufferMs < 500 {
        jitterBufferMs = min(jitterBufferMs + 50, 500)
        sendLog("Auto-adjust increased buffer to \(jitterBufferMs)ms due to underrun")
        sendEvent(withName: "onJitterBufferChange", body: ["bufferMs": jitterBufferMs, "auto": true])
      }
    }
    queueLock.unlock()
  }
  
  private var hasListeners = false

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  private func sendLog(_ message: String) {
    print("AudioEngine: \(message)")
    if hasListeners {
        sendEvent(withName: "onLog", body: message)
    }
  }
  
  override func supportedEvents() -> [String]! {
    return ["onAudioData", "onJitterBufferChange", "onAudioLevel", "onLog"]
  }
  
  override static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  private func setupEngine() {
    print("AudioEngine: setupEngine called")
    if isSetup {
        print("AudioEngine: Already setup")
        return
    }
    isSetup = true
    
    let session = AVAudioSession.sharedInstance()
    do {
      print("AudioEngine: Configuring AVAudioSession")
      // Use .mixWithOthers to allow background audio, remove .defaultToSpeaker to use earpiece/headphones
      // Use .videoChat mode which is better optimized for speakerphone usage (louder mic input)
      try session.setCategory(.playAndRecord, mode: .videoChat, options: [.allowBluetooth, .defaultToSpeaker, .mixWithOthers])
      
      // Request 20ms buffer duration to match Opus frame size (low latency)
      try session.setPreferredIOBufferDuration(0.02)
      
      try session.setActive(true)
      
      let actualDuration = session.ioBufferDuration
      print("AudioEngine: Actual IO buffer duration: \(actualDuration * 1000)ms")
      sendLog("AudioEngine: Actual IO buffer duration: \(actualDuration * 1000)ms")
      
      // Set preferred sample rate and IO buffer duration for better quality
      try session.setPreferredSampleRate(48000)
      try session.setPreferredIOBufferDuration(0.005) // 5ms for low latency
      
      print("AudioEngine: AVAudioSession active")
    } catch {
      print("Failed to setup audio session: \(error)")
    }
    
    engine = AVAudioEngine()
    playerNode = AVAudioPlayerNode()
    
    // Set player volume
    playerNode.volume = volume
    
    engine.attach(playerNode)
    
    // Define Formats
    // Processing: Float32, 48kHz, Non-Interleaved (Standard for AVAudioEngine)
    processingFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 48000, channels: 1, interleaved: false)
    
    // Network: Int16, 48kHz, Interleaved (Standard for VoIP/Server)
    networkFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 48000, channels: 1, interleaved: true)
    
    print("AudioEngine: Connecting playerNode to mainMixerNode with format: \(String(describing: processingFormat))")
    engine.connect(playerNode, to: engine.mainMixerNode, format: processingFormat)
    
    let inputNode = engine.inputNode
    let inputFormat = inputNode.inputFormat(forBus: 0)
    print("AudioEngine: Input format: \(inputFormat)")
    
    print("AudioEngine: Installing tap on inputNode")
    inputNode.installTap(onBus: 0, bufferSize: 960, format: inputFormat) { [weak self] (buffer, time) in
      guard let self = self, self.isRunning else { return }
      self.processInputBuffer(buffer)
    }
    
    // Enable voice processing (AGC, noise suppression, etc.) on the input
    // This gives us good baseline levels, and the user's manual gain slider acts as a boost on top
    if let voiceProcessingUnit = inputNode.audioUnit {
      var enableVoiceProcessing: UInt32 = 1
      
      // Enable AGC (Automatic Gain Control)
      AudioUnitSetProperty(
        voiceProcessingUnit,
        kAUVoiceIOProperty_VoiceProcessingEnableAGC,
        kAudioUnitScope_Global,
        0,
        &enableVoiceProcessing,
        UInt32(MemoryLayout<UInt32>.size)
      )
      
      sendLog("AudioEngine: Enabled voice processing (AGC)")
    }
    
    // Setup Opus encoder/decoder if enabled
    if useOpus {
      setupOpusCodec()
    }
    
    print("AudioEngine: setupEngine completed")
  }
  
  private func setupOpusCodec() {
    var error: Int32 = 0
    
    // Create Opus encoder (48kHz, 1 channel, VOIP application)
    opusEncoder = opus_encoder_create(48000, 1, OPUS_APPLICATION_VOIP, &error)
    if error != OPUS_OK || opusEncoder == nil {
      sendLog("Failed to create Opus encoder: \(error)")
      useOpus = false
      return
    }
    
    // Note: opus_encoder_ctl is a variadic C function and cannot be called from Swift
    // Encoder will use default bitrate (~32kbps for VOIP)
    // TODO: Create C wrapper for bitrate control if needed
    
    // Create Opus decoder (48kHz, 1 channel)
    opusDecoder = opus_decoder_create(48000, 1, &error)
    if error != OPUS_OK || opusDecoder == nil {
      sendLog("Failed to create Opus decoder: \(error)")
      if let encoder = opusEncoder {
        opus_encoder_destroy(encoder)
        opusEncoder = nil
      }
      useOpus = false
      return
    }
    
    sendLog("Opus codec initialized successfully")
  }
  
  // PCM Accumulator for Opus encoding
  private var pcmAccumulator: [Int16] = []
  private let accumulatorLock = NSLock()

  private func processInputBuffer(_ buffer: AVAudioPCMBuffer) {
    // Convert Input (Float32) -> Network (Int16)
    guard let networkFormat = self.networkFormat else { return }
    
    // Helper to process converted buffer
    func handleConvertedBuffer(_ outputBuffer: AVAudioPCMBuffer) {
        let currentUseOpus = self.useOpus // Capture to avoid race conditions

        if currentUseOpus {
            // Accumulate samples and encode in 960-sample chunks
            guard let channelData = outputBuffer.int16ChannelData else { return }
            let channelDataPointer = channelData.pointee
            let frameLength = Int(outputBuffer.frameLength)
            
            // Apply microphone gain if not 1.0
            var samples: [Int16]
            if micGain != 1.0 {
                samples = [Int16](repeating: 0, count: frameLength)
                for i in 0..<frameLength {
                    let sample = channelDataPointer[i]
                    let amplified = Float(sample) * micGain
                    samples[i] = Int16(max(-32768, min(32767, amplified)))
                }
            } else {
                samples = Array(UnsafeBufferPointer(start: channelDataPointer, count: frameLength))
            }
            
            // Calculate and send audio level AFTER gain is applied (throttled)
            let now = Date()
            if now.timeIntervalSince(lastLevelSendTime) >= 0.1 { // 100ms throttle
                var maxAmp: Int16 = 0
                for i in stride(from: 0, to: samples.count, by: 10) {
                    let sample = samples[i]
                    let absSample = sample == Int16.min ? Int16.max : abs(sample)
                    if absSample > maxAmp {
                        maxAmp = absSample
                    }
                }
                // Normalize to 0.0 - 1.0 (32767 is max Int16)
                let level = Float(maxAmp) / 32767.0
                sendEvent(withName: "onAudioLevel", body: level)
                lastLevelSendTime = now
            }
            
            accumulatorLock.lock()
            pcmAccumulator.append(contentsOf: samples)
            
            // Process all available 20ms chunks (960 samples)
            while pcmAccumulator.count >= opusFrameSize {
                let chunk = Array(pcmAccumulator.prefix(opusFrameSize))
                pcmAccumulator.removeFirst(opusFrameSize)
                
                // Encode and send this chunk
                // Note: We need to unlock before calling encodeAndSendOpus to avoid potential deadlocks if it calls back
                accumulatorLock.unlock()
                encodeAndSendOpus(pcmData: chunk)
                accumulatorLock.lock()
            }
            accumulatorLock.unlock()
            
        } else {
            // PCM mode: Send directly (legacy behavior)
            self.sendBuffer(outputBuffer)
        }
    }
    
    if buffer.format == networkFormat {
      handleConvertedBuffer(buffer)
      return
    }
    
    if inputConverter == nil || inputConverter.inputFormat != buffer.format {
      inputConverter = AVAudioConverter(from: buffer.format, to: networkFormat)
    }
    
    let ratio = networkFormat.sampleRate / buffer.format.sampleRate
    let capacity = UInt32(Double(buffer.frameCapacity) * ratio)
    guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: networkFormat, frameCapacity: capacity) else { return }
    
    var error: NSError? = nil
    let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
      outStatus.pointee = .haveData
      return buffer
    }
    
    inputConverter.convert(to: outputBuffer, error: &error, withInputFrom: inputBlock)
    
    if error == nil {
      handleConvertedBuffer(outputBuffer)
    }
  }
  
  private func sendBuffer(_ buffer: AVAudioPCMBuffer) {
    guard let channelData = buffer.int16ChannelData else { return }
    
    let channelDataPointer = channelData.pointee
    let frameLength = Int(buffer.frameLength)
    
    // Log actual buffer size occasionally
    if Int.random(in: 0...100) == 0 {
        sendLog("Input buffer size: \(frameLength) samples")
    }
    
    // Apply microphone gain if not 1.0
    var pcmData: [Int16]
    if micGain != 1.0 {
      pcmData = [Int16](repeating: 0, count: frameLength)
      for i in 0..<frameLength {
        let sample = channelDataPointer[i]
        let amplified = Float(sample) * micGain
        pcmData[i] = Int16(max(-32768, min(32767, amplified)))
      }
    } else {
      pcmData = Array(UnsafeBufferPointer(start: channelDataPointer, count: frameLength))
    }
    
    // Calculate and send audio level (throttled)
    let now = Date()
    if now.timeIntervalSince(lastLevelSendTime) >= 0.1 { // 100ms throttle
      var maxAmp: Int16 = 0
      for sample in pcmData {
        let absSample = sample == Int16.min ? Int16.max : abs(sample)
        if absSample > maxAmp {
          maxAmp = absSample
        }
      }
      // Normalize to 0.0 - 1.0 (32767 is max Int16)
      let level = Float(maxAmp) / 32767.0
      sendEvent(withName: "onAudioLevel", body: level)
      lastLevelSendTime = now
    }
    
    // Encode with Opus if enabled
    if useOpus {
      guard let encoder = opusEncoder else {
        // Error: Opus enabled but encoder missing. Do NOT fall back to PCM as server expects Opus.
        // This prevents sending PCM data that the server might try to decode as Opus (causing crashes).
        if Int.random(in: 0...100) == 0 {
            sendLog("AudioEngine Error: Opus enabled but encoder is nil. Dropping audio frame.")
        }
        return
      }
      encodeAndSendOpus(pcmData: pcmData)
    } else {
      // Send raw PCM
      // Apply bit depth reduction if not 16-bit
      let finalData: Data
      if pcmBitDepth == 16 {
        finalData = Data(bytes: pcmData, count: frameLength * 2)
      } else if pcmBitDepth == 12 {
        finalData = reduceTo12Bit(pcmData)
      } else { // 8-bit
        finalData = reduceTo8Bit(pcmData)
      }
      let base64String = finalData.base64EncodedString()
      sendEvent(withName: "onAudioData", body: base64String)
    }
  }
  
  private func reduceTo12Bit(_ samples: [Int16]) -> Data {
    // Convert 16-bit to 12-bit by shifting right 4 bits
    // Pack 2 samples into 3 bytes
    var result = Data()
    result.reserveCapacity((samples.count * 3) / 2)
    
    for i in stride(from: 0, to: samples.count - 1, by: 2) {
      let sample1 = UInt16(bitPattern: samples[i] >> 4)  // 12-bit
      let sample2 = UInt16(bitPattern: samples[i + 1] >> 4)  // 12-bit
      
      // Pack: [AAAA AAAA][AAAA BBBB][BBBB BBBB]
      result.append(UInt8(sample1 & 0xFF))  // Lower 8 bits of sample1
      result.append(UInt8((sample1 >> 8) | ((sample2 & 0x0F) << 4)))  // Upper 4 of sample1 + lower 4 of sample2
      result.append(UInt8(sample2 >> 4))  // Upper 8 bits of sample2
    }
    return result
  }
  
  private func reduceTo8Bit(_ samples: [Int16]) -> Data {
    // Convert 16-bit to 8-bit by shifting right 8 bits
    var result = Data()
    result.reserveCapacity(samples.count)
    for sample in samples {
      result.append(UInt8(truncatingIfNeeded: (sample >> 8) + 128))  // Convert to unsigned 8-bit
    }
    return result
  }
  
  private func encodeAndSendOpus(pcmData: [Int16]) {
    guard let encoder = opusEncoder else {
      print("AudioEngine: Opus encoder not initialized")
      return
    }
    
    // Opus output buffer (max size for 20ms frame)
    let maxPacketSize: Int = 4000
    var opusData = [UInt8](repeating: 0, count: maxPacketSize)
    
    // Encode PCM to Opus
    let encodedBytes = opus_encode(encoder, pcmData, Int32(opusFrameSize), &opusData, Int32(maxPacketSize))
    
    if encodedBytes < 0 {
      print("AudioEngine: Opus encoding failed: \(encodedBytes)")
      return
    }
    
    // Send encoded data
    let data = Data(bytes: opusData, count: Int(encodedBytes))
    totalSentBytes += data.count
    
    let base64String = data.base64EncodedString()
    sendEvent(withName: "onAudioData", body: base64String)
  }
  
  @objc
  func start() {
    print("AudioEngine: start() called")
    
    // Reset session stats
    sessionStartTime = Date()
    totalSentBytes = 0
    
    setupEngine()
    if !engine.isRunning {
      do {
        print("AudioEngine: Starting engine")
        try engine.start()
        print("AudioEngine: Engine started")
        // Don't call playerNode.play() here! 
        // It will be called automatically when we have buffered enough data
        // in processAudioQueue() -> flushQueueToPlayer() -> playAudioData()
        isRunning = true
      } catch {
        print("Could not start audio engine: \(error)")
      }
    }
  }
  
  @objc
  func stop() {
    if engine.isRunning {
      engine.stop()
      playerNode.stop()
      isRunning = false
      
      // Calculate and log session stats
      if let startTime = sessionStartTime {
          let duration = Date().timeIntervalSince(startTime)
          if duration > 0.5 { // Only log if session was meaningful (>0.5s)
              let bits = Double(totalSentBytes) * 8.0
              let bitrate = bits / duration // bits per second
              let kbps = bitrate / 1000.0
              
              sendLog("AudioEngine: Session ended. Duration: \(String(format: "%.2f", duration))s, Sent: \(totalSentBytes) bytes, Avg Bitrate: \(String(format: "%.2f", kbps)) kbps")
          }
      }
      sessionStartTime = nil
      totalSentBytes = 0
      
      // Stop jitter timer
      jitterTimer?.cancel()
      jitterTimer = nil
      
      queueLock.lock()
      audioQueue.removeAll()
      packetArrivalTimes.removeAll()
      queueLock.unlock()
      
      // Cleanup Opus encoders/decoders
      if let encoder = opusEncoder {
        opus_encoder_destroy(encoder)
        opusEncoder = nil
      }
      if let decoder = opusDecoder {
        opus_decoder_destroy(decoder)
        opusDecoder = nil
      }
      
      print("AudioEngine stopped")
    }
  }
  
  @objc(setVolume:)
  func setVolume(_ volume: NSNumber) {
    self.volume = volume.floatValue
    if playerNode != nil {
      playerNode.volume = self.volume
    }
    print("AudioEngine: Volume set to \(self.volume)")
  }
  
  @objc(setMicGain:)
  func setMicGain(_ gain: NSNumber) {
    micGain = gain.floatValue
    print("AudioEngine: Mic gain set to \(micGain)")
  }
  
  @objc(setCodec:)
  func setCodec(_ codec: String) {
    let wasOpus = useOpus
    useOpus = (codec == "opus")
    print("AudioEngine: Codec set to \(codec)")
    
    if useOpus {
      // Switched to Opus (or reaffirming Opus) -> (re)create encoder/decoder
      // Always setup codec to ensure it's properly initialized
      setupOpusCodec()
    } else if !useOpus && wasOpus {
      // Switched to PCM -> clear any leftover Opus state
      if let encoder = opusEncoder {
        opus_encoder_destroy(encoder)
        opusEncoder = nil
      }
      if let decoder = opusDecoder {
        opus_decoder_destroy(decoder)
        opusDecoder = nil
      }
      // Flush jitter buffer so old Opus packets are not processed as PCM
      queueLock.lock()
      audioQueue.removeAll()
      packetArrivalTimes.removeAll()
      queueLock.unlock()
    }
  }
  
  @objc(setOpusBitrate:)
  func setOpusBitrate(_ bitrate: NSNumber) {
    opusBitrate = bitrate.int32Value
    print("AudioEngine: Opus bitrate set to \(opusBitrate) bps (note: bitrate control requires C wrapper)")
    
    // Note: opus_encoder_ctl is a variadic C function and cannot be called from Swift
    // Would need to create a C wrapper function to actually change the bitrate
    // For now, encoder uses default bitrate (~32kbps for VOIP)
  }
  
  @objc(setPCMBitDepth:)
  func setPCMBitDepth(_ bitDepth: NSNumber) {
    let depth = bitDepth.intValue
    if depth == 8 || depth == 12 || depth == 16 {
      pcmBitDepth = depth
      print("AudioEngine: PCM bit depth set to \(pcmBitDepth)-bit")
    } else {
      print("AudioEngine: Invalid bit depth \(depth), must be 8, 12, or 16")
    }
  }
  
  @objc(queueAudio:)
  func queueAudio(_ base64String: String) {
    guard let data = Data(base64Encoded: base64String) else { return }
    
    // Add to jitter buffer queue with arrival timestamp
    queueLock.lock()
    audioQueue.append((data, Date()))
    
    // Track arrival times for auto-adjust
    let now = Date().timeIntervalSince1970
    packetArrivalTimes.append(now)
    if packetArrivalTimes.count > 100 {
      packetArrivalTimes.removeFirst()
    }
    queueLock.unlock()
    
    // If we think we should decode Opus but the decoder is nil,
    // treat the payload as raw PCM instead of dropping it.
    if useOpus && opusDecoder == nil {
        print("AudioEngine: Opus decoder missing")
        return
    }
    
    // Process queue immediately
    processAudioQueue()
  }
  

  
  private func playAudioData(_ data: Data) {
    // Decode Opus if enabled, otherwise treat as raw PCM
    let int16Buffer: AVAudioPCMBuffer?
    if useOpus, let decoder = opusDecoder {
      int16Buffer = decodeOpusData(data: data)
    } else {
      // Log received PCM data size
      print("AudioEngine: playAudioData received \(data.count) bytes (PCM)")
      int16Buffer = dataToInt16Buffer(data: data)
    }
    
    guard let pcmBuffer = int16Buffer else {
        print("AudioEngine: Failed to create int16Buffer")
        return
    }
    
    // Convert Int16 -> Float32 (Processing)
    guard let processingBuffer = convertToProcessingBuffer(pcmBuffer) else {
        print("AudioEngine: Failed to convert to processing buffer")
        return
    }
    
    print("AudioEngine: Scheduling buffer: \(processingBuffer.frameLength) frames")
    
    // Note: scheduledBufferCount is incremented in flushQueueToPlayer before calling this
    // Don't lock here - would cause deadlock since flushQueueToPlayer holds the lock
    
    playerNode.scheduleBuffer(processingBuffer, at: nil, options: [], completionHandler: { [weak self] in
      // Completion handler called when buffer finishes playing
      DispatchQueue.main.async {
        self?.queueLock.lock()
        self?.scheduledBufferCount -= 1
        let remaining = self?.scheduledBufferCount ?? 0
        let queueHasData = !(self?.audioQueue.isEmpty ?? true)
        
        if remaining == 0 {
            // All buffers have finished playing
            self?.hasScheduledBuffers = false
            self?.sendLog("AudioEngine: All buffers finished, queue has \(self?.audioQueue.count ?? 0) packets")
            
            // If there are still packets in the queue, process them
            if queueHasData {
                self?.sendLog("AudioEngine: Processing remaining packets after playback finished")
            }
        }
        self?.queueLock.unlock()
        
        // Process queue outside the lock to avoid deadlock
        // This ensures remaining packets get played even if no new packets arrive
        if remaining == 0 && queueHasData {
            self?.processAudioQueue()
        }
      }
    })
    
    if !playerNode.isPlaying && engine.isRunning {
      print("AudioEngine: Starting playerNode")
      playerNode.play()
    }
  }
  
  private func adjustBufferSize() {
    // Only decrease buffer if stable for a long time
    // Increase is handled by handleUnderrun
    
    guard Date().timeIntervalSince(lastUnderrunTime) > 30.0 else { return }
    
    // If we haven't had an underrun in 30s, try decreasing buffer slowly
    if jitterBufferMs > 50 {
       jitterBufferMs = max(jitterBufferMs - 10, 50)
       print("AudioEngine: Auto-adjust decreased buffer to \(jitterBufferMs)ms (stable for >30s)")
       lastUnderrunTime = Date() // Reset timer so we don't decrease too fast
       sendEvent(withName: "onJitterBufferChange", body: ["bufferMs": jitterBufferMs, "auto": true])
    }
  }
  
  @objc(setJitterBuffer:)
  func setJitterBuffer(_ ms: NSNumber) {
    let oldMs = jitterBufferMs
    
    // Enforce minimum buffer of 40ms (2 packets)
    let clampedMs = max(40, ms.intValue)
    jitterBufferMs = clampedMs
    
    if clampedMs != ms.intValue {
        print("AudioEngine: Jitter buffer clamped from \(ms)ms to \(clampedMs)ms (minimum: 40ms)")
    } else {
        print("AudioEngine: Jitter buffer set to \(ms)ms")
    }
    
    // If increasing buffer, force re-buffering to ensure delay is applied
    if clampedMs > oldMs {
        queueLock.lock()
        if !isBuffering {
            print("AudioEngine: Buffer increased, forcing re-buffer")
            isBuffering = true
        }
        queueLock.unlock()
    }
  }
  
  @objc(setAutoJitter:)
  func setAutoJitter(_ enabled: NSNumber) {
    isAutoJitter = enabled.boolValue
    print("AudioEngine: Auto-adjust jitter \(isAutoJitter ? "enabled" : "disabled")")
  }
  
  private func decodeOpusData(data: Data) -> AVAudioPCMBuffer? {
    guard let decoder = opusDecoder else {
      print("AudioEngine: Opus decoder not initialized")
      return nil
    }
    
    guard let networkFormat = self.networkFormat else { return nil }
    
    // PCM output buffer (960 samples for 20ms @ 48kHz)
    var pcmData = [Int16](repeating: 0, count: opusFrameSize)
    
    // Decode Opus to PCM
    let decodedSamples = data.withUnsafeBytes { (bytes: UnsafeRawBufferPointer) -> Int32 in
      guard let baseAddress = bytes.baseAddress else { return -1 }
      let opusBytes = baseAddress.assumingMemoryBound(to: UInt8.self)
      return opus_decode(decoder, opusBytes, Int32(data.count), &pcmData, Int32(opusFrameSize), 0)
    }
    
    if decodedSamples < 0 {
      print("AudioEngine: Opus decoding failed: \(decodedSamples)")
      return nil
    }
    
    // Create AVAudioPCMBuffer from decoded PCM data
    let frameCount = UInt32(decodedSamples)
    guard let buffer = AVAudioPCMBuffer(pcmFormat: networkFormat, frameCapacity: frameCount) else { return nil }
    
    buffer.frameLength = frameCount
    if let audioBuffer = buffer.int16ChannelData?.pointee {
      for i in 0..<Int(frameCount) {
        audioBuffer[i] = pcmData[i]
      }
    }
    
    return buffer
  }
  
  private func convertToProcessingBuffer(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    guard let processingFormat = self.processingFormat else { return nil }
    if buffer.format == processingFormat { return buffer }
    
    if outputConverter == nil {
        outputConverter = AVAudioConverter(from: buffer.format, to: processingFormat)
    }
    
    let ratio = processingFormat.sampleRate / buffer.format.sampleRate
    let capacity = UInt32(Double(buffer.frameCapacity) * ratio)
    guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: processingFormat, frameCapacity: capacity) else { return nil }
    
    var error: NSError? = nil
    let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
      outStatus.pointee = .haveData
      return buffer
    }
    
    outputConverter.convert(to: outputBuffer, error: &error, withInputFrom: inputBlock)
    return error == nil ? outputBuffer : nil
  }
  
  private func dataToInt16Buffer(data: Data) -> AVAudioPCMBuffer? {
    guard !data.isEmpty else { return nil }
    guard let networkFormat = self.networkFormat else { return nil }
    
    var pcmData: [Int16]
    
    if pcmBitDepth == 8 {
        pcmData = expandFrom8Bit(data)
    } else if pcmBitDepth == 12 {
        pcmData = expandFrom12Bit(data)
    } else {
        // 16-bit
        pcmData = data.withUnsafeBytes { (rawBufferPointer: UnsafeRawBufferPointer) -> [Int16] in
            if let baseAddress = rawBufferPointer.baseAddress {
                let source = baseAddress.assumingMemoryBound(to: Int16.self)
                let count = Int(data.count) / 2
                return Array(UnsafeBufferPointer(start: source, count: count))
            }
            return []
        }
    }
    
    let frameCount = UInt32(pcmData.count)
    guard let buffer = AVAudioPCMBuffer(pcmFormat: networkFormat, frameCapacity: frameCount) else { return nil }
    
    buffer.frameLength = frameCount
    if let audioBuffer = buffer.int16ChannelData?.pointee {
        for i in 0..<Int(frameCount) {
            audioBuffer[i] = pcmData[i]
        }
    }
    
    return buffer
  }
  
  private func expandFrom8Bit(_ data: Data) -> [Int16] {
    var result: [Int16] = []
    result.reserveCapacity(data.count)
    
    for byte in data {
        let val = Int(byte) // Unsigned 8-bit
        // Convert back to 16-bit signed: (val - 128) << 8
        // Use truncatingIfNeeded to avoid potential traps, though mathematically safe
        let sample = Int16(truncatingIfNeeded: (val - 128) << 8)
        result.append(sample)
    }
    return result
  }
  
  private func expandFrom12Bit(_ data: Data) -> [Int16] {
    // 3 bytes -> 2 samples
    let sampleCount = (data.count * 2) / 3
    var result: [Int16] = []
    result.reserveCapacity(sampleCount)
    
    let bytes = [UInt8](data)
    for i in stride(from: 0, to: bytes.count - 2, by: 3) {
        let b1 = Int(bytes[i])
        let b2 = Int(bytes[i+1])
        let b3 = Int(bytes[i+2])
        
        // Unpack
        // val1: [b2_low4][b1]
        // val2: [b3][b2_high4]
        
        var val1 = b1 | ((b2 & 0x0F) << 8)
        var val2 = ((b2 & 0xF0) >> 4) | (b3 << 4)
        
        // Sign extension
        if (val1 & 0x800) != 0 { val1 |= 0xF000 }
        if (val2 & 0x800) != 0 { val2 |= 0xF000 }
        
        // Shift left 4 to get 16-bit
        result.append(Int16(truncatingIfNeeded: val1 << 4))
        result.append(Int16(truncatingIfNeeded: val2 << 4))
    }
    return result
  }
}
