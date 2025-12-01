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
  
  // Opus codec support
  private var useOpus: Bool = true // Default to Opus
  private var opusEncoder: OpaquePointer?
  private var opusDecoder: OpaquePointer?
  private let opusFrameSize: Int = 960  // 20ms at 48kHz
  private var opusBitrate: Int32 = 32000 // 32 kbps (Normal quality)
  
  override init() {
    super.init()
    print("AudioEngine initialized")
  }
  
  override func supportedEvents() -> [String]! {
    return ["onAudioData"]
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
      try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker, .mixWithOthers])
      try session.setActive(true)
      
      // Set preferred sample rate and IO buffer duration for better quality
      try session.setPreferredSampleRate(48000)
      try session.setPreferredIOBufferDuration(0.005) // 5ms for low latency
      
      print("AudioEngine: AVAudioSession active")
    } catch {
      print("Failed to setup audio session: \(error)")
    }
    
    engine = AVAudioEngine()
    playerNode = AVAudioPlayerNode()
    
    // Set player volume to maximum for louder playback
    playerNode.volume = 2.0 // Boost volume (1.0 is normal, 2.0 is double)
    
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
    inputNode.installTap(onBus: 0, bufferSize: 2048, format: inputFormat) { [weak self] (buffer, time) in
      guard let self = self, self.isRunning else { return }
      self.processInputBuffer(buffer)
    }
    
    // Setup Opus encoder/decoder if enabled
    if useOpus {
      setupOpusCodec()
    }
    
    print("AudioEngine: setupEngine completed")
  }
  
  private func setupOpusCodec() {
    print("AudioEngine: Opus not yet supported on iOS - using PCM")
    useOpus = false
    // TODO: Implement Opus codec for iOS
    // Will need to either:
    // 1. Build Opus from source and add to Xcode project
    // 2. Find a working CocoaPods pod
    // 3. Use a pre-built xcframework
  }
  
  private func processInputBuffer(_ buffer: AVAudioPCMBuffer) {
    // Convert Input (Float32) -> Network (Int16)
    guard let networkFormat = self.networkFormat else { return }
    
    if buffer.format == networkFormat {
      self.sendBuffer(buffer)
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
      self.sendBuffer(outputBuffer)
    }
  }
  
  private func sendBuffer(_ buffer: AVAudioPCMBuffer) {
    guard let channelData = buffer.int16ChannelData else { return }
    
    let channelDataPointer = channelData.pointee
    let frameLength = Int(buffer.frameLength)
    
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
    
    // Encode with Opus if enabled, otherwise send raw PCM
    if useOpus, let encoder = opusEncoder {
      encodeAndSendOpus(pcmData: pcmData)
    } else {
      // Send raw PCM (Int16)
      let data = Data(bytes: pcmData, count: frameLength * 2)
      let base64String = data.base64EncodedString()
      sendEvent(withName: "onAudioData", body: base64String)
    }
  }
  
  private func encodeAndSendOpus(pcmData: [Int16]) {
    // TODO: Implement Opus encoding for iOS
    print("AudioEngine: Opus encoding not yet supported on iOS")
    // For now, just send as PCM
    let data = Data(bytes: pcmData, count: pcmData.count * 2)
    let base64String = data.base64EncodedString()
    sendEvent(withName: "onAudioData", body: base64String)
  }
  
  @objc
  func start() {
    print("AudioEngine: start() called")
    setupEngine()
    if !engine.isRunning {
      do {
        print("AudioEngine: Starting engine")
        try engine.start()
        print("AudioEngine: Engine started")
        playerNode.play()
        print("AudioEngine: PlayerNode playing")
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
      
      // TODO: Cleanup Opus encoders/decoders when implemented
      // if let encoder = opusEncoder {
      //   opus_encoder_destroy(encoder)
      //   opusEncoder = nil
      // }
      // if let decoder = opusDecoder {
      //   opus_decoder_destroy(decoder)
      //   opusDecoder = nil
      // }
      
      print("AudioEngine stopped")
    }
  }
  
  @objc(setVolume:)
  func setVolume(_ volume: NSNumber) {
    let vol = volume.floatValue
    playerNode.volume = vol
    print("AudioEngine: Volume set to \(vol)")
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
    
    // If switching to Opus and not already setup, create encoder/decoder
    if useOpus && !wasOpus && opusEncoder == nil {
      setupOpusCodec()
    }
  }
  
  @objc(setOpusBitrate:)
  func setOpusBitrate(_ bitrate: NSNumber) {
    opusBitrate = bitrate.int32Value
    print("AudioEngine: Opus bitrate set to \(opusBitrate) (iOS: PCM mode only)")
    
    // TODO: Update encoder bitrate when Opus is implemented
    // if let encoder = opusEncoder {
    //   let rawEncoder = UnsafeMutableRawPointer(encoder)
    //   OpusHelper.encoderSetBitrate(rawEncoder, bitrate: opusBitrate)
    // }
  }
  
  @objc(queueAudio:)
  func queueAudio(_ base64String: String) {
    guard let data = Data(base64Encoded: base64String) else { return }
    
    // Decode Opus if enabled, otherwise treat as raw PCM
    let int16Buffer: AVAudioPCMBuffer?
    if useOpus, let decoder = opusDecoder {
      int16Buffer = decodeOpusData(data: data)
    } else {
      int16Buffer = dataToInt16Buffer(data: data)
    }
    
    guard let pcmBuffer = int16Buffer else { return }
    
    // Convert Int16 -> Float32 (Processing)
    guard let processingBuffer = convertToProcessingBuffer(pcmBuffer) else { return }
    
    playerNode.scheduleBuffer(processingBuffer, at: nil, options: [], completionHandler: nil)
    
    if !playerNode.isPlaying && engine.isRunning {
        playerNode.play()
    }
  }
  
  private func decodeOpusData(data: Data) -> AVAudioPCMBuffer? {
    // TODO: Implement Opus decoding for iOS
    print("AudioEngine: Opus decoding not yet supported on iOS")
    return nil
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
    guard let networkFormat = self.networkFormat else { return nil }
    
    let frameCount = UInt32(data.count) / 2 // 2 bytes per sample
    guard let buffer = AVAudioPCMBuffer(pcmFormat: networkFormat, frameCapacity: frameCount) else { return nil }
    
    buffer.frameLength = frameCount
    let audioBuffer = buffer.int16ChannelData?.pointee
    
    data.withUnsafeBytes { (rawBufferPointer: UnsafeRawBufferPointer) in
      if let baseAddress = rawBufferPointer.baseAddress, let audioBuffer = audioBuffer {
        let source = baseAddress.assumingMemoryBound(to: Int16.self)
        let count = Int(data.count) / 2
        for i in 0..<count {
            audioBuffer[i] = source[i]
        }
      }
    }
    
    return buffer
  }
}
